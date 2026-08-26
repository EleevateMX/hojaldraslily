-- Scoops y Suplementos se parten por tipo.
-- Ver supabase/migrations/categorias_de_scoops_y_suplementos.sql para el detalle.
insert into categorias (cocina_id, nombre, orden, activa, va_a_pantalla)
select madre.cocina_id, x.nombre, x.orden, true, madre.va_a_pantalla
from (values
  ('Scoops - Proteínas',14,'Scoops'), ('Scoops - Creatinas',15,'Scoops'),
  ('Scoops - BCAAs',16,'Scoops'), ('Scoops - Colágeno',17,'Scoops'),
  ('Scoops - Pre-entrenos',18,'Scoops'), ('Scoops - Birdman',19,'Scoops'),
  ('Suplementos - Proteínas',20,'Suplementos'), ('Suplementos - Creatinas',21,'Suplementos'),
  ('Suplementos - BCAAs',22,'Suplementos'), ('Suplementos - Colágeno',23,'Suplementos'),
  ('Suplementos - Pre-entrenos',24,'Suplementos'), ('Suplementos Birdman',25,'Suplementos')
) as x(nombre, orden, madre_nombre)
join categorias madre on madre.nombre = x.madre_nombre
where not exists (select 1 from categorias c where c.nombre = x.nombre);

with destino as (
  select p.id as producto_id, nueva.id as categoria_id
  from productos p
  join categorias vieja on vieja.id = p.categoria_id
  cross join lateral (select case
    when p.nombre ~* 'creatin'                        then 'Creatinas'
    when p.nombre ~* 'bcaa|amino energy|xtend|aminon' then 'BCAAs'
    when p.nombre ~* 'c[oó]l[aá]geno|collagen'        then 'Colágeno'
    when p.nombre ~* 'c4 |nitraflex|psychotic|ghost legend|pre.?work|pre.?entreno'
                                                      then 'Pre-entrenos'
    when p.nombre ~* 'falcon|fitmingo|peacock|parrot|cbum|iso ?100|isopure|mutant|optimum nutrition|whey|prote'
                                                      then 'Proteínas'
    when p.nombre ~* 'birdman'                        then 'Birdman'
    else null
  end as tipo) t
  join categorias nueva on nueva.nombre = case
    when vieja.nombre = 'Scoops' then 'Scoops - ' || t.tipo
    when t.tipo = 'Birdman'      then 'Suplementos Birdman'
    else 'Suplementos - ' || t.tipo
  end
  where vieja.nombre in ('Scoops', 'Suplementos')
    and p.activo and not p.es_extra and t.tipo is not null
)
update productos p
set categoria_id = d.categoria_id
from destino d
where d.producto_id = p.id;