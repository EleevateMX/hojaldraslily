create extension if not exists "pgcrypto";

create table if not exists parametros (
  id             text primary key default 'default' check (id = 'default'),
  iva            numeric(5,4) not null default 0.16,
  food_cost_meta numeric(5,4) not null default 0.30,
  merma_default  numeric(5,4) not null default 0.02,
  mano_obra      numeric(10,2) not null default 0,
  clave_traspaso text not null default '1234',
  clave_compras  text not null default '1234',
  updated_at     timestamptz not null default now()
);
insert into parametros (id) values ('default') on conflict (id) do nothing;

create table if not exists cocinas (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug   text not null unique check (slug in ('alimentos', 'bebidas'))
);
insert into cocinas (nombre, slug) values
  ('Alimentos', 'alimentos'),
  ('Bebidas',   'bebidas')
on conflict (slug) do nothing;

create table if not exists categorias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  cocina_id uuid not null references cocinas(id) on delete restrict,
  activa    boolean not null default true
);

create type tipo_insumo as enum ('proteina', 'shake', 'alimento', 'empaque', 'reventa');

create table if not exists insumos (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  tipo               tipo_insumo not null,
  unidad             text not null default 'g',
  marca              text,
  codigo             text,
  proveedor          text,
  contenido          numeric(12,3) not null default 0,
  costo_compra       numeric(12,2) not null default 0,
  costo_unitario     numeric(14,6) generated always as (
                       case when contenido > 0 then costo_compra / contenido else 0 end
                     ) stored,
  presentacion       text,
  ganancia_pct       numeric(6,2),
  precio_individual  numeric(10,2),
  fecha_caducidad    date,
  ultima_compra      date,
  stock_base         numeric(12,3),
  porciones          jsonb not null default '[]'::jsonb,
  activo             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists idx_insumos_nombre on insumos (lower(trim(nombre)));

create table if not exists productos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  codigo        text,
  descripcion   text,
  categoria_id  uuid references categorias(id) on delete set null,
  precio        numeric(10,2) not null default 0 check (precio >= 0),
  iva_incluido  boolean not null default true,
  merma_pct     numeric(5,4),
  mano_obra     numeric(10,2) not null default 0,
  es_reventa    boolean not null default false,
  imagen_url    text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists recetas (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  insumo_id   uuid not null references insumos(id) on delete restrict,
  cantidad    numeric(12,3) not null default 0 check (cantidad >= 0),
  nota        text,
  unique (producto_id, insumo_id)
);

create type tipo_almacen as enum ('bodega', 'kiosko');

create table if not exists sucursales (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  direccion  text,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists almacenes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        tipo_almacen not null,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  activo      boolean not null default true
);

insert into sucursales (id, nombre)
  values ('00000000-0000-0000-0000-0000000000a1', 'Hojaldras Lily Mérida')
  on conflict (id) do nothing;
insert into almacenes (nombre, tipo, sucursal_id) values
  ('Bodega', 'bodega', '00000000-0000-0000-0000-0000000000a1'),
  ('Kiosko', 'kiosko', '00000000-0000-0000-0000-0000000000a1')
on conflict do nothing;

create table if not exists inventario_stock (
  id           uuid primary key default gen_random_uuid(),
  almacen_id   uuid not null references almacenes(id) on delete cascade,
  insumo_id    uuid not null references insumos(id) on delete cascade,
  stock_actual numeric(12,3) not null default 0,
  stock_minimo numeric(12,3) not null default 0,
  unique (almacen_id, insumo_id)
);

create table if not exists lotes (
  id               uuid primary key default gen_random_uuid(),
  insumo_id        uuid not null references insumos(id) on delete restrict,
  almacen_id       uuid not null references almacenes(id) on delete restrict,
  numero_lote      text,
  cantidad_inicial numeric(12,3) not null check (cantidad_inicial > 0),
  cantidad_actual  numeric(12,3) not null,
  costo_unitario   numeric(12,4),
  fecha_caducidad  date,
  created_at       timestamptz not null default now()
);

create type tipo_movimiento as enum ('compra', 'venta', 'traspaso', 'ajuste', 'merma');

create table if not exists inventario_movimientos (
  id            uuid primary key default gen_random_uuid(),
  insumo_id     uuid not null references insumos(id) on delete restrict,
  almacen_id    uuid references almacenes(id) on delete set null,
  cantidad      numeric(12,3) not null,
  tipo          tipo_movimiento not null,
  costo_unitario numeric(12,4),
  referencia_id uuid,
  nota          text,
  created_at    timestamptz not null default now()
);

create table if not exists transferencias (
  id            uuid primary key default gen_random_uuid(),
  origen_id     uuid not null references almacenes(id) on delete restrict,
  destino_id    uuid not null references almacenes(id) on delete restrict,
  estado        text not null default 'recibida',
  firma         text,
  created_at    timestamptz not null default now()
);
create table if not exists transferencia_items (
  id               uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references transferencias(id) on delete cascade,
  insumo_id        uuid not null references insumos(id) on delete restrict,
  cantidad         numeric(12,3) not null check (cantidad > 0)
);

create table if not exists mermas (
  id         uuid primary key default gen_random_uuid(),
  insumo_id  uuid not null references insumos(id) on delete restrict,
  almacen_id uuid not null references almacenes(id) on delete restrict,
  cantidad   numeric(12,3) not null check (cantidad > 0),
  motivo     text,
  created_at timestamptz not null default now()
);

create type estado_orden as enum ('pendiente','en_preparacion','lista','entregada','cancelada');
create type metodo_pago  as enum ('clip','efectivo','tarjeta','cortesia','otro');
create type canal_orden  as enum ('kiosko','pos','delivery');

create sequence if not exists ordenes_folio_seq start 1;

create table if not exists ordenes (
  id          uuid primary key default gen_random_uuid(),
  folio       integer not null default nextval('ordenes_folio_seq') unique,
  sucursal_id uuid references sucursales(id) on delete set null,
  almacen_id  uuid references almacenes(id) on delete set null,
  canal       canal_orden not null default 'pos',
  estado      estado_orden not null default 'pendiente',
  total       numeric(10,2) not null default 0 check (total >= 0),
  metodo_pago metodo_pago,
  pagado      boolean not null default false,
  clip_recibo text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists orden_items (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references ordenes(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete restrict,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  personalizacion text,
  cocina_slug     text
);

create table if not exists ventas (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null unique references ordenes(id) on delete restrict,
  total           numeric(10,2) not null,
  metodo_pago     metodo_pago not null,
  cfdi_solicitado boolean not null default false,
  created_at      timestamptz not null default now()
);

create or replace function fn_descontar_inventario_por_orden()
returns trigger language plpgsql security definer as $$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and NEW.almacen_id is not null then
    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select r.insumo_id, NEW.almacen_id, -sum(r.cantidad * oi.cantidad), 'venta', NEW.id,
           'Venta folio ' || NEW.folio
    from orden_items oi
    join recetas r on r.producto_id = oi.producto_id
    where oi.orden_id = NEW.id
    group by r.insumo_id;

    update inventario_stock s
    set stock_actual = s.stock_actual - sub.total
    from (
      select r.insumo_id, sum(r.cantidad * oi.cantidad) as total
      from orden_items oi
      join recetas r on r.producto_id = oi.producto_id
      where oi.orden_id = NEW.id
      group by r.insumo_id
    ) sub
    where s.insumo_id = sub.insumo_id and s.almacen_id = NEW.almacen_id;

    if NEW.metodo_pago is not null then
      insert into ventas (orden_id, total, metodo_pago)
      values (NEW.id, NEW.total, NEW.metodo_pago)
      on conflict (orden_id) do nothing;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_descontar_inventario on ordenes;
create trigger trg_descontar_inventario
after update on ordenes
for each row execute function fn_descontar_inventario_por_orden();

create or replace function fn_set_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end; $$;

drop trigger if exists trg_ordenes_updated_at on ordenes;
create trigger trg_ordenes_updated_at
before update on ordenes
for each row execute function fn_set_updated_at();

create or replace view vw_costeo_producto as
with p as (select * from parametros where id = 'default'),
costos as (
  select pr.id as producto_id,
         coalesce(sum(r.cantidad * i.costo_unitario), 0) as costo_insumos
  from productos pr
  left join recetas r on r.producto_id = pr.id
  left join insumos i on i.id = r.insumo_id
  group by pr.id
)
select
  pr.id,
  pr.nombre,
  pr.codigo,
  pr.precio,
  pr.iva_incluido,
  pr.es_reventa,
  c.costo_insumos,
  round(c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)), 2) as costo_con_merma,
  pr.mano_obra,
  round(c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra, 2) as costo_total,
  round(case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end, 2) as precio_sin_iva,
  round(
    (c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra)
    / nullif(case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end, 0), 4
  ) as food_cost_pct,
  round(
    (case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end)
    - (c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra), 2
  ) as margen,
  round(
    round(((c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra)
      / nullif(p.food_cost_meta,0)) * (1 + p.iva) / 5.0) * 5.0, 2
  ) as precio_sugerido
from productos pr
join costos c on c.producto_id = pr.id
cross join p;

alter table parametros            enable row level security;
alter table cocinas               enable row level security;
alter table categorias            enable row level security;
alter table insumos               enable row level security;
alter table productos             enable row level security;
alter table recetas               enable row level security;
alter table sucursales            enable row level security;
alter table almacenes             enable row level security;
alter table inventario_stock      enable row level security;
alter table lotes                 enable row level security;
alter table inventario_movimientos enable row level security;
alter table transferencias        enable row level security;
alter table transferencia_items   enable row level security;
alter table mermas                enable row level security;
alter table ordenes               enable row level security;
alter table orden_items           enable row level security;
alter table ventas                enable row level security;

create policy "cat_read_productos"  on productos  for select using (activo = true);
create policy "cat_read_categorias" on categorias for select using (activa = true);
create policy "cat_read_cocinas"    on cocinas    for select using (true);
create policy "ins_ordenes"     on ordenes     for insert with check (true);
create policy "ins_orden_items" on orden_items for insert with check (true);
create policy "kds_read_ordenes"   on ordenes     for select using (pagado = true);
create policy "kds_upd_ordenes"    on ordenes     for update using (pagado = true);
create policy "kds_read_items"     on orden_items for select using (true);