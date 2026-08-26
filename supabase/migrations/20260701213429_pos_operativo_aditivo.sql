-- =====================================================================
-- POS OPERATIVO (aditivo) — Hojaldras Lily
-- Completa el modelo de core_unificado con las entidades operativas:
-- roles, empleados, clientes, cajas, cortes de caja, pagos (Clip-ready),
-- pedidos de cocina, categorías de insumos, vistas y realtime.
-- NO toca app_data ni app_users. NO borra nada.
-- =====================================================================

-- ------------------------- enums nuevos ------------------------------
do $$ begin
  create type estado_pago as enum ('pendiente','aprobado','rechazado','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_corte as enum ('abierta','cerrada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_cocina as enum ('pendiente','en_preparacion','listo','entregado','cancelado');
exception when duplicate_object then null; end $$;

-- ------------------------- roles y empleados -------------------------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null
);

insert into roles (slug, nombre) values
  ('admin','Administrador'),
  ('gerente','Gerente'),
  ('cajero','Cajero'),
  ('cocina','Cocina')
on conflict (slug) do nothing;

create table if not exists empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rol_id uuid not null references roles(id),
  sucursal_id uuid references sucursales(id),
  -- PIN corto para operar POS/caja; se guarda hasheado (sha256), nunca en claro
  pin_hash text,
  -- enlace opcional a Supabase Auth (fase de hardening)
  auth_user_id uuid,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------- clientes ----------------------------------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------- cajas y cortes ----------------------------
create table if not exists cajas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sucursal_id uuid not null references sucursales(id),
  activa boolean not null default true,
  unique (nombre, sucursal_id)
);

insert into cajas (nombre, sucursal_id)
select 'Caja Kiosko', id from sucursales where nombre = 'Hojaldras Lily Mérida'
on conflict (nombre, sucursal_id) do nothing;

create table if not exists caja_cortes (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references cajas(id),
  empleado_apertura_id uuid references empleados(id),
  empleado_cierre_id uuid references empleados(id),
  estado estado_corte not null default 'abierta',
  fondo_inicial numeric not null default 0 check (fondo_inicial >= 0),
  efectivo_contado numeric,
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz,
  notas text
);

-- solo puede existir un corte abierto por caja
create unique index if not exists uq_corte_abierto_por_caja
  on caja_cortes (caja_id) where (estado = 'abierta');

-- ------------------------- pagos (Clip-ready) ------------------------
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id),
  metodo metodo_pago not null,
  monto numeric not null check (monto >= 0),
  estado estado_pago not null default 'pendiente',
  -- referencia libre (folio de voucher, nota de cortesía, etc.)
  referencia text,
  -- campos Clip: id de pago en Clip, terminal, y payload crudo del webhook
  clip_payment_id text,
  clip_terminal_id text,
  clip_payload jsonb,
  autorizado_por uuid references empleados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pagos_orden on pagos (orden_id);
create index if not exists idx_pagos_clip on pagos (clip_payment_id) where clip_payment_id is not null;

-- ------------------------- pedidos de cocina -------------------------
create table if not exists pedidos_cocina (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id),
  cocina_id uuid not null references cocinas(id),
  estado estado_cocina not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (orden_id, cocina_id)
);

create table if not exists cocina_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_cocina(id) on delete cascade,
  orden_item_id uuid not null unique references orden_items(id),
  producto_id uuid references productos(id),
  cantidad integer not null default 1 check (cantidad > 0),
  personalizacion text,
  estado estado_cocina not null default 'pendiente'
);

create index if not exists idx_pedidos_cocina_estado on pedidos_cocina (cocina_id, estado);
create index if not exists idx_cocina_items_pedido on cocina_items (pedido_id);

-- ------------------------- categorías de insumos ---------------------
create table if not exists insumo_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true
);

insert into insumo_categorias (nombre) values
  ('Proteínas'), ('Ingredientes Shake'), ('Ingredientes Alimentos'),
  ('Bebidas'), ('Snacks'), ('Empaque')
on conflict (nombre) do nothing;

alter table insumos add column if not exists categoria_id uuid references insumo_categorias(id);

-- ------------------------- columnas nuevas en ordenes ----------------
alter table ordenes add column if not exists corte_id uuid references caja_cortes(id);
alter table ordenes add column if not exists empleado_id uuid references empleados(id);
alter table ordenes add column if not exists cliente_id uuid references clientes(id);

create index if not exists idx_ordenes_corte on ordenes (corte_id);

-- ------------------------- categorías de producto semilla ------------
create unique index if not exists uq_categorias_nombre on categorias (nombre);

insert into categorias (nombre, cocina_id)
select v.nombre, c.id
from (values
  ('Shakes','bebidas'),
  ('Bebidas','bebidas'),
  ('Snacks','bebidas'),
  ('Alimentos','alimentos')
) as v(nombre, cocina_slug)
join cocinas c on c.slug = v.cocina_slug
on conflict (nombre) do nothing;

