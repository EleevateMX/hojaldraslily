-- `(fn_crear_orden(...)).*` crea VEINTIDÓS órdenes, no una.
--
-- Lo encontró la prueba de punta a punta de `fn_encargo_entregar_con_venta`,
-- no la lectura del código: se contaron las filas de `ordenes` antes y después
-- y habían entrado 22 en vez de 1.
--
-- Qué pasa. `fn_crear_orden` devuelve un `ordenes` —un **compuesto**, no un
-- conjunto— y esto:
--
--     select (fn_crear_orden(...)).* into v_fila;
--
-- expande el `.*` a una lista de columnas, y **cada columna lleva su propia
-- copia de la llamada**. `ordenes` tiene veintidós columnas, así que Postgres
-- ejecuta la función veintidós veces: veintidós órdenes con sus renglones,
-- veintiuna huérfanas. Es el mismo efecto por el que no se escribe
-- `(f(x)).a, (f(x)).b` en una consulta.
--
-- La forma correcta en plpgsql es una asignación, que evalúa una sola vez:
--
--     v_fila := fn_crear_orden(...);
--
-- Qué tan grave fue. `fn_encargo_cobrar` traía el defecto desde agosto, así
-- que cada encargo cobrado dejó ~21 órdenes de más. **No descuadraban el
-- corte**: nacen con `pagado = false` y el corte suma pagos, no órdenes.
-- Tampoco se ven en ninguna pantalla —«Pedidos de kiosko» lista solo
-- `awaiting_counter_payment`, y estas quedan en `pending_payment`—. Lo que
-- sí hacían era ensuciar `ordenes` y `orden_items` (219 filas al día de hoy)
-- y gastar folios.
--
-- Las huérfanas que ya existen **no se borran aquí**: la regla del repo es
-- que las migraciones son aditivas, y borrar filas de `ordenes` no se
-- deshace. Quedan como lo que son, órdenes en borrador que nadie cobró. Si la
-- casa quiere limpiarlas, es un `delete` acotado a
-- `estado_pago_orden = 'pending_payment' and not pagado and created_at < ...`
-- y se decide aparte, mirando antes qué se va.

create or replace function public.fn_encargo_cobrar(
  p_encargo_id uuid,
  p_metodo text default 'efectivo'
) returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text; v_orden uuid; v_total numeric; v_items jsonb;
  v_corte uuid; v_suc uuid; v_alm uuid; v_cliente text; v_fila ordenes%rowtype;
  v_anticipo numeric; v_saldo numeric;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cobrar.';
  end if;

  select estado, cliente, anticipo into v_estado, v_cliente, v_anticipo
    from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  if v_estado <> 'apartado' then
    raise exception 'Ese encargo ya no esta apartado (esta %).', v_estado;
  end if;

  select jsonb_agg(jsonb_build_object('producto_id', ei.producto_id, 'cantidad', ei.cantidad))
    into v_items
    from encargo_items ei where ei.encargo_id = p_encargo_id;

  select cc.id, c.sucursal_id into v_corte, v_suc
    from caja_cortes cc
    join cajas c on c.id = cc.caja_id
   where cc.estado = 'abierta'
   order by cc.abierto_en desc limit 1;

  select id into v_alm from almacenes where activo order by nombre limit 1;

  -- UNA asignacion, no `select (fn_crear_orden(...)).* into v_fila`.
  --
  -- `fn_crear_orden` devuelve un `ordenes` (compuesto, no un conjunto), y
  -- `(f(...)).*` en una lista de seleccion se expande a UNA COPIA DE LA
  -- LLAMADA POR COLUMNA: veintidos columnas, veintidos ordenes creadas con
  -- sus renglones, veintiuna de ellas huerfanas y sin pagar.
  v_fila := fn_crear_orden(v_suc, v_alm, 'pos'::canal_orden, v_items,
                           v_corte, null, null, 0, false, v_cliente);
  v_orden := v_fila.id;
  v_total := v_fila.total;

  -- El saldo nunca es negativo: si alguien anticipo de mas (no deberia, lo
  -- impide fn_encargo_anticipo), se cobra 0 y no se le devuelve dinero por
  -- accidente. La devolucion es una decision de la casa, no un efecto
  -- colateral de una resta.
  v_saldo := greatest(coalesce(v_total, 0) - coalesce(v_anticipo, 0), 0);

  if coalesce(v_anticipo, 0) > 0 then
    update ordenes
       set total = v_saldo, anticipo_aplicado = v_anticipo
     where id = v_orden;
  end if;

  perform fn_cobrar_orden(v_orden, p_metodo::metodo_pago, v_saldo, null, null,
                          gen_random_uuid());

  update encargos
     set estado = 'pagado', orden_id = v_orden, updated_at = now()
   where id = p_encargo_id;

  return v_saldo;
