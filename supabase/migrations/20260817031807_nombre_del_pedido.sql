-- ============================================================================
-- El pedido lleva nombre
-- ============================================================================
-- La etiqueta reparte por nombre (es lo mas grande que imprime), pero solo lo
-- tenia si el cliente se identificaba en lealtad; si no, salia el folio. La
-- caja necesita preguntar "a nombre de quien?" sin dar de alta a nadie:
-- un nombre por pedido, sin telefono, sin ficha.
--
-- `nombre_cliente` es del PEDIDO, no del cliente: si ademas se identifico en
-- lealtad, el nombre tecleado gana en la etiqueta (es la intencion de ESTA
-- orden), y las mancuernas siguen llegando a su ficha por cliente_id.
-- ============================================================================

alter table ordenes add column if not exists nombre_cliente text;

comment on column ordenes.nombre_cliente is
  'A nombre de quien va el pedido (para gritar/etiquetar). Independiente de la ficha de lealtad.';

-- fn_crear_orden con nombre (sobrecarga de 9 parametros + wrapper)
create or replace function fn_crear_orden(
  p_sucursal_id uuid,
  p_almacen_id  uuid,
  p_canal       canal_orden,
  p_items       jsonb,
  p_corte_id    uuid    default null,
  p_empleado_id uuid    default null,
  p_cliente_id  uuid    default null,
  p_descuento   numeric default 0,
  p_es_demo     boolean default false,
  p_nombre_cliente text default null
) returns ordenes
language plpgsql
security definer
set search_path = public
as $$
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
  v_repetida text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  select linea into v_repetida
  from (
    select nullif(item->>'linea','') as linea
    from jsonb_array_elements(p_items) item
  ) t
  where linea is not null
  group by linea having count(*) > 1
  limit 1;
  if v_repetida is not null then
    raise exception 'La orden trae dos lineas con la misma etiqueta "%".', v_repetida;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Linea de orden invalida: %', v_item;
    end if;
    if nullif(v_item->>'linea','') is not null
       and nullif(v_item->>'linea','') = nullif(v_item->>'padre_linea','') then
      raise exception 'Una linea no puede acompanarse a si misma: %', v_item->>'linea';
    end if;
    select precio into v_precio from productos where id = v_producto_id and activo = true;
    if not found then
      raise exception 'Producto % no existe o no esta activo', v_producto_id;
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
    estado_pago_orden, expira_en, es_demo, nombre_cliente
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'pending_payment', v_expira_en, coalesce(p_es_demo, false),
    nullif(trim(p_nombre_cliente), '')
  ) returning * into v_orden;

  with entrada as (
    select
      gen_random_uuid()                  as nuevo_id,
      nullif(item->>'linea', '')         as linea,
      nullif(item->>'padre_linea', '')   as padre_linea,
      item
    from jsonb_array_elements(p_items) item
  )
  insert into orden_items (
    id, orden_id, producto_id, cantidad, precio_unitario, personalizacion, padre_item_id
  )
  select
    e.nuevo_id,
    v_orden.id,
    (e.item->>'producto_id')::uuid,
    (e.item->>'cantidad')::integer,
    (select precio from productos where id = (e.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$$;

-- Las sobrecargas viejas delegan: un solo cuerpo que mantener.
create or replace function fn_crear_orden(
  p_sucursal_id uuid, p_almacen_id uuid, p_canal canal_orden, p_items jsonb,
  p_corte_id uuid default null, p_empleado_id uuid default null,
  p_cliente_id uuid default null, p_descuento numeric default 0,
  p_es_demo boolean default false
) returns ordenes
language plpgsql security definer set search_path = public
as $$
begin
  return fn_crear_orden(p_sucursal_id, p_almacen_id, p_canal, p_items,
    p_corte_id, p_empleado_id, p_cliente_id, p_descuento, p_es_demo, null);
end;
$$;

create or replace function fn_crear_orden(
  p_sucursal_id uuid, p_almacen_id uuid, p_canal canal_orden, p_items jsonb,
  p_corte_id uuid default null, p_empleado_id uuid default null,
  p_cliente_id uuid default null, p_descuento numeric default 0
) returns ordenes
language plpgsql security definer set search_path = public
as $$
begin
  return fn_crear_orden(p_sucursal_id, p_almacen_id, p_canal, p_items,
    p_corte_id, p_empleado_id, p_cliente_id, p_descuento, false, null);
end;
$$;

-- El payload de la comanda: el nombre tecleado gana sobre el de lealtad
-- (es la intencion de ESTA orden); si no hay ninguno, el agente ya usa folio.
create or replace function fn_encolar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_printer_id uuid;
begin
  select p.id into v_printer_id from impresoras p where p.cocina_id = NEW.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', NEW.created_at,
    'cajero', e.nombre,
    'cliente', coalesce(o.nombre_cliente, cl.nombre),
    'items', fn_items_comanda(NEW.id)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = NEW.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = NEW.orden_id;

  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (NEW.orden_id, NEW.id, NEW.cocina_id, v_printer_id, 'comanda', v_payload, NEW.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return NEW;
end;
$$;

create or replace function fn_encolar_comanda_para_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_printer_id uuid;
  v_pedido pedidos_cocina;
begin
  select * into v_pedido from pedidos_cocina where id = p_pedido_id;
  if not found then
    return;
  end if;

  select p.id into v_printer_id from impresoras p where p.cocina_id = v_pedido.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', v_pedido.created_at,
    'cajero', e.nombre,
    'cliente', coalesce(o.nombre_cliente, cl.nombre),
    'items', fn_items_comanda(v_pedido.id)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = v_pedido.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = v_pedido.orden_id;

  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (v_pedido.orden_id, v_pedido.id, v_pedido.cocina_id, v_printer_id, 'comanda', v_payload, v_pedido.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
end;
$$;

-- El modo "pagar en caja" tambien pregunta el nombre.
create or replace function fn_crear_orden_kiosko_caja(
  p_sucursal_id uuid,
  p_almacen_id  uuid,
  p_items       jsonb,
  p_cliente_id  uuid    default null,
  p_descuento   numeric default 0,
  p_nombre_cliente text default null
) returns ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_total numeric;
  v_item jsonb;
  v_precio numeric;
  v_cantidad integer;
  v_producto_id uuid;
  v_expira_minutos integer;
  v_codigo text;
  v_intento integer := 0;
  v_repetida text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  select linea into v_repetida
  from (select nullif(item->>'linea','') as linea from jsonb_array_elements(p_items) item) t
  where linea is not null
  group by linea having count(*) > 1
  limit 1;
  if v_repetida is not null then
    raise exception 'La orden trae dos lineas con la misma etiqueta "%".', v_repetida;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Linea de orden invalida: %', v_item;
    end if;
    if nullif(v_item->>'linea','') is not null
       and nullif(v_item->>'linea','') = nullif(v_item->>'padre_linea','') then
      raise exception 'Una linea no puede acompanarse a si misma: %', v_item->>'linea';
    end if;
    select precio into v_precio from productos where id = v_producto_id and activo = true;
    if not found then
      raise exception 'Producto % no existe o no esta activo', v_producto_id;
    end if;
    v_subtotal := v_subtotal + v_precio * v_cantidad;
  end loop;

  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_descuento, 0)));

  select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;

  loop
    v_codigo := fn_generar_codigo_corto();
    exit when not exists (select 1 from ordenes where codigo_corto = v_codigo);
    v_intento := v_intento + 1;
    if v_intento > 5 then
      raise exception 'No se pudo generar un codigo corto unico, intenta de nuevo';
    end if;
  end loop;

  insert into ordenes (
    sucursal_id, almacen_id, canal, cliente_id, descuento, total,
    estado_pago_orden, expira_en, codigo_corto, nombre_cliente
  ) values (
    p_sucursal_id, p_almacen_id, 'kiosko', p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'awaiting_counter_payment', now() + make_interval(mins => coalesce(v_expira_minutos, 15)), v_codigo,
    nullif(trim(p_nombre_cliente), '')
  ) returning * into v_orden;

  with entrada as (
    select
      gen_random_uuid()                as nuevo_id,
      nullif(item->>'linea', '')       as linea,
      nullif(item->>'padre_linea', '') as padre_linea,
      item
    from jsonb_array_elements(p_items) item
  )
  insert into orden_items (
    id, orden_id, producto_id, cantidad, precio_unitario, personalizacion, padre_item_id
  )
  select
    e.nuevo_id,
    v_orden.id,
    (e.item->>'producto_id')::uuid,
    (e.item->>'cantidad')::integer,
    (select precio from productos where id = (e.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$$;

create or replace function fn_crear_orden_kiosko_caja(
  p_sucursal_id uuid, p_almacen_id uuid, p_items jsonb,
  p_cliente_id uuid default null, p_descuento numeric default 0
) returns ordenes
language plpgsql security definer set search_path = public
as $$
begin
  return fn_crear_orden_kiosko_caja(p_sucursal_id, p_almacen_id, p_items,
    p_cliente_id, p_descuento, null);
end;
$$;