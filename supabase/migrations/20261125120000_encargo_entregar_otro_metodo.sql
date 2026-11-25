-- Encargo + Inbursa/transferencia: el cobro fallaba con «el monto no coincide».
--
-- `fn_encargo_entregar_con_venta` solo tenía dos cubetas de dinero: `p_efectivo`
-- y `p_tarjeta` (la pinpad de Banorte). Un encargo cobrado con **Inbursa** (2ª
-- terminal) o por **transferencia** llegaba con las dos en cero, caía al `else`
-- —que cobraba SIEMPRE 'efectivo' por `p_efectivo` (=0)— y `fn_cobrar_orden`
-- lo rechazaba porque 0 ≠ saldo. Resultado: salía el error y no se imprimía la
-- nota. (Efectivo, tarjeta Banorte y mixto nunca se vieron afectados.)
--
-- Arreglo: un parámetro `p_metodo` para el caso de UN solo método que no es la
-- pinpad (efectivo, Inbursa o transferencia), y en ese caso se cobra el SALDO
-- que calculó el servidor —no un importe que mande la pantalla— con ese método.
-- Así el pago queda con su método real (Inbursa cuenta aparte en el corte y no
-- toca el efectivo esperado, igual que en una venta de mostrador).
--
-- Cambia la firma (un parámetro más), así que hay que TIRAR la vieja de 12
-- argumentos antes de crear la de 13: si no, un `create or replace` deja las
-- dos y las llamadas por nombre sin `p_metodo` quedan ambiguas. El `'dr'||'op'`
-- es a propósito: el filtro de texto del MCP se cuelga con la palabra entera
-- (ver CLAUDE.md §«Este entorno»). Los demás que la llaman (el wrapper de TS,
-- la cola de la terminal, interredes) la llaman por nombre y omiten `p_metodo`,
-- así que siguen funcionando con el valor por omisión.
do $$ begin
  execute 'dr' || 'op function if exists public.fn_encargo_entregar_con_venta('
       || 'uuid,uuid,uuid,text,jsonb,uuid,uuid,numeric,numeric,numeric,text,uuid)';
end $$;

create or replace function public.fn_encargo_entregar_con_venta(
  p_encargo_id uuid, p_sucursal_id uuid, p_almacen_id uuid, p_canal text,
  p_items jsonb, p_corte_id uuid, p_empleado_id uuid default null,
  p_descuento numeric default 0, p_efectivo numeric default 0, p_tarjeta numeric default 0,
  p_referencia text default null, p_idempotency_key uuid default null,
  p_metodo metodo_pago default 'efectivo')
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text; v_cliente text; v_anticipo numeric; v_folio bigint;
  v_fila ordenes%rowtype; v_orden uuid; v_total numeric; v_saldo numeric;
  v_llave uuid;
begin
  -- Personal con sesión, o el agente de la terminal reportando un cobro que
  -- el personal ya encoló (ver fn_terminal_cobro_resultado).
  if fn_rol_staff() is null and not fn_cobro_desde_terminal() then
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
    -- Un solo método que NO es la pinpad de Banorte: efectivo, Inbursa (2ª
    -- terminal) o transferencia. Se cobra el SALDO que calculó el servidor
    -- (no un importe de la pantalla) con el método que eligió la caja. Para
    -- saldo cero (ya pagado con anticipos y hoy solo se entrega) es un cobro
    -- de 0 que solo deja la orden pagada y descuenta el inventario.
    perform fn_cobrar_orden(v_orden, coalesce(p_metodo, 'efectivo'::metodo_pago), v_saldo,
                            p_referencia, p_empleado_id, v_llave);
  end if;

  update encargos
     set estado = 'pagado', orden_id = v_orden, folio = coalesce(folio, nextval('public.encargos_folio_seq')), updated_at = now()
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

-- La puerta es el rol, no el GRANT (CLAUDE.md §5): Postgres le da EXECUTE a
-- PUBLIC por omisión al crear, así que hay que quitárselo. Solo gente con
-- sesión (authenticated); service_role se salta los grants.
revoke all on function public.fn_encargo_entregar_con_venta(
  uuid,uuid,uuid,text,jsonb,uuid,uuid,numeric,numeric,numeric,text,uuid,metodo_pago) from public;
revoke all on function public.fn_encargo_entregar_con_venta(
  uuid,uuid,uuid,text,jsonb,uuid,uuid,numeric,numeric,numeric,text,uuid,metodo_pago) from anon;
grant execute on function public.fn_encargo_entregar_con_venta(
  uuid,uuid,uuid,text,jsonb,uuid,uuid,numeric,numeric,numeric,text,uuid,metodo_pago) to authenticated;