end;
$function$;

create or replace function public.fn_encargo_entregar_con_venta(
  p_encargo_id uuid,
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_canal text,
  p_items jsonb,
  p_corte_id uuid,
  p_empleado_id uuid default null,
  p_descuento numeric default 0,
  p_efectivo numeric default 0,
  p_tarjeta numeric default 0,
  p_referencia text default null,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text; v_cliente text; v_anticipo numeric; v_folio bigint;
  v_fila ordenes%rowtype; v_orden uuid; v_total numeric; v_saldo numeric;
  v_llave uuid;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cobrar.';
  end if;

  select estado, cliente, anticipo, folio
    into v_estado, v_cliente, v_anticipo, v_folio
    from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  if v_estado <> 'apartado' then
    raise exception 'Ese encargo ya no esta apartado (esta %).', v_estado;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket viene vacio.';
  end if;

  -- El ticket completo —lo del encargo MAS lo que se llevan de mas— en UNA
  -- sola orden. El servidor recalcula los precios desde `productos.precio`
  -- igual que cualquier venta de mostrador: el navegador no manda importes.
  --
  -- Y en UNA asignacion: `(fn_crear_orden(...)).*` llama a la funcion una vez
  -- por columna del resultado. Ver el comentario de `fn_encargo_cobrar`.
  v_fila := fn_crear_orden(p_sucursal_id, p_almacen_id, p_canal::canal_orden, p_items,
                           p_corte_id, p_empleado_id, null, coalesce(p_descuento, 0),
                           false, v_cliente);
  v_orden := v_fila.id;
  v_total := v_fila.total;

  -- Lo ya anticipado no se vuelve a cobrar. Igual que en `fn_encargo_cobrar`:
  -- se baja el total de ESTA orden antes de cobrarla, para que
  -- `fn_cobrar_orden` valide el importe contra un total que ya lo trae
  -- descontado. El UPDATE no mueve inventario ni saca comandas porque esos
  -- triggers solo corren cuando `pagado` pasa a true, y aqui sigue en false.
  v_saldo := greatest(coalesce(v_total, 0) - coalesce(v_anticipo, 0), 0);
  if coalesce(v_anticipo, 0) > 0 then
    update ordenes
       set total = v_saldo, anticipo_aplicado = v_anticipo
     where id = v_orden;
  end if;

  v_llave := coalesce(p_idempotency_key, gen_random_uuid());

  if coalesce(p_efectivo, 0) > 0 and coalesce(p_tarjeta, 0) > 0 then
    perform fn_cobrar_orden_mixto(v_orden, p_efectivo, p_tarjeta, 'tarjeta'::metodo_pago,
                                  p_referencia, p_empleado_id, v_llave);
  elsif coalesce(p_tarjeta, 0) > 0 then
    perform fn_cobrar_orden(v_orden, 'tarjeta'::metodo_pago, p_tarjeta,
                            p_referencia, p_empleado_id, v_llave);
  else
    -- Tambien el caso de saldo cero: el encargo ya estaba pagado completo con
    -- anticipos y hoy solo se entrega. Se cobra 0 en efectivo para que la
    -- orden quede pagada y el inventario se descuente, que es lo que importa.
    perform fn_cobrar_orden(v_orden, 'efectivo'::metodo_pago, coalesce(p_efectivo, 0),
                            p_referencia, p_empleado_id, v_llave);
  end if;

  update encargos
     set estado = 'pagado', orden_id = v_orden, updated_at = now()
   where id = p_encargo_id;

  return jsonb_build_object(
    'orden_id',  v_orden,
    'folio',     v_fila.folio,
    'encargo',   v_folio,
    'total',     v_total,
    'anticipo',  coalesce(v_anticipo, 0),
    'cobrado',   v_saldo
  );
end;
$function$;
