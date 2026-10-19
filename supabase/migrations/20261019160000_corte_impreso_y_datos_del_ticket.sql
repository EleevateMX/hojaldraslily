-- =============================================================================
-- El corte sale solo en la térmica, y los datos del ticket viven en la base
-- (19/10/26).
--
-- ## Los datos del negocio
--
-- El agente de tickets imprimía `NEGOCIO_DEFAULT`: nombre, dirección,
-- teléfono y pie escritos en el código. Para una tienda funciona; para
-- cambiar el teléfono hay que recompilar y reinstalar el agente en la PC.
-- Ahora viven en `parametros.ticket` (jsonb) y **viajan dentro del payload**
-- de cada trabajo: `fn_imprimir_ticket_caja` los pega al encolar. Así el
-- agente no consulta nada —sigue siendo un programa tonto que imprime lo que
-- le dan— y un cambio en Admin sale en el siguiente ticket.
--
-- Van en el payload y no en una consulta del agente a propósito: lo que
-- está en la cola es exactamente lo que se imprimió, y una reimpresión de
-- mañana saca el ticket de hoy, con el teléfono de hoy.
--
-- ## El corte impreso
--
-- Al cerrar, `fn_cerrar_caja` encola un trabajo `corte` a la térmica del
-- mostrador, con el resumen y el desglose del cajón. **Envuelto en un bloque
-- que se traga sus propios errores**: una impresora caída no puede impedir
-- cerrar la caja. Es la regla de la guía del otro sistema («imprimir solo
-- desde un bloque que se traga sus errores: una impresora rota nunca debe
-- frenar un cobro ni un corte»). Si no hay térmica, no pasa nada — el corte
-- se ve en Admin igual.
--
-- `tipo_documento_impresion` ya tiene el valor `corte` (se agregó aparte: un
-- valor nuevo de enum no se puede usar en la misma transacción que lo crea).
-- =============================================================================

alter table parametros add column if not exists ticket jsonb;
comment on column parametros.ticket is
  'Lo que va impreso en la cabecera y el pie del ticket (TicketNegocio de @lily/ui). Null = el agente usa lo que trae en el código.';

/** Los datos del negocio para el papel, o null si Admin no los ha puesto. */
create or replace function public.fn_datos_del_ticket()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select ticket from parametros where id = 'default'
$$;
revoke all on function public.fn_datos_del_ticket() from public, anon;
grant execute on function public.fn_datos_del_ticket() to authenticated;

-- El ticket, con los datos del negocio adentro.
create or replace function public.fn_imprimir_ticket_caja(
  p_orden_id uuid,
  p_ticket jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orden ordenes;
  v_printer uuid;
  v_id uuid;
  v_clave uuid;
  v_negocio jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede mandar un ticket a imprimir.';
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

  v_clave := md5('ticket:' || p_orden_id::text)::uuid;
  v_negocio := fn_datos_del_ticket();

  insert into trabajos_impresion (orden_id, printer_id, tipo_documento, payload, idempotency_key)
  values (
    p_orden_id, v_printer, 'ticket',
    case when v_negocio is null then p_ticket else p_ticket || jsonb_build_object('negocio', v_negocio) end,
    v_clave
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from trabajos_impresion where idempotency_key = v_clave;
  end if;

  return v_id;
end;
$$;

-- Cerrar la caja, y mandar el corte al papel sin que el papel pueda impedirlo.
create or replace function public.fn_cerrar_caja(
  p_corte_id uuid,
  p_conteo jsonb default null,
  p_notas text default null,
  p_efectivo numeric default null
)
returns caja_cortes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_corte caja_cortes;
  v_contado numeric;
  v_printer uuid;
  v_resumen jsonb;
  v_negocio jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cerrar la caja.';
  end if;

  select * into v_corte from caja_cortes where id = p_corte_id for update;
  if not found then
    raise exception 'Ese corte no existe.';
  end if;
  if v_corte.estado <> 'abierta' then
    raise exception 'Ese turno ya está cerrado.';
  end if;

  v_contado := case
    when p_conteo is not null then fn_suma_conteo(p_conteo)
    else greatest(0, coalesce(p_efectivo, 0))
  end;

  update caja_cortes set
    estado = 'cerrada',
    cerrado_en = now(),
    efectivo_contado = v_contado,
    conteo_cierre = p_conteo,
    empleado_cierre_id = fn_empleado_actual(),
    notas = nullif(trim(coalesce(p_notas, '')), '')
  where id = p_corte_id
  returning * into v_corte;

  -- El papel. TODO lo de aquí abajo se traga sus errores: el corte ya se
  -- cerró, y una impresora que no existe o un payload que no se pudo armar
  -- no pueden deshacerlo.
  begin
    select i.id into v_printer
    from impresoras i join cajas c on c.sucursal_id = i.sucursal_id
    where c.id = v_corte.caja_id and i.rol = 'tickets' and i.activa
    limit 1;

    if v_printer is not null then
      select to_jsonb(r) into v_resumen from vw_corte_resumen r where r.corte_id = p_corte_id;
      v_negocio := fn_datos_del_ticket();
      insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
      values (
        v_printer, 'corte',
        v_resumen
          || jsonb_build_object(
               'tipo', 'corte',
               'conteo_apertura', v_corte.conteo_apertura,
               'conteo_cierre', v_corte.conteo_cierre,
               'notas', v_corte.notas,
               'abrio', (select nombre from empleados where id = v_corte.empleado_apertura_id),
               'cerro', (select nombre from empleados where id = v_corte.empleado_cierre_id))
          || case when v_negocio is null then '{}'::jsonb else jsonb_build_object('negocio', v_negocio) end,
        md5('corte:' || p_corte_id::text)::uuid
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
  exception when others then
    raise warning 'El corte % se cerró pero no se pudo encolar su impresión: %', p_corte_id, sqlerrm;
  end;

  return v_corte;
end;
$$;
