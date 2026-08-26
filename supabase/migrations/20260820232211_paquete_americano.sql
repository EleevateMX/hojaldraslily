-- Paquete Americano: $99, o $109 con galleta.
-- Ver supabase/migrations/paquete_americano.sql para el razonamiento completo.
insert into productos (nombre, precio, categoria_id, es_extra, activo)
select x.nombre, x.precio, c.id, true, true
from categorias c
join (values
  ('Café: Americano Caliente', 0),
  ('Café: Americano Helado',   0),
  ('Galleta: Chispas de Chocolate', 10),
  ('Galleta: Macadamia',            10)
) as x(nombre, precio) on true
where c.nombre = 'Extras Bebidas'
  and not exists (select 1 from productos p where p.nombre = x.nombre);

insert into productos (nombre, precio, categoria_id, es_extra, es_combo, activo, descripcion)
select 'Paquete Americano', 99, c.id, false, false, true,
       'Americano caliente o helado. Agrega galleta por $10.'
from categorias c
where c.nombre = 'Combos'
  and not exists (select 1 from productos p where p.nombre = 'Paquete Americano');

insert into producto_extras (producto_id, extra_id, precio, grupo)
select paq.id, e.id, x.precio, x.grupo
from productos paq
join (values
  ('Café: Americano Caliente',      0::numeric, 'cafe'),
  ('Café: Americano Helado',        0::numeric, 'cafe'),
  ('Galleta: Chispas de Chocolate', 10::numeric, null),
  ('Galleta: Macadamia',            10::numeric, null)
) as x(nombre, precio, grupo) on true
join productos e on e.nombre = x.nombre and e.es_extra
where paq.nombre = 'Paquete Americano'
on conflict (producto_id, extra_id) do update
  set precio = excluded.precio, grupo = excluded.grupo;