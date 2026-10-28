-- Facturación global diaria con ContaDigital (Isyconta).
--
-- La casa factura DIARIO para comprobar ingresos: una sola "factura global"
-- a público en general por cada día, donde CADA FOLIO del día entra como un
-- renglón (descripción = folio, importe = total de ese folio). El pan va a
-- TASA 0% de IVA, así que subtotal = total.
--
-- Esto es SOLO el lado de la base: la tabla donde queda el comprobante
-- (UUID, PDF, XML) y la consulta de qué se factura ese día. El timbrado vive
-- en la Edge Function `contadigital-facturar` (ahí están los secretos y la
-- llamada a ContaDigital); esta base NUNCA guarda la API Key.
--
-- Igual que el corte: el total lo decide el servidor (se lee de `ordenes`),
-- nunca la pantalla.

-- 1. El comprobante guardado --------------------------------------------------

create table if not exists facturas_globales (
  id             uuid primary key default gen_random_uuid(),
  -- El día facturado, en horario de Mérida (así se agrupan las ventas).
  fecha          date not null,
  -- Control interno ÚNICO que ContaDigital usa para no duplicar: 'GLOBAL-YYYYMMDD'.
  folio_original text not null,
  ambiente       text not null default 'pro',   -- 'pro' | 'pruebas'
  id_empresa     bigint,                         -- IdEmpresa en ContaDigital
  uuid           text,                           -- Folio fiscal (UUID del SAT)
  serie          text,
  folio_cfdi     bigint,                         -- folio que devuelve ContaDigital
  estatus        text not null default 'pendiente', -- pendiente | timbrada | error | cancelada
  num_folios     integer not null default 0,     -- cuántas ventas entraron
  subtotal       numeric(12,2) not null default 0,
  iva            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  pdf_link       text,
  xml_link       text,
  mensaje        text,                           -- mensaje de ContaDigital (ok o error)
  respuesta      jsonb,                          -- respuesta cruda, para auditar
  creado_por     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table facturas_globales is
  'Facturas globales diarias timbradas con ContaDigital. Una por día (folio_original GLOBAL-YYYYMMDD).';

-- Un día no se puede timbrar dos veces. El índice parcial deja reintentar
-- cuando quedó en error, pero cierra la puerta en cuanto hay una timbrada.
create unique index if not exists uq_facturas_globales_dia_timbrado
  on facturas_globales (folio_original)
  where estatus = 'timbrada';

create index if not exists ix_facturas_globales_fecha
  on facturas_globales (fecha desc);

alter table facturas_globales enable row level security;

-- Leer: solo el personal (gerencia lo mira en Admin). Escribir: nadie por
-- RLS — la Edge Function entra con service_role (se salta RLS) y es el único
-- que inserta/actualiza. Así no hay forma de inventar un comprobante desde el
-- navegador con la llave publicable.
drop policy if exists facturas_globales_leer on facturas_globales;
create policy facturas_globales_leer on facturas_globales
  for select to authenticated
  using (fn_es_staff());

revoke all on facturas_globales from anon;
grant select on facturas_globales to authenticated;

-- 2. Qué se factura ese día ---------------------------------------------------
--
-- Las ventas PAGADAS y NO canceladas del día (en Mérida), una por folio. Es
-- la misma regla de día que usan `fn_catalogo_del_dia` y las existencias:
-- `(created_at at time zone 'America/Merida')::date`. Una venta cancelada
-- queda con pagado=false, así que el filtro de pagado ya la saca; el
-- `estado <> 'cancelada'` es el cinturón además del tirante.

create or replace function fn_facturacion_dia(p_fecha date)
returns table (folio integer, total numeric, hora text, canal text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- El personal lo consulta desde Admin; la Edge Function entra con
  -- service_role (sin auth.uid), así que se permite ese rol aparte.
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
    order by o.folio;
end;
$$;

revoke all on function fn_facturacion_dia(date) from public, anon;
grant execute on function fn_facturacion_dia(date) to authenticated, service_role;

-- 3. El historial de facturas -------------------------------------------------

create or replace function fn_facturas_listar(p_desde date, p_hasta date)
returns setof facturas_globales
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver las facturas'
      using errcode = '42501';
  end if;

  return query
    select * from facturas_globales
    where fecha between p_desde and p_hasta
    order by fecha desc, created_at desc;
end;
$$;

revoke all on function fn_facturas_listar(date, date) from public, anon;
grant execute on function fn_facturas_listar(date, date) to authenticated;
