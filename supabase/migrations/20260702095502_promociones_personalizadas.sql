-- =====================================================================
-- Promociones personalizadas (aditivo). Segmentación por sabor favorito,
-- día de semana, franja horaria y frecuencia de compra. Tope 1 promo por
-- cliente cada 15 días (fundamento del cliente). No toca app_data.
-- =====================================================================

do $$ begin
  create type tipo_promocion as enum ('descuento_pct','descuento_monto','producto_gratis');
exception when duplicate_object then null; end $$;

create table if not exists promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  tipo tipo_promocion not null,
  valor numeric not null default 0,          -- pct (0-1) o monto; ignorado en producto_gratis
  categoria_gratis text,                     -- para producto_gratis: categoría elegible (ej. 'Shakes')
  activa boolean not null default true,
  vence_en date,
  -- segmentación (null = no filtra)
  sabor_favorito text,
  dias_semana int[],                         -- 0=domingo .. 6=sábado
  hora_inicio time,
  hora_fin time,
  min_compras_30d integer,                   -- frecuencia mínima en últimos 30 días
  created_at timestamptz not null default now()
);

create table if not exists promocion_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references promociones(id),
  cliente_id uuid not null references clientes(id),
  orden_id uuid references ordenes(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_promoapp_cliente on promocion_aplicaciones (cliente_id, created_at desc);

-- Promos que aplican a un cliente AHORA (segmentación + vigencia + throttle 15 días).
create or replace function fn_promos_cliente(p_cliente uuid)
returns setof promociones language sql stable security definer set search_path = public as $$
  with ctx as (
    select c.sabor_favorito,
           (now() at time zone 'America/Merida') as ahora,
           (select count(*) from ordenes o where o.cliente_id = p_cliente and o.pagado = true
              and o.created_at >= now() - interval '30 days') as compras_30d
    from clientes c where c.id = p_cliente
  )
  select p.* from promociones p, ctx
  where p.activa
    and (p.vence_en is null or p.vence_en >= (ctx.ahora)::date)
    and (p.sabor_favorito is null or p.sabor_favorito = ctx.sabor_favorito)
    and (p.dias_semana is null or extract(dow from ctx.ahora)::int = any(p.dias_semana))
    and (p.hora_inicio is null or ctx.ahora::time >= p.hora_inicio)
    and (p.hora_fin is null or ctx.ahora::time <= p.hora_fin)
    and (p.min_compras_30d is null or ctx.compras_30d >= p.min_compras_30d)
    -- throttle: sin promos aplicadas al cliente en los últimos 15 días
    and not exists (
      select 1 from promocion_aplicaciones pa
      where pa.cliente_id = p_cliente and pa.created_at >= now() - interval '15 days'
    );
$$;

alter table promociones enable row level security;
alter table promocion_aplicaciones enable row level security;
do $$ begin
  create policy sel_promociones on promociones for select using (true);
  create policy ins_promociones on promociones for insert with check (true);
  create policy upd_promociones on promociones for update using (true);
  create policy sel_promoapp on promocion_aplicaciones for select using (true);
  create policy ins_promoapp on promocion_aplicaciones for insert with check (true);
exception when duplicate_object then null; end $$;