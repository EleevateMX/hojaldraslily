-- «Vienen por su encargo y de paso se llevan otra cosa.»
--
-- Pasa todos los días y hasta hoy había que cobrarlo dos veces: el encargo por
-- un lado (`fn_encargo_cobrar`) y lo demás por el mostrador. Dos cobros son
-- dos papeles, dos movimientos en el corte y —con la terminal— dos veces que
-- el cliente teclea su NIP por la misma visita.
--
-- Esto lo hace en UNA orden con todos los renglones, un solo pago y un solo
-- ticket. El anticipo ya recibido se descuenta del total y el encargo queda
-- cerrado contra esa orden.
--
-- Por qué va entero en el servidor y no en dos llamadas desde la caja: si la
-- caja creara la orden, la cobrara y después cerrara el encargo, un fallo en
-- el último paso dejaría al cliente habiendo pagado con su encargo todavía
-- **apartado** — o sea el mismo pan contado dos veces, como vendido y como
-- separado. Aquí pasa todo o no pasa nada.
--
-- Los importes van partidos en efectivo y tarjeta para que el pago mixto
-- funcione igual que en cualquier venta. `fn_cobrar_orden` valida que sumen
-- el total que calculó el servidor: el navegador no manda precios (§2.2).
--
-- Ojo con el caso de saldo cero: un encargo pagado completo con anticipos solo
-- se entrega. Se cobra 0 en efectivo para que la orden quede pagada y el
-- inventario se descuente, que es lo que importa.
--
-- (La versión final de esta función, sin el defecto de `(f(...)).*`, está en
--  20261019072628_crear_orden_una_sola_vez.sql — se escribió primero con ese
--  defecto y la prueba de punta a punta lo encontró.)

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

  select (fn_crear_orden(p_sucursal_id, p_almacen_id, p_canal::canal_orden, p_items,
                         p_corte_id, p_empleado_id, null, coalesce(p_descuento, 0),
                         false, v_cliente)).*
    into v_fila;
  v_orden := v_fila.id;
  v_total := v_fila.total;

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

comment on function public.fn_encargo_entregar_con_venta(uuid, uuid, uuid, text, jsonb, uuid, uuid, numeric, numeric, numeric, text, uuid) is
  'Entrega un encargo Y cobra en el mismo ticket lo que el cliente se lleve de '
  'mas: una sola orden, un solo pago, un solo papel. Descuenta el anticipo ya '
  'recibido y cierra el encargo contra esa orden.';

revoke all on function public.fn_encargo_entregar_con_venta(uuid, uuid, uuid, text, jsonb, uuid, uuid, numeric, numeric, numeric, text, uuid) from public;
revoke all on function public.fn_encargo_entregar_con_venta(uuid, uuid, uuid, text, jsonb, uuid, uuid, numeric, numeric, numeric, text, uuid) from anon;
grant execute on function public.fn_encargo_entregar_con_venta(uuid, uuid, uuid, text, jsonb, uuid, uuid, numeric, numeric, numeric, text, uuid) to authenticated;
