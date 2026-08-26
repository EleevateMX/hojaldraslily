-- El doble scoop cuesta lo que cuesta ESA proteína.
-- Ver supabase/migrations/doble_scoop_por_marca.sql para el razonamiento.
update productos set marca = case
  when nombre ilike 'Proteína BIRDMAN FALCON PERFORMANCE - %' then 'BIRDMAN FALCON PERFORMANCE'
  when nombre ilike 'Proteína BIRDMAN FALCON - %'             then 'BIRDMAN FALCON'
  when nombre ilike 'Proteína BIRDMAN FITMINGO - %'           then 'BIRDMAN FITMINGO'
  when nombre ilike 'Proteína BIRDMAN PEACOCK - %'            then 'BIRDMAN PEACOCK'
  when nombre ilike 'Proteína OPTIMUM - %'                    then 'OPTIMUM'
  when nombre ilike 'Proteína CBUM - %'                       then 'CBUM'
  when nombre ilike 'Proteína ISO 100 - %'                    then 'ISO 100'
  when nombre ilike 'Proteína ISOPURE - %'                    then 'ISOPURE'
  when nombre ilike 'Proteína MUTANT - %'                     then 'MUTANT'
  when nombre ilike 'Proteína BIRDMAN - %'                    then 'BIRDMAN FALCON'
  else marca
end
where es_extra and nombre ilike 'Proteína %';

insert into productos (nombre, precio, categoria_id, es_extra, activo, marca)
select 'Doble scoop - ' || x.marca, x.precio, c.id, true, true, x.marca
from categorias c
join (values
  ('OPTIMUM', 25), ('BIRDMAN FALCON', 35), ('BIRDMAN FALCON PERFORMANCE', 39),
  ('BIRDMAN FITMINGO', 39), ('BIRDMAN PEACOCK', 49), ('CBUM', 45),
  ('ISOPURE', 39), ('ISO 100', 45)
) as x(marca, precio) on true
where c.nombre = 'Extras Bebidas'
  and not exists (select 1 from productos p where p.nombre = 'Doble scoop - ' || x.marca);

update productos p set precio = x.precio, marca = x.marca, activo = true, es_extra = true
from (values
  ('OPTIMUM', 25::numeric), ('BIRDMAN FALCON', 35), ('BIRDMAN FALCON PERFORMANCE', 39),
  ('BIRDMAN FITMINGO', 39), ('BIRDMAN PEACOCK', 49), ('CBUM', 45),
  ('ISOPURE', 39), ('ISO 100', 45)
) as x(marca, precio)
where p.nombre = 'Doble scoop - ' || x.marca;

insert into producto_extras (producto_id, extra_id)
select p.id, d.id
from productos p
join productos d on d.es_extra and d.nombre like 'Doble scoop - %'
where p.activo and not p.es_extra and not p.es_combo
  and exists (select 1 from producto_extras pe join productos e on e.id = pe.extra_id
               where pe.producto_id = p.id and e.nombre ilike 'Proteína %')
on conflict (producto_id, extra_id) do nothing;

delete from producto_extras pe
using productos e, productos p
where pe.extra_id = e.id and pe.producto_id = p.id
  and e.nombre ilike 'Doble %scoop de prote%'
  and exists (select 1 from producto_extras pe2 join productos e2 on e2.id = pe2.extra_id
               where pe2.producto_id = p.id and e2.nombre like 'Doble scoop - %');

update producto_extras pe
set precio = m.precio
from productos e, productos p,
     lateral (
       select case
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%PEACOCK%')  then 49
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%CBUM%')     then 45
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%FITMINGO%') then 39
         when exists (select 1 from recetas r join insumos i on i.id = r.insumo_id
                       where r.producto_id = p.id and i.nombre ilike '%FALCON%')   then 35
         else null
       end as precio
     ) m
where pe.extra_id = e.id and pe.producto_id = p.id
  and e.nombre ilike 'Doble %scoop de prote%'
  and m.precio is not null
  and pe.precio is distinct from m.precio;

create or replace view public.vw_producto_extras
with (security_invoker = true) as
select pe.producto_id,
       e.id as extra_id,
       e.nombre,
       coalesce(pe.precio, e.precio)::numeric(10,2) as precio,
       e.activo,
       pe.grupo,
       e.marca
from producto_extras pe
join productos e on e.id = pe.extra_id;

grant select on public.vw_producto_extras to anon, authenticated;