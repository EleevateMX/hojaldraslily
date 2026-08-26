do $$ begin
  create type estado_pago_orden as enum (
    'draft', 'pending_payment', 'awaiting_counter_payment', 'payment_processing',
    'paid', 'cancelled', 'expired', 'payment_unknown', 'refunded_partial', 'refunded_full'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_transaccion_pago as enum (
    'created', 'pending', 'processing', 'authorized', 'declined', 'cancelled',
    'expired', 'unknown', 'refunded_partial', 'refunded_full'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type modo_pago_kiosko as enum ('clip', 'pagar_en_caja', 'demo');
exception when duplicate_object then null; end $$;

alter table ordenes add column if not exists estado_pago_orden estado_pago_orden not null default 'draft';
alter table ordenes add column if not exists expira_en timestamptz;
alter table ordenes add column if not exists codigo_corto text;

alter table pagos add column if not exists estado_transaccion estado_transaccion_pago not null default 'created';
alter table pagos add column if not exists proveedor text not null default 'manual';
alter table pagos add column if not exists proveedor_payment_id text;
alter table pagos add column if not exists proveedor_error text;

create unique index if not exists uq_ordenes_codigo_corto on ordenes (codigo_corto) where codigo_corto is not null;
create index if not exists idx_ordenes_estado_pago_orden on ordenes (estado_pago_orden);
create index if not exists idx_ordenes_expira_en on ordenes (expira_en) where estado_pago_orden = 'awaiting_counter_payment';
create index if not exists idx_pagos_estado_transaccion on pagos (estado_transaccion);
create index if not exists idx_pagos_proveedor_payment_id on pagos (proveedor_payment_id) where proveedor_payment_id is not null;

create table if not exists venta_confirmaciones (
  orden_id uuid primary key references ordenes(id),
  pago_id uuid not null references pagos(id),
  confirmado_en timestamptz not null default now()
);

create table if not exists configuracion_kiosko (
  sucursal_id uuid primary key references sucursales(id),
  modo_pago modo_pago_kiosko not null default 'pagar_en_caja',
  clip_configurado boolean not null default false,
  expira_minutos integer not null default 15 check (expira_minutos > 0),
  updated_at timestamptz not null default now()
);

insert into configuracion_kiosko (sucursal_id)
select id from sucursales
on conflict (sucursal_id) do nothing;

drop trigger if exists trg_configuracion_kiosko_updated_at on configuracion_kiosko;
create trigger trg_configuracion_kiosko_updated_at
  before update on configuracion_kiosko
  for each row execute function fn_set_updated_at();

create table if not exists ordenes_auditoria (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id),
  evento text not null,
  detalle jsonb,
  created_at timestamptz not null default now()
);

alter table venta_confirmaciones enable row level security;
alter table configuracion_kiosko enable row level security;
alter table ordenes_auditoria enable row level security;

do $$ begin
  create policy sel_venta_confirmaciones on venta_confirmaciones for select using (true);
  create policy sel_configuracion_kiosko on configuracion_kiosko for select using (true);
  create policy sel_ordenes_auditoria on ordenes_auditoria for select using (true);
exception when duplicate_object then null; end $$;