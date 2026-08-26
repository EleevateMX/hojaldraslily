-- Las dos funciones de creación de órdenes cobran cada línea con
-- fn_precio_linea: si el par (producto padre, extra) trae sobreprecio en
-- producto_extras.precio, manda ese; si no, el precio del producto. Es lo
-- que hace que la leche cueste $10 en el americano y $0 en el shake.

create or replace function public.fn_crear_orden(
  p_sucursal_id uuid, p_almacen_id uuid, p_canal canal_orden, p_items jsonb,
  p_corte_id uuid default null, p_empleado_id uuid default null,
  p_cliente_id uuid default null, p_descuento numeric default 0,
  p_es_demo boolean default false, p_nombre_cliente text default null
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
    if not exists (select 1 from productos where id = v_producto_id and activo = true) then
      raise exception 'Producto % no existe o no esta activo', v_producto_id;
    end if;
  end loop;

  -- El subtotal resuelve el padre de cada línea para aplicar el
  -- sobreprecio por producto. Mismo cálculo que usa el insert de abajo.
  with entrada as (
    select nullif(item->>'linea','') as linea,
           nullif(item->>'padre_linea','') as padre_linea,
           item
    from jsonb_array_elements(p_items) item
  )
  select coalesce(sum(
    fn_precio_linea(
      (e.item->>'producto_id')::uuid,
      (padre.item->>'producto_id')::uuid
    ) * (e.item->>'cantidad')::integer), 0)
  into v_subtotal
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

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
    fn_precio_linea((e.item->>'producto_id')::uuid, (padre.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$$;

create or replace function public.fn_crear_orden_kiosko_caja(
  p_sucursal_id uuid, p_almacen_id uuid, p_items jsonb,
  p_cliente_id uuid default null, p_descuento numeric default 0,
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
    if not exists (select 1 from productos where id = v_producto_id and activo = true) then
      raise exception 'Producto % no existe o no esta activo', v_producto_id;
    end if;
  end loop;

  with entrada as (
    select nullif(item->>'linea','') as linea,
           nullif(item->>'padre_linea','') as padre_linea,
           item
    from jsonb_array_elements(p_items) item
  )
  select coalesce(sum(
    fn_precio_linea(
      (e.item->>'producto_id')::uuid,
      (padre.item->>'producto_id')::uuid
    ) * (e.item->>'cantidad')::integer), 0)
  into v_subtotal
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

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
    fn_precio_linea((e.item->>'producto_id')::uuid, (padre.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$$;