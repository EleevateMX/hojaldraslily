-- Continuación del intento anterior (falló en el guardián es_extra).
-- Los 5 boosters pasan a ser extras: salen del grid del catálogo y entran
-- al modal de personalización de cada bebida preparada.

alter table producto_extras add column if not exists precio numeric(10,2);

create or replace view vw_producto_extras as
select pe.producto_id,
       e.id as extra_id,
       e.nombre,
       coalesce(pe.precio, e.precio)::numeric(10,2) as precio,
       e.activo
from producto_extras pe
join productos e on e.id = pe.extra_id;

create or replace function public.fn_precio_linea(p_producto_id uuid, p_padre_producto_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select pe.precio from producto_extras pe
      where pe.producto_id = p_padre_producto_id and pe.extra_id = p_producto_id),
    (select precio from productos where id = p_producto_id)
  )
$$;

-- Los boosters se vuelven extras ANTES de ligarlos (guardián es_extra).
update productos set es_extra = true
where nombre in (
  'Scoop BIRDMAN - Creatina Monohidratada (Polvo)',
  'Scoop META NUTRITION - Cólageno Hidrolizado (Sin Sabor)',
  'Scoop BIRDMAN - Daily Spore Probiotic',
  'Scoop BIRDMAN - Myo & D-Chiro Inositol (Polvo)',
  'Scoop GAT SPORT - BCAA Powder (Sin Sabor)'
) and not es_extra;

update producto_extras pe
set precio = 10
from productos p, productos e
where pe.producto_id = p.id and pe.extra_id = e.id
  and p.nombre in ('Americano Caliente', 'Americano Helado')
  and e.nombre ilike 'leche%';

insert into productos (nombre, precio, categoria_id, es_extra, activo)
select x.nombre, 0, p.categoria_id, p.es_extra, true
from productos p
cross join (values
  ('Proteína BIRDMAN FALCON - Chocolate'),
  ('Proteína BIRDMAN FALCON - Vainilla'),
  ('Proteína BIRDMAN FALCON PERFORMANCE - Choco Bronze'),
  ('Proteína BIRDMAN FALCON PERFORMANCE - Golden Vainilla'),
  ('Proteína BIRDMAN FITMINGO - Moka'),
  ('Proteína BIRDMAN FITMINGO - Vainilla'),
  ('Proteína ISO 100 - Chocolate'),
  ('Proteína ISO 100 - Vainilla')
) as x(nombre)
where p.nombre = 'Proteína OPTIMUM - Chocolate'
  and not exists (select 1 from productos d where d.nombre = x.nombre);

insert into producto_extras (producto_id, extra_id)
select p.id, e.id
from productos p
join productos e on e.nombre in (
  'Proteína OPTIMUM - Chocolate',
  'Proteína BIRDMAN FALCON - Chocolate',
  'Proteína BIRDMAN FALCON PERFORMANCE - Choco Bronze',
  'Proteína BIRDMAN FITMINGO - Moka',
  'Proteína ISO 100 - Chocolate',
  'Proteína ISOPURE - Chocolate'
)
where p.id = 'b8de020a-3297-49fb-b746-7b8d5766f20f'
on conflict do nothing;

insert into producto_extras (producto_id, extra_id)
select p.id, e.id
from productos p
join productos e on e.nombre in (
  'Proteína OPTIMUM - Vainilla',
  'Proteína BIRDMAN FALCON - Vainilla',
  'Proteína BIRDMAN FALCON PERFORMANCE - Golden Vainilla',
  'Proteína BIRDMAN FITMINGO - Vainilla',
  'Proteína CBUM - Vainilla',
  'Proteína ISO 100 - Vainilla',
  'Proteína ISOPURE - Vainilla'
)
where p.id in (
  '0b06cfeb-bfcf-4f3f-8f39-789d847cb44b',
  'cabe189a-2987-4dbf-9880-6d62032af739',
  'e67081a5-1124-484a-aab9-ac3f8f1b70ce',
  'ce985240-6b19-44b8-8fe8-43d9c7ddf675',
  '4589a753-8434-460a-8bbf-2f2394f5534b'
)
on conflict do nothing;

insert into producto_extras (producto_id, extra_id)
select distinct p.id, b.id
from productos p
join categorias c on c.id = p.categoria_id
join cocinas k on k.id = c.cocina_id
join productos b on b.nombre in (
  'Scoop BIRDMAN - Creatina Monohidratada (Polvo)',
  'Scoop META NUTRITION - Cólageno Hidrolizado (Sin Sabor)',
  'Scoop BIRDMAN - Daily Spore Probiotic',
  'Scoop BIRDMAN - Myo & D-Chiro Inositol (Polvo)',
  'Scoop GAT SPORT - BCAA Powder (Sin Sabor)'
)
where k.slug = 'bebidas'
  and p.activo
  and not p.es_extra
  and exists (select 1 from producto_extras pe0 where pe0.producto_id = p.id)
on conflict do nothing;