-- ------------------------- triggers ----------------------------------
-- El trigger existente de inventario corre con permisos del que hace el
-- UPDATE; con RLS activo y sin policies en ventas/inventario_* fallaba.
-- security definer lo hace operar con permisos del owner (fix necesario).
alter function public.fn_descontar_inventario_por_orden() security definer set search_path = public;

-- pago aprobado => orden pagada (dispara inventario y cocina)
create or replace function fn_pago_aprobado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if NEW.estado = 'aprobado' and (TG_OP = 'INSERT' or OLD.estado is distinct from 'aprobado') then
    update ordenes
       set pagado = true, metodo_pago = NEW.metodo, updated_at = now()
     where id = NEW.orden_id and pagado = false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_pago_aprobado on pagos;
create trigger trg_pago_aprobado
  after insert or update of estado on pagos
  for each row execute function fn_pago_aprobado();

-- orden pagada => se generan pedidos de cocina por estación
create or replace function fn_crear_pedidos_cocina()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true then
    insert into pedidos_cocina (orden_id, cocina_id)
    select distinct NEW.id,
      coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    where oi.orden_id = NEW.id
    on conflict (orden_id, cocina_id) do nothing;

    insert into cocina_items (pedido_id, orden_item_id, producto_id, cantidad, personalizacion)
    select pc.id, oi.id, oi.producto_id, oi.cantidad, oi.personalizacion
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    join pedidos_cocina pc on pc.orden_id = NEW.id
      and pc.cocina_id = coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    where oi.orden_id = NEW.id
    on conflict (orden_item_id) do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_crear_pedidos_cocina on ordenes;
create trigger trg_crear_pedidos_cocina
  after update on ordenes
  for each row execute function fn_crear_pedidos_cocina();

-- updated_at automático en tablas nuevas
drop trigger if exists trg_pagos_updated_at on pagos;
create trigger trg_pagos_updated_at
  before update on pagos
  for each row execute function fn_set_updated_at();

drop trigger if exists trg_pedidos_cocina_updated_at on pedidos_cocina;
create trigger trg_pedidos_cocina_updated_at
  before update on pedidos_cocina
  for each row execute function fn_set_updated_at();

-- ------------------------- vistas ------------------------------------
-- v2 de costeo: mismas columnas que v1 + costo_empaque, costo_receta,
-- precio_con_iva y margen_pct (CREATE OR REPLACE solo agrega columnas).
create or replace view vw_costeo_producto as
with p as (
  select * from parametros where id = 'default'
), costos as (
  select
    pr.id as producto_id,
    coalesce(sum(r.cantidad * i.costo_unitario), 0) as costo_insumos,
    coalesce(sum(r.cantidad * i.costo_unitario) filter (where i.tipo = 'empaque'), 0) as costo_empaque
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
  round((c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra)
        / nullif(case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end, 0), 4) as food_cost_pct,
  round(case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end
        - (c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra), 2) as margen,
  round(round((c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra)
        / nullif(p.food_cost_meta, 0) * (1 + p.iva) / 5.0) * 5.0, 2) as precio_sugerido,
  round(c.costo_empaque, 2) as costo_empaque,
  round(c.costo_insumos - c.costo_empaque, 2) as costo_receta,
  round(case when pr.iva_incluido then pr.precio else pr.precio * (1 + p.iva) end, 2) as precio_con_iva,
  round((case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end
        - (c.costo_insumos * (1 + coalesce(pr.merma_pct, p.merma_default)) + pr.mano_obra))
        / nullif(case when pr.iva_incluido then pr.precio / (1 + p.iva) else pr.precio end, 0), 4) as margen_pct
from productos pr
join costos c on c.producto_id = pr.id
cross join p;

-- resumen de corte: totales por método a partir de pagos aprobados
create or replace view vw_corte_resumen as
select
  cc.id as corte_id,
  cc.caja_id,
  ca.nombre as caja,
  cc.estado,
  cc.abierto_en,
  cc.cerrado_en,
  cc.fondo_inicial,
  cc.efectivo_contado,
  count(distinct o.id) as num_ordenes,
  coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as total_efectivo,
  coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'), 0) as total_tarjeta,
  coalesce(sum(p.monto) filter (where p.metodo = 'clip'), 0) as total_clip,
  coalesce(sum(p.monto) filter (where p.metodo = 'cortesia'), 0) as total_cortesia,
  coalesce(sum(p.monto) filter (where p.metodo = 'otro'), 0) as total_otro,
  coalesce(sum(p.monto), 0) as total_pagado,
  cc.fondo_inicial + coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as efectivo_esperado,
  cc.efectivo_contado - (cc.fondo_inicial + coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0)) as diferencia
from caja_cortes cc
join cajas ca on ca.id = cc.caja_id
left join ordenes o on o.corte_id = cc.id
left join pagos p on p.orden_id = o.id and p.estado = 'aprobado'
group by cc.id, ca.nombre;

