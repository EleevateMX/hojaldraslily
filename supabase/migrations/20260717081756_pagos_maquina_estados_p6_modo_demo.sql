alter table ordenes add column if not exists es_demo boolean not null default false;
create index if not exists idx_ordenes_es_demo on ordenes (es_demo) where es_demo;

create or replace function public.fn_descontar_inventario_por_orden()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and NEW.almacen_id is not null and not NEW.es_demo then
    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select r.insumo_id, NEW.almacen_id, -sum(r.cantidad * oi.cantidad), 'venta', NEW.id,
           'Venta folio ' || NEW.folio
    from orden_items oi
    join recetas r on r.producto_id = oi.producto_id
    where oi.orden_id = NEW.id
    group by r.insumo_id;

    update inventario_stock s
    set stock_actual = s.stock_actual - sub.total
    from (
      select r.insumo_id, sum(r.cantidad * oi.cantidad) as total
      from orden_items oi
      join recetas r on r.producto_id = oi.producto_id
      where oi.orden_id = NEW.id
      group by r.insumo_id
    ) sub
    where s.insumo_id = sub.insumo_id and s.almacen_id = NEW.almacen_id;

    if NEW.metodo_pago is not null then
      insert into ventas (orden_id, total, metodo_pago)
      values (NEW.id, NEW.total, NEW.metodo_pago)
      on conflict (orden_id) do nothing;
    end if;
  end if;
  return NEW;
end;
$function$;

create or replace function public.fn_crear_pedidos_cocina()
returns trigger
language plpgsql
security definer set search_path = public
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and not NEW.es_demo then
    insert into pedidos_cocina (orden_id, cocina_id)
    select distinct NEW.id,
      coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    where oi.orden_id = NEW.id
    on conflict (orden_id, cocina_id) do nothing;

    insert into cocina_items (pedido_id, orden_item_id, producto_id, cantidad, personalizacion)
    select pc.id, oi.id, oi.producto_id, oi.cantidad, oi.personalizacion
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    join pedidos_cocina pc on pc.orden_id = NEW.id
      and pc.cocina_id = coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    where oi.orden_id = NEW.id
    on conflict (orden_item_id) do nothing;
  end if;
  return NEW;
end;
$function$;

create or replace function public.fn_acumular_mancuernas()
returns trigger language plpgsql security definer set search_path = public as $function$
declare gana integer; saldo integer; activos integer;
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and NEW.cliente_id is not null and not NEW.es_demo then
    gana := least(100, floor(NEW.total / 10.0)::int);
    if gana > 0 then
      update clientes set mancuernas = mancuernas + gana where id = NEW.cliente_id returning mancuernas into saldo;
      insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
        values (NEW.cliente_id, gana, 'ganadas', NEW.id, 'Compra folio ' || NEW.folio);
      loop
        select count(*) into activos from cupones where cliente_id = NEW.cliente_id and estado='activo' and tipo<>'cumpleanos';
        exit when saldo < 100 or activos >= 5;
        insert into cupones (cliente_id, tipo, vence_en) values (NEW.cliente_id, 'mancuernas', now() + interval '1 year');
        update clientes set mancuernas = mancuernas - 100 where id = NEW.cliente_id returning mancuernas into saldo;
        insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
          values (NEW.cliente_id, -100, 'canje', NEW.id, 'Cupón generado por 100 mancuernas');
      end loop;
    end if;
  end if;
  return NEW;
end;
$function$;

create or replace view vw_corte_resumen as
select
  cc.id as corte_id,
  cc.caja_id,
  ca.nombre as caja,
  cc.estado,
  cc.abierto_en,
  cc.cerrado_en,
  cc.fondo_inicial,
  cc.efectivo_contado,
  count(distinct o.id) as num_ordenes,
  coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as total_efectivo,
  coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'), 0) as total_tarjeta,
  coalesce(sum(p.monto) filter (where p.metodo = 'clip'), 0) as total_clip,
  coalesce(sum(p.monto) filter (where p.metodo = 'cortesia'), 0) as total_cortesia,
  coalesce(sum(p.monto) filter (where p.metodo = 'otro'), 0) as total_otro,
  coalesce(sum(p.monto), 0) as total_pagado,
  cc.fondo_inicial + coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as efectivo_esperado,
  cc.efectivo_contado - (cc.fondo_inicial + coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0)) as diferencia
from caja_cortes cc
join cajas ca on ca.id = cc.caja_id
left join ordenes o on o.corte_id = cc.id and o.es_demo = false
left join pagos p on p.orden_id = o.id and p.estado = 'aprobado'
group by cc.id, ca.nombre;

create or replace function public.fn_crear_orden(
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_canal canal_orden,
  p_items jsonb,
  p_corte_id uuid default null,
  p_empleado_id uuid default null,
  p_cliente_id uuid default null,
  p_descuento numeric default 0,
  p_es_demo boolean default false
) returns ordenes
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_total numeric;
  v_item jsonb;
  v_precio numeric;
  v_cantidad integer;
  v_producto_id uuid;
  v_expira_minutos integer;
  v_expira_en timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Línea de orden inválida: %', v_item;
    end if;
    select precio into v_precio from productos where id = v_producto_id and activo = true;
    if not found then
      raise exception 'Producto % no existe o no está activo', v_producto_id;
    end if;
    v_subtotal := v_subtotal + v_precio * v_cantidad;
  end loop;

  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_descuento, 0)));

  if p_canal = 'kiosko' then
    select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;
    v_expira_en := now() + make_interval(mins => coalesce(v_expira_minutos, 15));
  end if;

  insert into ordenes (
    sucursal_id, almacen_id, canal, corte_id, empleado_id, cliente_id, descuento, total,
    estado_pago_orden, expira_en, es_demo
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'pending_payment', v_expira_en, coalesce(p_es_demo, false)
  ) returning * into v_orden;

  insert into orden_items (orden_id, producto_id, cantidad, precio_unitario, personalizacion)
  select
    v_orden.id,
    (item->>'producto_id')::uuid,
    (item->>'cantidad')::integer,
    (select precio from productos where id = (item->>'producto_id')::uuid),
    nullif(item->>'personalizacion', '')
  from jsonb_array_elements(p_items) item;

  return v_orden;
end;
$function$;

grant execute on function public.fn_crear_orden(uuid, uuid, canal_orden, jsonb, uuid, uuid, uuid, numeric, boolean) to anon, authenticated;