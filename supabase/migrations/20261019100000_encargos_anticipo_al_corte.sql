-- Anticipos de encargo que SÍ entran al corte de caja.
--
-- El problema: `encargos.anticipo` existía desde siempre y las pantallas lo
-- mostraban, pero `fn_encargo_crear` solo guardaba el número. Nadie cobraba
-- nada. O sea que el efectivo que la cajera recibía como anticipo se quedaba
-- en el cajón **sin pasar por ninguna orden ni por ningún pago**: al cerrar,
-- el corte pedía menos efectivo del que había y la diferencia no tenía de
-- dónde salir. Es el mismo defecto que el repo ya documentó con los encargos
-- insertados a mano (§2.0): lo que no pasa por `fn_crear_orden` +
-- `fn_cobrar_orden` no existe para el corte.
--
-- La decisión de la casa fue que el anticipo pase por la caja. Así queda:
--
--   1. `fn_encargo_anticipo` cobra el anticipo como una orden propia, SIN
--      renglones. Entra al corte del día en que se recibió, que es el día en
--      que el dinero de verdad entró al cajón.
--   2. `fn_encargo_cobrar` (misma firma, reemplazada) descuenta lo ya
--      anticipado del saldo a cobrar al entregar.
--
-- Son DOS ventas y es lo correcto: el lunes entraron $200 y el sábado $800.
-- Cada corte cuadra con su propio cajón, y la suma de los dos es el encargo.
--
-- Por qué la orden del anticipo va sin renglones: un anticipo no es pan, es
-- dinero a cuenta. Los triggers de inventario y de comandas (`AFTER UPDATE`,
-- guardados por `pagado = true and OLD.pagado is distinct from true`) sí se
-- disparan al cobrarla, recorren `orden_items`, no encuentran nada y no
-- mueven existencias ni sacan papel. El pan se descuenta una sola vez, al
-- entregar.

-- ---------------------------------------------------------------------------
-- 1. Lo anticipado queda anotado en la orden, en su propia columna
-- ---------------------------------------------------------------------------
-- NO se reusa `descuento`. Un anticipo no es un descuento: el cliente pagó
-- ese dinero y el negocio lo cobró. Metido en `descuento`, el reporte diría
-- que se regalaron $200 que en realidad están en el cajón desde el lunes.

alter table public.ordenes
  add column if not exists anticipo_aplicado numeric not null default 0;

alter table public.ordenes
  drop constraint if exists ordenes_anticipo_aplicado_check;
alter table public.ordenes
  add constraint ordenes_anticipo_aplicado_check
  check (anticipo_aplicado >= 0);

comment on column public.ordenes.anticipo_aplicado is
  'Lo que ya se habia cobrado como anticipo de un encargo y por eso no se '
  'vuelve a cobrar en esta orden. NO es un descuento: ese dinero si entro, '
  'en el corte del dia en que se recibio.';

-- ---------------------------------------------------------------------------
-- 2. Recibir un anticipo
-- ---------------------------------------------------------------------------