-- existencias por almacén
create or replace view vw_stock_almacen as
select
  s.id,
  s.almacen_id,
  a.nombre as almacen,
  a.tipo as almacen_tipo,
  s.insumo_id,
  i.nombre as insumo,
  i.tipo as insumo_tipo,
  i.unidad,
  s.stock_actual,
  s.stock_minimo,
  (s.stock_actual <= s.stock_minimo) as bajo_minimo
from inventario_stock s
join almacenes a on a.id = s.almacen_id
join insumos i on i.id = s.insumo_id;

-- ------------------------- RLS y policies ----------------------------
-- Postura actual del proyecto: acceso con anon key (login legacy propio).
-- Se replica esa postura en tablas nuevas para no romper operación.
-- El endurecimiento (Supabase Auth + roles) queda para la fase 9.
alter table roles enable row level security;
alter table empleados enable row level security;
alter table clientes enable row level security;
alter table cajas enable row level security;
alter table caja_cortes enable row level security;
alter table pagos enable row level security;
alter table pedidos_cocina enable row level security;
alter table cocina_items enable row level security;
alter table insumo_categorias enable row level security;

do $$ begin
  -- lectura
  create policy sel_roles on roles for select using (true);
  create policy sel_empleados on empleados for select using (true);
  create policy sel_clientes on clientes for select using (true);
  create policy sel_cajas on cajas for select using (true);
  create policy sel_caja_cortes on caja_cortes for select using (true);
  create policy sel_pagos on pagos for select using (true);
  create policy sel_pedidos_cocina on pedidos_cocina for select using (true);
  create policy sel_cocina_items on cocina_items for select using (true);
  create policy sel_insumo_categorias on insumo_categorias for select using (true);
  -- escritura operativa
  create policy ins_clientes on clientes for insert with check (true);
  create policy upd_clientes on clientes for update using (true);
  create policy ins_caja_cortes on caja_cortes for insert with check (true);
  create policy upd_caja_cortes on caja_cortes for update using (true);
  create policy ins_pagos on pagos for insert with check (true);
  create policy upd_pagos on pagos for update using (true);
  create policy upd_pedidos_cocina on pedidos_cocina for update using (true);
  create policy upd_cocina_items on cocina_items for update using (true);
exception when duplicate_object then null; end $$;

-- Tablas de core_unificado que tenían RLS activo sin policies (quedaban
-- inaccesibles con anon key). Se abren para operar costos/inventario.
do $$ begin
  create policy sel_insumos on insumos for select using (true);
  create policy ins_insumos on insumos for insert with check (true);
  create policy upd_insumos on insumos for update using (true);
  create policy sel_recetas on recetas for select using (true);
  create policy ins_recetas on recetas for insert with check (true);
  create policy upd_recetas on recetas for update using (true);
  create policy del_recetas on recetas for delete using (true);
  create policy sel_parametros on parametros for select using (true);
  create policy upd_parametros on parametros for update using (true);
  create policy sel_sucursales on sucursales for select using (true);
  create policy sel_almacenes on almacenes for select using (true);
  create policy sel_inv_stock on inventario_stock for select using (true);
  create policy ins_inv_stock on inventario_stock for insert with check (true);
  create policy upd_inv_stock on inventario_stock for update using (true);
  create policy sel_inv_mov on inventario_movimientos for select using (true);
  create policy ins_inv_mov on inventario_movimientos for insert with check (true);
  create policy sel_ventas on ventas for select using (true);
  create policy sel_transferencias on transferencias for select using (true);
  create policy ins_transferencias on transferencias for insert with check (true);
  create policy upd_transferencias on transferencias for update using (true);
  create policy sel_transferencia_items on transferencia_items for select using (true);
  create policy ins_transferencia_items on transferencia_items for insert with check (true);
  create policy sel_mermas on mermas for select using (true);
  create policy ins_mermas on mermas for insert with check (true);
  create policy sel_lotes on lotes for select using (true);
  create policy ins_lotes on lotes for insert with check (true);
  create policy upd_lotes on lotes for update using (true);
  -- catálogo editable desde costos/admin
  create policy ins_productos on productos for insert with check (true);
  create policy upd_productos on productos for update using (true);
  create policy sel_productos_all on productos for select using (true);
  create policy ins_categorias on categorias for insert with check (true);
  create policy upd_categorias on categorias for update using (true);
  create policy sel_categorias_all on categorias for select using (true);
  -- POS necesita actualizar ordenes (asignar corte, cancelar, etc.)
  create policy upd_ordenes_pos on ordenes for update using (true);
exception when duplicate_object then null; end $$;

-- ------------------------- realtime ----------------------------------
do $$
declare t text;
begin
  foreach t in array array['ordenes','orden_items','pedidos_cocina','cocina_items','pagos','inventario_stock']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;