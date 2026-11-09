-- El VOUCHER suelto (la autorización de la tarjeta) por la TÉRMICA, no por el
-- navegador.
--
-- Antes el voucher chico salía por `window.print()` a la impresora
-- predeterminada de Windows: si no era la térmica, se iba a un PDF sin que
-- nadie se enterara (el mismo modo de fallo silencioso que ya tenía el ticket
-- antes de la cola). Ahora se encola igual que la nota —`fn_imprimir_ticket_caja`
-- es el molde—, así un voucher que no sale **se ve en Admin**.
--
-- Va como un trabajo de tipo 'ticket' pero con la marca `comprobante:'voucher'`
-- en el payload; el agente lo distingue por ahí (una copia, no dos) y lo dibuja
-- con `armarVoucher`. Idempotente por orden (clave distinta a la del ticket, así
-- el voucher y la nota conviven). Devuelve null si la sucursal no tiene térmica
-- de tickets: la caja lo lee como «imprime tú por el navegador, como hasta hoy».

create or replace function public.fn_imprimir_voucher_caja(p_orden_id uuid, p_voucher jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_orden ordenes;
  v_printer uuid;
  v_id uuid;
  v_clave uuid;
  v_negocio jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede mandar un voucher a imprimir.';
  end if;

  select * into v_orden from ordenes where id = p_orden_id;
  if not found then
    raise exception 'Esa orden no existe.';
  end if;

  select i.id into v_printer
  from impresoras i
  where i.sucursal_id = v_orden.sucursal_id and i.rol = 'tickets' and i.activa
  limit 1;

  if v_printer is null then
    return null;
  end if;

  v_clave := md5('voucher:' || p_orden_id::text)::uuid;
  v_negocio := fn_datos_del_ticket();

  insert into trabajos_impresion (orden_id, printer_id, tipo_documento, payload, idempotency_key)
  values (
    p_orden_id, v_printer, 'ticket',
    case when v_negocio is null then p_voucher else p_voucher || jsonb_build_object('negocio', v_negocio) end,
    v_clave
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from trabajos_impresion where idempotency_key = v_clave;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.fn_imprimir_voucher_caja(uuid, jsonb) from public, anon;
grant execute on function public.fn_imprimir_voucher_caja(uuid, jsonb) to authenticated, service_role;