create or replace function public.fn_encargo_anticipo(
  p_encargo_id uuid,
  p_monto numeric,
  p_metodo metodo_pago default 'efectivo'
) returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text; v_cliente text; v_folio bigint; v_ya numeric;
  v_total numeric; v_corte uuid; v_suc uuid; v_alm uuid; v_orden uuid;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede recibir un anticipo.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El anticipo tiene que ser mayor que cero.';
  end if;

  select estado, cliente, folio, anticipo
    into v_estado, v_cliente, v_folio, v_ya
    from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  if v_estado <> 'apartado' then
    raise exception 'Ese encargo ya no esta apartado (esta %).', v_estado;
  end if;

  -- El total lo calcula el servidor desde `productos.precio`, igual que
  -- `fn_crear_orden`. El cliente nunca manda importes, y asi el anticipo
  -- queda acotado por lo que de verdad se debe: no se puede "anticipar"
  -- mas de lo que vale el encargo.
  select coalesce(sum(ei.cantidad * pr.precio), 0)
    into v_total
    from encargo_items ei
    join productos pr on pr.id = ei.producto_id
   where ei.encargo_id = p_encargo_id;

  if v_ya + p_monto > v_total + 0.01 then
    raise exception
      'El anticipo pasa del total del encargo: ya habia % y se quieren abonar % de %.',
      v_ya, p_monto, v_total;
  end if;

  select cc.id, c.sucursal_id into v_corte, v_suc
    from caja_cortes cc
    join cajas c on c.id = cc.caja_id
   where cc.estado = 'abierta'
   order by cc.abierto_en desc limit 1;

  -- Sin caja abierta no hay anticipo. Permitirlo seria volver al defecto que
  -- esta migracion arregla: dinero en el cajon que ningun corte espera.
  if v_corte is null then
    raise exception 'No hay una caja abierta. El anticipo tiene que caer en un corte.';
  end if;

  select id into v_alm from almacenes where activo order by nombre limit 1;

  -- `estado_pago_orden` se pone igual que en `fn_crear_orden`
  -- ('pending_payment'). Con el 'draft' que trae la columna por omision,
  -- `fn_cobrar_orden` rechaza la orden y el anticipo no se puede cobrar: lo
  -- encontro la prueba de punta a punta, no la lectura del codigo.
  insert into ordenes (sucursal_id, almacen_id, canal, corte_id, total,
                       descuento, nombre_cliente, estado_pago_orden)
       values (v_suc, v_alm, 'pos'::canal_orden, v_corte, p_monto,
               0, 'Anticipo encargo #' || v_folio || ' - ' || v_cliente,
               'pending_payment')
    returning id into v_orden;

  perform fn_cobrar_orden(v_orden, p_metodo, p_monto, null, null,
                          gen_random_uuid());

  update encargos
     set anticipo = v_ya + p_monto, updated_at = now()
   where id = p_encargo_id;

  return v_ya + p_monto;
end;
$function$;

comment on function public.fn_encargo_anticipo(uuid, numeric, metodo_pago) is
  'Cobra un anticipo de encargo como una orden propia SIN renglones, para que '
  'el dinero entre al corte del dia en que se recibio. El pan se descuenta '
  'despues, al entregar, una sola vez.';

revoke all on function public.fn_encargo_anticipo(uuid, numeric, metodo_pago) from public;
revoke all on function public.fn_encargo_anticipo(uuid, numeric, metodo_pago) from anon;
grant execute on function public.fn_encargo_anticipo(uuid, numeric, metodo_pago) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Al entregar se cobra el SALDO, no el total
-- ---------------------------------------------------------------------------
-- Misma firma que la de antes, asi que esto REEMPLAZA y no duplica (§4). Es
-- a proposito: si se hubiera dejado la vieja al lado, un encargo con anticipo
-- cobrado por el camino viejo le cobraba al cliente el total completo y le
-- quedaba a deber lo que ya habia pagado.

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

  select (fn_crear_orden(v_suc, v_alm, 'pos'::canal_orden, v_items,
                         v_corte, null, null, 0, false, v_cliente)).*
    into v_fila;
  v_orden := v_fila.id;
  v_total := v_fila.total;

  -- El saldo nunca es negativo: si alguien anticipo de mas (no deberia, lo
  -- impide fn_encargo_anticipo), se cobra 0 y no se le devuelve dinero por
  -- accidente. La devolucion es una decision de la casa, no un efecto
  -- colateral de una resta.
  v_saldo := greatest(coalesce(v_total, 0) - coalesce(v_anticipo, 0), 0);

  -- Se baja el total de ESTA orden antes de cobrarla, para que
  -- `fn_cobrar_orden` valide el importe contra un total que ya trae el
  -- anticipo descontado. No se toca `fn_cobrar_orden` ni `fn_crear_orden`:
  -- cambiarles la firma las duplicaria (§4). Este UPDATE no mueve inventario
  -- ni saca comandas porque esos triggers solo corren cuando `pagado` pasa a
  -- true, y aqui sigue en false.
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

  -- Devuelve lo que se cobro AHORA, que es lo que la pantalla tiene que
  -- decirle al cajero y lo que se le pide al cliente en el mostrador.
  return v_saldo;
end;
$function$;

comment on function public.fn_encargo_cobrar(uuid, text) is
  'Cobra el SALDO de un encargo (total menos lo ya anticipado) y descuenta el '
  'inventario. Devuelve lo cobrado ahora, no el total del encargo.';
