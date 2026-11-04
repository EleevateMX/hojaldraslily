-- Facturación global por PERIODO (rango real de folios) y por MONTO MANUAL
-- (transición, mientras el POS todavía no captura todas las ventas).
--
-- La global DIARIA no se toca: estas son dos formas más de armar la misma
-- global, marcadas con `tipo`. Solo gerencia/contabilidad las dispara (la Edge
-- Function usa service_role; la lectura de preview exige fn_puede_facturar).
--
--   * 'diaria'  — como hasta hoy: un día, un renglón por folio real.
--   * 'periodo' — un rango de fechas: todos los folios reales del rango.
--   * 'manual'  — un importe que teclea la contadora para un periodo (NO sale
--                 de las ventas). Es el único camino donde el total no lo pone
--                 el servidor; por eso va marcado y aparte, para la transición.
--
-- La tabla `facturas_globales` está VACÍA al aplicar esto, así que las columnas
-- nuevas no necesitan relleno previo al default.

-- 1) Marcar el tipo y el periodo en el comprobante.
alter table public.facturas_globales
  add column if not exists tipo text not null default 'diaria',
  add column if not exists periodo_desde date,
  add column if not exists periodo_hasta date,
  add column if not exists periodicidad text;

alter table public.facturas_globales
  add constraint facturas_globales_tipo_check
  check (tipo in ('diaria', 'periodo', 'manual'));

-- 2) Qué folios quedaron amparados por cada global (anti doble facturación
--    entre la diaria y la de periodo). Solo se llena cuando la global timbra.
--    Un folio no puede ir en dos globales (índice único por folio).
create table if not exists public.facturas_globales_folios (
  id           uuid primary key default gen_random_uuid(),
  factura_id   uuid not null references public.facturas_globales(id),
  folio_venta  integer not null,
  created_at   timestamptz not null default now()
);

create unique index if not exists uq_fgf_folio
  on public.facturas_globales_folios (folio_venta);

create index if not exists ix_fgf_factura
  on public.facturas_globales_folios (factura_id);

-- Solo se llega por funciones definer / service_role: RLS prendida sin política.
alter table public.facturas_globales_folios enable row level security;

-- 3) La diaria ahora también salta folios ya amparados por otra global
--    (además de los ya nominados). Misma firma: create or replace conserva
--    permisos.
create or replace function public.fn_facturacion_dia(p_fecha date)
 returns table(folio integer, total numeric, hora text, canal text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not fn_es_staff() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el personal puede consultar la facturación del día' using errcode = '42501';
  end if;
  return query
    select o.folio, o.total,
           to_char(o.created_at at time zone 'America/Merida', 'HH12:MI AM') as hora,
           o.canal::text as canal
    from ordenes o
    where o.pagado = true
      and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date = p_fecha
      and not exists (select 1 from facturas_nominativas n
                      where n.folio_venta = o.folio and n.estatus = 'timbrada')
      and not exists (select 1 from facturas_globales_folios g
                      where g.folio_venta = o.folio)
    order by o.folio;
end;
$function$;

-- 4) Los folios reales de un RANGO de fechas (la global por periodo).
create or replace function public.fn_facturacion_periodo(p_desde date, p_hasta date)
 returns table(folio integer, total numeric, fecha date, hora text, canal text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not fn_puede_facturar() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo gerencia o contabilidad pueden facturar' using errcode = '42501';
  end if;
  if p_hasta < p_desde then
    raise exception 'El fin del periodo es antes del inicio' using errcode = '22007';
  end if;
  return query
    select o.folio, o.total,
           (o.created_at at time zone 'America/Merida')::date as fecha,
           to_char(o.created_at at time zone 'America/Merida', 'HH12:MI AM') as hora,
           o.canal::text as canal
    from ordenes o
    where o.pagado = true
      and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date between p_desde and p_hasta
      and not exists (select 1 from facturas_nominativas n
                      where n.folio_venta = o.folio and n.estatus = 'timbrada')
      and not exists (select 1 from facturas_globales_folios g
                      where g.folio_venta = o.folio)
    order by o.folio;
end;
$function$;

revoke all on function public.fn_facturacion_periodo(date, date) from public;
revoke all on function public.fn_facturacion_periodo(date, date) from anon;
grant execute on function public.fn_facturacion_periodo(date, date) to authenticated;
grant execute on function public.fn_facturacion_periodo(date, date) to service_role;
