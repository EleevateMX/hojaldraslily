-- Facturación NOMINATIVA: timbrar un folio de venta a un cliente real
-- (persona física o moral), aparte de la factura global a público en general.
--
-- La casa factura global por día, PERO a veces un cliente pide su factura a su
-- RFC. Ese folio entonces NO puede ir también en la global (sería facturar el
-- mismo ingreso dos veces), así que:
--   * un folio nominado se EXCLUYE de la factura global de su día;
--   * no se puede nominar un folio cuyo día ya se timbró global.
-- El total lo sigue decidiendo el servidor (sale de `ordenes`), nunca la
-- pantalla. Mismo trato que la global: una línea de pan, clave 50181900, 0%.
--
-- NOTA: esta migración se aplicó por `execute_sql` por partes, no por
-- `apply_migration`: el `drop policy` original colgaba el filtro de texto del
-- MCP. Como la tabla nace aquí, no hace falta tirar la política antes: se crea
-- directo. La fila de schema_migrations se insertó a mano (20261104130000).

-- 1. El comprobante guardado --------------------------------------------------
create table if not exists facturas_nominativas (
  id             uuid primary key default gen_random_uuid(),
  folio_venta    integer not null,                 -- folio de `ordenes`
  rfc_receptor   text not null,
  nombre_receptor text,
  ambiente       text not null default 'pro',
  id_empresa     bigint,
  uuid           text,
  serie          text,
  folio_cfdi     bigint,
  uso_cfdi       text,
  estatus        text not null default 'pendiente', -- pendiente|timbrada|error|cancelada
  subtotal       numeric(12,2) not null default 0,
  iva            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  pdf_link       text,
  xml_link       text,
  mensaje        text,
  respuesta      jsonb,
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table facturas_nominativas is
  'Facturas CFDI nominativas (a un RFC real) por folio de venta, con ContaDigital.';

-- Un folio no se factura nominativo dos veces (deja reintentar si quedó en error).
create unique index if not exists uq_fact_nom_folio_timbrada
  on facturas_nominativas (folio_venta) where estatus = 'timbrada';
create index if not exists ix_fact_nom_fecha on facturas_nominativas (created_at desc);

alter table facturas_nominativas enable row level security;
create policy facturas_nominativas_leer on facturas_nominativas
  for select to authenticated using (fn_es_staff());
revoke all on facturas_nominativas from anon;
grant select on facturas_nominativas to authenticated;

-- 2. El folio facturable ------------------------------------------------------
-- Lo que se puede nominar: una orden pagada, no cancelada, con su total (del
-- servidor). Trae dos banderas para que la pantalla avise antes de intentar:
-- si ese folio ya tiene una nominativa timbrada, y si el día de ese folio ya
-- se timbró en la global (en cuyo caso ya no se puede nominar).
create or replace function fn_folio_facturable(p_folio integer)
returns table (folio integer, total numeric, fecha date, canal text,
               ya_nominada boolean, dia_global_timbrado boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_puede_facturar() then
    raise exception 'Solo gerencia o contabilidad pueden facturar'
      using errcode = '42501';
  end if;
  return query
    select o.folio,
           o.total,
           (o.created_at at time zone 'America/Merida')::date as fecha,
           o.canal::text as canal,
           exists (select 1 from facturas_nominativas n
                   where n.folio_venta = o.folio and n.estatus = 'timbrada') as ya_nominada,
           exists (select 1 from facturas_globales g
                   where g.estatus = 'timbrada'
                     and g.fecha = (o.created_at at time zone 'America/Merida')::date) as dia_global_timbrado
    from ordenes o
    where o.folio = p_folio and o.pagado = true and o.estado <> 'cancelada'
    limit 1;
end;
$$;
revoke all on function fn_folio_facturable(integer) from public, anon;
grant execute on function fn_folio_facturable(integer) to authenticated, service_role;

-- 3. Historial de nominativas -------------------------------------------------
create or replace function fn_facturas_nominativas_listar(p_desde date, p_hasta date)
returns setof facturas_nominativas
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver las facturas' using errcode = '42501';
  end if;
  return query
    select * from facturas_nominativas
    where created_at::date between p_desde and p_hasta
    order by created_at desc;
end;
$$;
revoke all on function fn_facturas_nominativas_listar(date, date) from public, anon;
grant execute on function fn_facturas_nominativas_listar(date, date) to authenticated;

-- 4. La global EXCLUYE lo ya nominado ----------------------------------------
-- Mismo cuerpo que `20261028120000`, con un filtro más: un folio que ya tiene
-- su factura nominativa timbrada no vuelve a entrar en la global de su día.
create or replace function fn_facturacion_dia(p_fecha date)
returns table (folio integer, total numeric, hora text, canal text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_es_staff() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el personal puede consultar la facturación del día'
      using errcode = '42501';
  end if;

  return query
    select o.folio,
           o.total,
           to_char(o.created_at at time zone 'America/Merida', 'HH12:MI AM') as hora,
           o.canal::text as canal
    from ordenes o
    where o.pagado = true
      and o.estado <> 'cancelada'
      and (o.created_at at time zone 'America/Merida')::date = p_fecha
      and not exists (select 1 from facturas_nominativas n
                      where n.folio_venta = o.folio and n.estatus = 'timbrada')
    order by o.folio;
end;
$$;
revoke all on function fn_facturacion_dia(date) from public, anon;
grant execute on function fn_facturacion_dia(date) to authenticated, service_role;
