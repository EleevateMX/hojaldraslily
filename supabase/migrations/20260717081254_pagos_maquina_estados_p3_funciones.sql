create or replace function public.fn_generar_codigo_corto()
returns text
language sql
as $function$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$function$;

create or replace function public.fn_confirmar_venta(p_orden_id uuid, p_pago_id uuid)
returns ordenes
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_orden ordenes;
  v_pago pagos;
  v_ya_confirmado uuid;
begin
  select * into v_orden from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden % no existe', p_orden_id;
  end if;

  select * into v_pago from pagos where id = p_pago_id and orden_id = p_orden_id;
  if not found then
    raise exception 'El pago % no pertenece a la orden %', p_pago_id, p_orden_id;
  end if;
  if v_pago.estado_transaccion <> 'authorized' then
    raise exception 'El pago % no está autorizado (estado=%) — no se puede confirmar la venta',
      p_pago_id, v_pago.estado_transaccion;
  end if;

  insert into venta_confirmaciones (orden_id, pago_id) values (p_orden_id, p_pago_id)
    on conflict (orden_id) do nothing
    returning orden_id into v_ya_confirmado;

  if v_ya_confirmado is null then
    return v_orden;
  end if;

  update ordenes
  set estado_pago_orden = 'paid', pagado = true, metodo_pago = v_pago.metodo, updated_at = now()
  where id = p_orden_id
  returning * into v_orden;

  return v_orden;
end;
$function$;

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
    estado_pago_orden, expira_en
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'pending_payment', v_expira_en
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

create or replace function public.fn_crear_orden_kiosko_caja(
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_items jsonb,
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
  v_expira_minutos integer;
  v_codigo text;
  v_intento integer := 0;
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

  select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;

  loop
    v_codigo := fn_generar_codigo_corto();
    exit when not exists (select 1 from ordenes where codigo_corto = v_codigo);
    v_intento := v_intento + 1;
    if v_intento > 5 then
      raise exception 'No se pudo generar un código corto único, intenta de nuevo';
    end if;
  end loop;

  insert into ordenes (
    sucursal_id, almacen_id, canal, cliente_id, descuento, total,
    estado_pago_orden, expira_en, codigo_corto
  ) values (
    p_sucursal_id, p_almacen_id, 'kiosko', p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'awaiting_counter_payment', now() + make_interval(mins => coalesce(v_expira_minutos, 15)), v_codigo
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

  if v_orden.estado_pago_orden not in
     ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown') then
    raise exception 'La orden % no está en un estado que permita cobro (estado=%)',
      p_orden_id, v_orden.estado_pago_orden;
  end if;

  if abs(p_monto - v_orden.total) > v_tolerancia then
    raise exception 'El monto % no coincide con el total de la orden (%)', p_monto, v_orden.total;
  end if;

  begin
    insert into pagos (
      orden_id, metodo, monto, estado, estado_transaccion, proveedor,
      referencia, autorizado_por, idempotency_key
    )
    values (
      p_orden_id, p_metodo, p_monto, 'aprobado', 'authorized',
      case when p_metodo = 'clip' then 'clip_manual' else 'manual' end,
      p_referencia, p_autorizado_por, p_idempotency_key
    )
    returning * into v_pago;
  exception when unique_violation then
    select * into v_pago from pagos where orden_id = p_orden_id and estado = 'aprobado' limit 1;
    return v_pago;
  end;

  perform fn_confirmar_venta(p_orden_id, v_pago.id);

  return v_pago;
end;
$function$;

grant execute on function public.fn_generar_codigo_corto() to anon, authenticated;
grant execute on function public.fn_confirmar_venta(uuid, uuid) to anon, authenticated;
grant execute on function public.fn_crear_orden_kiosko_caja(uuid, uuid, jsonb, uuid, numeric) to anon, authenticated;