-- =====================================================================
-- Hojaldras Lily Rewards (aditivo) — mancuernas y cupones.
-- Identificación por teléfono + código QR. No toca app_data/app_users.
-- Reglas del fundamento del cliente:
--   1 mancuerna por cada $10; tope 100 por transacción.
--   Cupón al llegar a 100 mancuernas, vigencia 1 año; máx 5 activos.
--   Cupón de cumpleaños: aparte (generado por cron mensual).
-- =====================================================================

do $$ begin create type tipo_mancuerna as enum ('ganadas','canje','ajuste','promo','proximidad'); exception when duplicate_object then null; end $$;
do $$ begin create type tipo_cupon as enum ('mancuernas','cumpleanos'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_cupon as enum ('activo','usado','expirado','cancelado'); exception when duplicate_object then null; end $$;

-- ---------- clientes: campos de lealtad ----------
alter table clientes add column if not exists codigo text unique;
alter table clientes add column if not exists fecha_nacimiento date;
alter table clientes add column if not exists sabor_favorito text;
alter table clientes add column if not exists mancuernas integer not null default 0 check (mancuernas >= 0);

-- código estable para QR (SHK-XXXXXX). Backfill de existentes.
update clientes set codigo = 'SHK-' || upper(substr(replace(id::text,'-',''),1,6)) where codigo is null;
alter table clientes alter column codigo set default 'SHK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

-- ---------- ledger de mancuernas ----------
create table if not exists mancuernas_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  puntos integer not null,
  tipo tipo_mancuerna not null,
  orden_id uuid references ordenes(id),
  descripcion text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mancuernas_cliente on mancuernas_movimientos (cliente_id, created_at desc);

-- ---------- cupones ----------
create table if not exists cupones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo tipo_cupon not null default 'mancuernas',
  codigo text not null unique default 'CUP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  estado estado_cupon not null default 'activo',
  beneficio text not null default 'Recompensa por 100 mancuernas',
  generado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  usado_en timestamptz,
  orden_id_uso uuid references ordenes(id)
);
create index if not exists idx_cupones_cliente on cupones (cliente_id, estado);
create index if not exists idx_cupones_codigo on cupones (codigo);

-- ---------- trigger: acumular mancuernas + generar cupones al pagar ----------
create or replace function fn_acumular_mancuernas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gana integer;
  saldo integer;
  activos integer;
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and NEW.cliente_id is not null then
    -- 1 mancuerna por cada $10, tope 100 por transacción
    gana := least(100, floor(NEW.total / 10.0)::int);
    if gana > 0 then
      update clientes set mancuernas = mancuernas + gana where id = NEW.cliente_id
        returning mancuernas into saldo;
      insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
        values (NEW.cliente_id, gana, 'ganadas', NEW.id, 'Compra folio ' || NEW.folio);

      -- generar cupones por cada 100 mancuernas, respetando máx 5 activos (no cumpleaños)
      loop
        select count(*) into activos from cupones
          where cliente_id = NEW.cliente_id and estado = 'activo' and tipo <> 'cumpleanos';
        exit when saldo < 100 or activos >= 5;
        insert into cupones (cliente_id, tipo, vence_en)
          values (NEW.cliente_id, 'mancuernas', now() + interval '1 year');
        update clientes set mancuernas = mancuernas - 100 where id = NEW.cliente_id
          returning mancuernas into saldo;
        insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
          values (NEW.cliente_id, -100, 'canje', NEW.id, 'Cupón generado por 100 mancuernas');
      end loop;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_acumular_mancuernas on ordenes;
create trigger trg_acumular_mancuernas
  after update on ordenes
  for each row execute function fn_acumular_mancuernas();

-- ---------- función: cupones de cumpleaños (para cron mensual) ----------
-- Genera 1 cupón de cumpleaños a clientes que cumplen este mes y compraron
-- el mes anterior. Idempotente por (cliente, año). Programar con pg_cron o
-- una edge function el día 1 de cada mes (ver docs/flujo-lealtad.md).
create or replace function fn_generar_cupones_cumpleanos()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  insert into cupones (cliente_id, tipo, beneficio, vence_en)
  select c.id, 'cumpleanos',
    'Shake gratis (proteína a elegir, sin galletas)',
    (date_trunc('month', now()) + interval '1 month' - interval '1 day')
  from clientes c
  where c.activo
    and c.fecha_nacimiento is not null
    and extract(month from c.fecha_nacimiento) = extract(month from now())
    -- compró el mes anterior
    and exists (
      select 1 from ordenes o
      where o.cliente_id = c.id and o.pagado = true
        and o.created_at >= date_trunc('month', now()) - interval '1 month'
        and o.created_at < date_trunc('month', now())
    )
    -- aún no tiene cupón de cumpleaños de este año
    and not exists (
      select 1 from cupones cp
      where cp.cliente_id = c.id and cp.tipo = 'cumpleanos'
        and extract(year from cp.generado_en) = extract(year from now())
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- RLS ----------
alter table mancuernas_movimientos enable row level security;
alter table cupones enable row level security;
do $$ begin
  create policy sel_mancuernas on mancuernas_movimientos for select using (true);
  create policy ins_mancuernas on mancuernas_movimientos for insert with check (true);
  create policy sel_cupones on cupones for select using (true);
  create policy ins_cupones on cupones for insert with check (true);
  create policy upd_cupones on cupones for update using (true);
exception when duplicate_object then null; end $$;