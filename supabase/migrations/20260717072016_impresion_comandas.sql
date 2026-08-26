do $$ begin
  create type tipo_conexion_impresora as enum ('usb', 'red');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ancho_papel as enum ('58mm', '80mm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_trabajo_impresion as enum
    ('pending', 'claimed', 'printing', 'printed', 'retry', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_documento_impresion as enum ('comanda', 'ticket');
exception when duplicate_object then null; end $$;

create table if not exists impresoras (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  nombre text not null,
  cocina_id uuid references cocinas(id),
  tipo_conexion tipo_conexion_impresora not null default 'red',
  ip text,
  puerto integer default 9100,
  nombre_dispositivo text,
  ancho_papel ancho_papel not null default '80mm',
  copias integer not null default 1 check (copias between 1 and 5),
  corte_automatico boolean not null default true,
  buzzer boolean not null default false,
  activa boolean not null default true,
  agente_token uuid not null default gen_random_uuid(),
  agente_id text,
  ultima_conexion timestamptz,
  ultima_impresion timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_impresoras_agente_token on impresoras (agente_token);
create index if not exists idx_impresoras_cocina on impresoras (cocina_id) where activa;

create table if not exists trabajos_impresion (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid references ordenes(id),
  pedido_id uuid references pedidos_cocina(id),
  estacion_id uuid references cocinas(id),
  printer_id uuid references impresoras(id),
  tipo_documento tipo_documento_impresion not null default 'comanda',
  payload jsonb not null,
  estado estado_trabajo_impresion not null default 'pending',
  intentos integer not null default 0,
  max_intentos integer not null default 5,
  idempotency_key uuid,
  error_ultimo text,
  copia_de uuid references trabajos_impresion(id),
  numero_copia integer not null default 1,
  created_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  processing_at timestamptz,
  printed_at timestamptz,
  failed_at timestamptz,
  next_retry_at timestamptz,
  claimed_by text,
  claim_expires_at timestamptz
);

create unique index if not exists uq_trabajos_impresion_idempotency
  on trabajos_impresion (idempotency_key) where idempotency_key is not null;
create index if not exists idx_trabajos_impresion_cola
  on trabajos_impresion (printer_id, estado, next_retry_at);
create index if not exists idx_trabajos_impresion_pedido on trabajos_impresion (pedido_id);
create index if not exists idx_trabajos_impresion_estado on trabajos_impresion (estado);

create table if not exists impresion_auditoria (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references trabajos_impresion(id),
  trabajo_original_id uuid references trabajos_impresion(id),
  empleado_id uuid references empleados(id),
  motivo text,
  created_at timestamptz not null default now()
);