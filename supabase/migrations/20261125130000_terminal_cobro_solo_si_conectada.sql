-- La terminal de Banorte se desconecta a ratos (la casa: «la terminal se va
-- cambiando cada cierto tiempo»), y cuando pasa, la caja se quedaba 120 s
-- mirando «Cobra en la terminal» antes de rendirse.
--
-- La causa: `fn_terminal_cobro_pedir` daba `hay_terminal=true` con solo que la
-- terminal estuviera `activa`, SIN mirar si el agente de la PC sigue vivo. Así
-- encolaba un cobro que nadie iba a tomar, y la pantalla sondeaba hasta el
-- timeout.
--
-- Arreglo: solo se encola si la terminal **latió hace poco** (< 90 s, la misma
-- ventana que usa `fn_terminales_listar.conectada` y que corresponde a 3
-- latidos de 30 s). Si no, contesta `hay_terminal=false` y la caja cae al cobro
-- manual en el acto —igual que cuando no hay terminal dada de alta—, sin
-- esperar. Cuando el agente vuelve a latir, todo funciona solo otra vez; nadie
-- tiene que tocar nada.
--
-- Misma firma: `create or replace` reemplaza en su lugar, sin tirar ni
-- re-otorgar.
create or replace function public.fn_terminal_cobro_pedir(
  p_idempotency_key uuid,
  p_orden_id uuid default null,
  p_efectivo numeric default 0,
  p_encargo jsonb default null,
  p_empleado_id uuid default null
) returns table(cobro_id uuid, estado text, monto numeric, control_number text, hay_terminal boolean)
 language plpgsql security definer set search_path to 'public'
as $$
declare
  v_prev public.terminal_cola;
  v_term uuid;
  v_suc uuid;
  v_efectivo numeric := round(coalesce(p_efectivo, 0), 2);
  v_total numeric;
  v_tarjeta numeric;
  v_folio integer;
  v_estado_pago text;
  v_demo boolean;
  v_control text;
  v_id uuid;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cobrar en la terminal' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'Falta idempotency_key'; end if;
  if p_orden_id is null and p_encargo is null then raise exception 'Falta orden o encargo'; end if;

  -- Idempotencia: el mismo toque devuelve el cobro que ya existe.
  select * into v_prev from public.terminal_cola where idempotency_key = p_idempotency_key;
  if found then
    return query select v_prev.id, v_prev.estado, v_prev.monto, v_prev.control_number, true;
    return;
  end if;

  -- ¿De qué sucursal es, y cuánto va a la tarjeta?
  if p_orden_id is not null then
    select o.sucursal_id, o.total, o.folio, o.estado_pago_orden, o.es_demo
      into v_suc, v_total, v_folio, v_estado_pago, v_demo
      from public.ordenes o where o.id = p_orden_id;
    if v_suc is null then raise exception 'La orden no existe'; end if;
    if v_demo then raise exception 'Una orden demo no se cobra en la terminal'; end if;
    if v_estado_pago not in ('draft','pending_payment','awaiting_counter_payment','payment_processing','payment_unknown') then
      raise exception 'La orden no admite cobro (estado=%)', v_estado_pago;
    end if;
    v_tarjeta := round(v_total - v_efectivo, 2);
  else
    v_suc := (p_encargo->>'sucursal_id')::uuid;
    if v_suc is null then raise exception 'El encargo no trae sucursal'; end if;
    v_tarjeta := round((p_encargo->>'tarjeta')::numeric, 2);
    v_folio := null;
  end if;
  if v_tarjeta is null or v_tarjeta <= 0 then
    raise exception 'Lo que va con tarjeta tiene que ser mayor que cero';
  end if;

  -- ¿Hay terminal activa Y CONECTADA (latió hace < 90 s) en esa sucursal? Si la
  -- terminal está dada de alta pero el agente no late (se desconectó, se cambió
  -- la pinpad), se trata como si no hubiera: la caja cobra a mano y no se cuelga
  -- esperando a un agente que no va a contestar.
  select id into v_term from public.terminales
   where sucursal_id = v_suc and activa
     and ultima_conexion is not null and ultima_conexion > now() - interval '90 seconds';
  if v_term is null then
    return query select null::uuid, 'no_configurado'::text, 0::numeric, ''::text, false;
    return;
  end if;

  -- Número de control: lleva el folio (para cuadrar a ojo) y el reloj (para que
  -- dos intentos no choquen). <= 30 alfanuméricos.
  v_control := substr('L' || coalesce(v_folio::text, 'E') || 'T' ||
               upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint)), 1, 30);

  insert into public.terminal_cola
    (idempotency_key, sucursal_id, terminal_id, orden_id, encargo, efectivo, monto, control_number, empleado_id)
  values
    (p_idempotency_key, v_suc, v_term, p_orden_id, p_encargo, v_efectivo, v_tarjeta, v_control, p_empleado_id)
  returning id into v_id;

  return query select v_id, 'en_cola'::text, v_tarjeta, v_control, true;
end;
$$;
