alter table pagos add column if not exists idempotency_key uuid;

create unique index if not exists uq_pagos_idempotency_key
  on pagos (idempotency_key) where idempotency_key is not null;

create unique index if not exists uq_pagos_un_aprobado_por_orden
  on pagos (orden_id) where estado = 'aprobado';

create or replace function public.fn_crear_orden(
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_canal canal_orden,
  p_items jsonb,
  p_corte_id uuid default null,
  p_empleado_id uuid default null,
  p_cliente_id uuid default null,
  p_descuento numeric default 0
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

  insert into ordenes (
    sucursal_id, almacen_id, canal, corte_id, empleado_id, cliente_id, descuento, total
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total
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

create or replace function public.fn_cobrar_orden(
  p_orden_id uuid,
  p_metodo metodo_pago,
  p_monto numeric,
  p_referencia text default null,
  p_autorizado_por uuid default null,
  p_idempotency_key uuid default null
) returns pagos
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_orden ordenes;
  v_pago pagos;
  v_tolerancia constant numeric := 0.01;
begin
  select * into v_orden from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden % no existe', p_orden_id;
  end if;

  if p_idempotency_key is not null then
    select * into v_pago from pagos
      where orden_id = p_orden_id and idempotency_key = p_idempotency_key;
    if found then
      return v_pago;
    end if;
  end if;

  select * into v_pago from pagos where orden_id = p_orden_id and estado = 'aprobado' limit 1;
  if found then
    return v_pago;
  end if;

  if abs(p_monto - v_orden.total) > v_tolerancia then
    raise exception 'El monto % no coincide con el total de la orden (%)', p_monto, v_orden.total;
  end if;

  begin
    insert into pagos (orden_id, metodo, monto, estado, referencia, autorizado_por, idempotency_key)
    values (p_orden_id, p_metodo, p_monto, 'aprobado', p_referencia, p_autorizado_por, p_idempotency_key)
    returning * into v_pago;
  exception when unique_violation then
    select * into v_pago from pagos where orden_id = p_orden_id and estado = 'aprobado' limit 1;
  end;

  return v_pago;
end;
$function$;

grant execute on function public.fn_crear_orden(uuid, uuid, canal_orden, jsonb, uuid, uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.fn_cobrar_orden(uuid, metodo_pago, numeric, text, uuid, uuid) to anon, authenticated;