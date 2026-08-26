-- El modo "pagar en caja" arma la orden por su propia via (necesita el codigo
-- corto), asi que tambien tiene que respetar el parentesco: si no, un pedido
-- levantado por ese camino imprimiria los extras sueltos otra vez.
create or replace function fn_crear_orden_kiosko_caja(
  p_sucursal_id uuid,
  p_almacen_id  uuid,
  p_items       jsonb,
  p_cliente_id  uuid    default null,
  p_descuento   numeric default 0
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
    estado_pago_orden, expira_en, codigo_corto
  ) values (
    p_sucursal_id, p_almacen_id, 'kiosko', p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'awaiting_counter_payment', now() + make_interval(mins => coalesce(v_expira_minutos, 15)), v_codigo
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