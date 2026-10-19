-- =============================================================================
-- Los cortes de caja, para revisarlos después (19/10/26).
--
-- Hasta hoy se cerraba el turno y no había dónde mirarlo: el arqueo existía
-- en la pantalla de la caja y desaparecía al dar «Seguir». Aquí queda el
-- historial —con la diferencia y, lo que de verdad sirve para reclamar,
-- **cuántos billetes de cada denominación había**— y la forma de volver a
-- sacar el papel.
--
-- ## El folio del corte
--
-- `caja_cortes` no tenía folio. Un comprobante se nombra por su número
-- («el corte 14, el del sábado») y un uuid no se canta por teléfono. Va como
-- `serial`: a los cortes que ya existen se les asigna en orden de creación y
-- los nuevos siguen contando.
--
-- ## Reimprimir
--
-- `fn_corte_imprimir_caja` manda el corte a la térmica del mostrador desde
-- Admin —desde el teléfono, sin que nadie esté parado frente a la PC—. Es la
-- MISMA función que usa `fn_cerrar_caja` al cerrar, para que el papel de la
-- reimpresión sea idéntico al del cierre. Cada reimpresión es un trabajo
-- nuevo (sin clave de idempotencia): la del cierre se identifica por
-- `corte:<id>` y no se repite; las que pide gerencia salen las veces que
-- gerencia las pida.
-- =============================================================================

alter table caja_cortes add column if not exists folio serial;
create unique index if not exists uq_caja_cortes_folio on caja_cortes (folio);

/** Arma el payload del corte para el papel. Lo comparten el cierre y la reimpresión. */
create or replace function public.fn_corte_payload(p_corte_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select to_jsonb(r)
      || jsonb_build_object(
           'tipo', 'corte',
           'folio', c.folio,
           'conteo_apertura', c.conteo_apertura,
           'conteo_cierre', c.conteo_cierre,
           'notas', c.notas,
           'abrio', ea.nombre,
           'cerro', ec.nombre)
      || case when fn_datos_del_ticket() is null then '{}'::jsonb
              else jsonb_build_object('negocio', fn_datos_del_ticket()) end
  from caja_cortes c
  join vw_corte_resumen r on r.corte_id = c.id
  left join empleados ea on ea.id = c.empleado_apertura_id
  left join empleados ec on ec.id = c.empleado_cierre_id
  where c.id = p_corte_id
$$;

/**
 * Manda el corte a la térmica del mostrador. Devuelve el id del trabajo, o
 * null si no hay térmica dada de alta (Admin lo dice en vez de fingir).
 */
create or replace function public.fn_corte_imprimir_caja(p_corte_id uuid, p_clave uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_corte caja_cortes;
  v_printer uuid;
  v_id uuid;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede imprimir un corte.';
  end if;
  select * into v_corte from caja_cortes where id = p_corte_id;
  if not found then
    raise exception 'Ese corte no existe.';
  end if;

  select i.id into v_printer
  from impresoras i join cajas c on c.sucursal_id = i.sucursal_id
  where c.id = v_corte.caja_id and i.rol = 'tickets' and i.activa
  limit 1;
  if v_printer is null then
    return null;
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_printer, 'corte', fn_corte_payload(p_corte_id), p_clave)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  if v_id is null and p_clave is not null then
    select id into v_id from trabajos_impresion where idempotency_key = p_clave;
  end if;
  return v_id;
end;
$$;

-- El cierre usa la misma función: un solo armado del papel.
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

  -- El papel se traga sus errores: el corte ya se cerró y una impresora
  -- caída no puede deshacerlo.
  begin
    perform fn_corte_imprimir_caja(p_corte_id, md5('corte:' || p_corte_id::text)::uuid);
  exception when others then
    raise warning 'El corte % se cerró pero no se pudo encolar su impresión: %', p_corte_id, sqlerrm;
  end;

  return v_corte;
end;
$$;

/** El historial de cortes para Admin, con todo lo que hace falta para revisarlos. */
create or replace function public.fn_cortes_de_caja(p_desde date, p_hasta date)
returns table (
  corte_id uuid, folio integer, caja text, estado estado_corte,
  abierto_en timestamptz, cerrado_en timestamptz, abrio text, cerro text,
  fondo_inicial numeric, num_ordenes bigint,
  total_efectivo numeric, total_tarjeta numeric, total_clip numeric,
  total_cortesia numeric, total_otro numeric, total_pagado numeric,
  efectivo_esperado numeric, efectivo_contado numeric, diferencia numeric,
  conteo_apertura jsonb, conteo_cierre jsonb, notas text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver los cortes.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no tiene sentido.';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'Escoge un rango de un año o menos.';
  end if;
  return query
  select c.id, c.folio, r.caja, c.estado, c.abierto_en, c.cerrado_en,
         ea.nombre, ec.nombre,
         c.fondo_inicial, r.num_ordenes,
         r.total_efectivo, r.total_tarjeta, r.total_clip, r.total_cortesia, r.total_otro, r.total_pagado,
         r.efectivo_esperado, c.efectivo_contado, r.diferencia,
         c.conteo_apertura, c.conteo_cierre, c.notas
  from caja_cortes c
  join vw_corte_resumen r on r.corte_id = c.id
  left join empleados ea on ea.id = c.empleado_apertura_id
  left join empleados ec on ec.id = c.empleado_cierre_id
  where (coalesce(c.cerrado_en, c.abierto_en) at time zone 'America/Merida')::date between p_desde and p_hasta
  order by c.abierto_en desc;
end;
$$;

revoke all on function public.fn_corte_payload(uuid) from public, anon;
revoke all on function public.fn_corte_imprimir_caja(uuid, uuid) from public, anon;
revoke all on function public.fn_cortes_de_caja(date, date) from public, anon;
grant execute on function public.fn_corte_payload(uuid) to authenticated;
grant execute on function public.fn_corte_imprimir_caja(uuid, uuid) to authenticated;
grant execute on function public.fn_cortes_de_caja(date, date) to authenticated;
