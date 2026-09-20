-- Pago mixto: "le doy $200 en efectivo y el resto con tarjeta".
--
-- Pasa todos los días en un mostrador y hasta hoy no había forma de
-- apuntarlo: o se cobraba todo en efectivo (y el corte mostraba efectivo que
-- no estaba en el cajón) o todo con tarjeta (al revés). Las dos mentiras
-- terminan igual, con alguien contando el cajón a las nueve de la noche sin
-- entender por qué no cuadra.
--
-- ## Por qué NO se hace con dos pagos
--
-- La tentación es insertar dos renglones en `pagos`. No se puede, y está bien
-- que no se pueda: existe `uq_pagos_un_aprobado_por_orden` —único por orden
-- donde `estado = 'aprobado'`— y **ese índice es lo que hace imposible el
-- doble cobro**. Es la red que atrapó el doble cobro en las primeras ventas
-- reales. Aflojarla para caber aquí sería cambiar un problema de contabilidad
-- por uno de dinero.
--
-- (El motor original sí lo hizo con dos pagos: uno aprobado y otro pendiente
-- con `proveedor = 'mixto_efectivo'`, que alguien tenía que aprobar después.
-- Su propio código trae un `delete` de los que quedaban colgados y un
-- comentario sobre "efectivos fantasma". No se trajo ese camino.)
--
-- ## Cómo se hace
--
-- **Un solo pago aprobado** por el total —el índice sigue intacto— y el
-- desglose en una tabla hija. La venta se confirma una vez, con un pago.
--
-- Y el desglose **tiene que llegar al corte**: `vw_corte_resumen` calcula el
-- efectivo esperado sumando los pagos de método `efectivo`, y es contra ese
-- número que la cajera cuenta el cajón. Si la parte en efectivo de un mixto
-- no apareciera ahí, el corte pediría de menos y el día cerraría con una
-- diferencia que nadie puede explicar.

