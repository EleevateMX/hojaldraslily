-- ─────────────────────────────────────────────────────────────────────────
-- MONEDERO: mancuernas que se COMPRAN (dinero real del cliente)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Hasta hoy las mancuernas solo se GANABAN (1 por cada $10): una promoción
-- que no cuesta nada regalar y que puede caducar. Las compradas son otra
-- cosa: son dinero que el cliente ya pagó y que el negocio le debe. Por eso
-- viven en una bolsa APARTE (`clientes.saldo_mancuernas`) y no se mezclan
-- con las ganadas:
--
--   · Se puede saber en cualquier momento cuánto dinero de clientes hay en
--     la calle (es un pasivo, no una promoción).
--   · Las ganadas pueden caducar; el dinero comprado NO — caducarlo sería
--     quedarse con dinero ajeno.
--   · Al canjear se gastan PRIMERO las ganadas, que son las que caducan.
--
-- Tasa: 10 mancuernas = $1 MXN. Vive en fn_tasa_mancuernas() para no
-- quedar dispersa por el código.

create or replace function public.fn_tasa_mancuernas()
returns integer language sql immutable as $$ select 10 $$;

alter table clientes add column if not exists saldo_mancuernas integer not null default 0;
alter table clientes add constraint clientes_saldo_no_negativo
  check (saldo_mancuernas >= 0) not valid;
alter table clientes validate constraint clientes_saldo_no_negativo;

-- Toda entrada y salida de saldo queda registrada: con dinero real, "el
-- saldo dice X" no basta — hay que poder reconstruir cómo llegó a X.
create table if not exists saldo_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  -- Positivo carga, negativo canjea.
  mancuernas integer not null,
  -- 'compra' | 'canje' | 'devolucion' | 'ajuste' | 'tarjeta'
  tipo text not null,
  orden_id uuid references ordenes(id),
  descripcion text,
  -- Quién lo hizo (empleado); null si lo disparó el sistema.
  empleado_id uuid references empleados(id),
  saldo_despues integer not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_saldo_mov_cliente on saldo_movimientos (cliente_id, created_at desc);
-- Una orden no puede canjear dos veces: la red se cae, el cajero repite, y
-- sin esto el saldo se iría al doble.
create unique index if not exists uq_saldo_canje_por_orden
  on saldo_movimientos (orden_id) where tipo = 'canje';

alter table saldo_movimientos enable row level security;
create policy saldo_mov_propio on saldo_movimientos for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.auth_user_id = auth.uid())
         or coalesce(fn_es_staff(), false));

-- ─────────────────────── Paquetes de recarga ───────────────────────
create table if not exists paquetes_saldo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio_mxn numeric(10,2) not null check (precio_mxn > 0),
  mancuernas integer not null check (mancuernas > 0),
  -- El producto con el que se cobra: la recarga se vende como cualquier
  -- otra cosa, así entra al corte y se cobra con Clip o efectivo por el
  -- mismo camino ya probado. No se inventa una ruta nueva para el dinero.
  producto_id uuid references productos(id),
  activo boolean not null default true,
  orden integer not null default 0
);

alter table paquetes_saldo enable row level security;
create policy paquetes_leer on paquetes_saldo for select to anon, authenticated using (activo);

grant select on paquetes_saldo to anon, authenticated;
grant select on saldo_movimientos to authenticated;