create table if not exists public.pago_partes (
  id        uuid primary key default gen_random_uuid(),
  pago_id   uuid not null references public.pagos(id) on delete cascade,
  metodo    metodo_pago not null,
  monto     numeric not null check (monto > 0),
  orden     int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists pago_partes_pago_idx on public.pago_partes (pago_id);

comment on table public.pago_partes is
  'Cómo se repartió un pago entre métodos. Solo existe cuando el cobro fue mixto; un cobro normal no tiene partes y se lee del propio pago.';

alter table public.pago_partes enable row level security;

-- Se lee con las mismas reglas que los pagos: si alguien puede ver el pago,
-- puede ver cómo se repartió. Escribir, solo las funciones (DEFINER).
drop policy if exists pago_partes_lectura_staff on public.pago_partes;
create policy pago_partes_lectura_staff on public.pago_partes
  for select using (fn_rol_staff() is not null);

revoke all on public.pago_partes from public, anon;
grant select on public.pago_partes to authenticated;

-- ------------------------------------------------------------------------
-- El desglose que lee el corte.
--
-- Da (orden_id, metodo, monto) por pago: sus PARTES si las tiene, y si no, el
-- pago entero. Así el corte suma una sola cosa y no tiene que saber si el
-- cobro fue mixto o no.
-- ------------------------------------------------------------------------
create or replace view public.vw_pagos_por_metodo
with (security_invoker = true) as
  select p.id as pago_id, p.orden_id, p.estado,
         coalesce(pp.metodo, p.metodo) as metodo,
         coalesce(pp.monto, p.monto)   as monto
    from public.pagos p
    left join public.pago_partes pp on pp.pago_id = p.id;

comment on view public.vw_pagos_por_metodo is
  'Un pago repartido por método: sus partes si fue mixto, o el pago entero si no. La usa el corte.';

-- `create or replace view` BORRA las reloptions: hay que volver a declarar
-- `security_invoker` o la vista queda insegura en silencio (CLAUDE.md §4).
create or replace view public.vw_corte_resumen
with (security_invoker = true) as
 SELECT cc.id AS corte_id,
    cc.caja_id,
    ca.nombre AS caja,
    cc.estado,
    cc.abierto_en,
    cc.cerrado_en,
    cc.fondo_inicial,
    cc.efectivo_contado,
    count(DISTINCT o.id) AS num_ordenes,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'::metodo_pago), 0::numeric) AS total_efectivo,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'tarjeta'::metodo_pago), 0::numeric) AS total_tarjeta,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'clip'::metodo_pago), 0::numeric) AS total_clip,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'cortesia'::metodo_pago), 0::numeric) AS total_cortesia,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'otro'::metodo_pago), 0::numeric) AS total_otro,
    COALESCE(sum(p.monto), 0::numeric) AS total_pagado,
    cc.fondo_inicial + COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'::metodo_pago), 0::numeric) AS efectivo_esperado,
    cc.efectivo_contado - (cc.fondo_inicial + COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'::metodo_pago), 0::numeric)) AS diferencia
   FROM caja_cortes cc
     JOIN cajas ca ON ca.id = cc.caja_id
     LEFT JOIN ordenes o ON o.corte_id = cc.id AND o.es_demo = false
     LEFT JOIN vw_pagos_por_metodo p ON p.orden_id = o.id AND p.estado = 'aprobado'::estado_pago
  GROUP BY cc.id, ca.nombre;

-- ------------------------------------------------------------------------
-- Cobrar en dos métodos.
-- ------------------------------------------------------------------------
create or replace function public.fn_cobrar_orden_mixto(
  p_orden_id        uuid,
  p_efectivo        numeric,
  p_tarjeta         numeric,
  p_metodo_tarjeta  metodo_pago default 'tarjeta',
  p_referencia      text default null,
  p_autorizado_por  uuid default null,
  p_idempotency_key uuid default null
)
returns pagos
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_orden ordenes;
  v_pago  pagos;
  v_total numeric;
  v_tolerancia constant numeric := 0.01;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cobrar.';
  end if;

  select * into v_orden from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden % no existe', p_orden_id;
  end if;

  -- Idempotente, igual que el cobro normal: dos toques por nervios en una
  -- pantalla táctil no cobran dos veces.
  if p_idempotency_key is not null then
    select * into v_pago from pagos
     where orden_id = p_orden_id and idempotency_key = p_idempotency_key;
    if found then return v_pago; end if;
  end if;

  select * into v_pago from pagos where orden_id = p_orden_id and estado = 'aprobado' limit 1;
  if found then return v_pago; end if;

  if v_orden.estado_pago_orden not in
     ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown') then
    raise exception 'La orden % no está en un estado que permita cobro (estado=%)',
      p_orden_id, v_orden.estado_pago_orden;
  end if;

  if coalesce(p_efectivo, 0) <= 0 or coalesce(p_tarjeta, 0) <= 0 then
    raise exception 'Las dos partes tienen que ser mayores a cero. Si solo es una, es un cobro normal.';
  end if;
  if p_metodo_tarjeta not in ('tarjeta', 'clip') then
    raise exception 'La segunda parte tiene que ir con tarjeta, no con %.', p_metodo_tarjeta;
  end if;

  v_total := p_efectivo + p_tarjeta;
  -- La misma validación que el cobro normal, y por la misma razón: el total
  -- autoritativo es el que calculó el servidor (CLAUDE.md §2.2).
  if abs(v_total - v_orden.total) > v_tolerancia then
    raise exception 'Las partes suman % y el total de la orden es %', v_total, v_orden.total;
  end if;

  -- UN pago aprobado. El método del renglón es el de la parte más grande,
  -- para que un reporte viejo que solo mire `pagos.metodo` diga algo cercano
  -- a la verdad en vez de inventarse un método que no existe.
  insert into pagos (
    orden_id, metodo, monto, estado, estado_transaccion, proveedor,
    referencia, autorizado_por, idempotency_key
  ) values (
    p_orden_id,
    case when p_efectivo >= p_tarjeta then 'efectivo'::metodo_pago else p_metodo_tarjeta end,
    v_total, 'aprobado', 'authorized', 'manual',
    p_referencia, p_autorizado_por, p_idempotency_key
  )
  returning * into v_pago;

  insert into pago_partes (pago_id, metodo, monto, orden) values
    (v_pago.id, 'efectivo', p_efectivo, 1),
    (v_pago.id, p_metodo_tarjeta, p_tarjeta, 2);

  perform fn_confirmar_venta(p_orden_id, v_pago.id);

  return v_pago;
end $$;

comment on function public.fn_cobrar_orden_mixto(uuid, numeric, numeric, metodo_pago, text, uuid, uuid) is
  'Cobra una orden repartida entre efectivo y tarjeta. Un solo pago aprobado, con su desglose, para que el corte cuadre.';

-- Revoke Y grant, en ese orden (CLAUDE.md §5).
revoke all on function public.fn_cobrar_orden_mixto(uuid, numeric, numeric, metodo_pago, text, uuid, uuid) from public, anon;
grant execute on function public.fn_cobrar_orden_mixto(uuid, numeric, numeric, metodo_pago, text, uuid, uuid) to authenticated;
