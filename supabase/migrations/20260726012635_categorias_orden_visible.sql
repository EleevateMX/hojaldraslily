-- Orden explícito de las pestañas de categoría en POS/Kiosko. Antes no
-- existía ningún control de orden — las pestañas aparecían en el orden
-- en que se topaba el primer producto de cada categoría (alfabético por
-- NOMBRE DE PRODUCTO, no por categoría), así que el orden era arbitrario
-- e inconsistente. Aditivo: agrega la columna, no borra nada.
alter table public.categorias add column if not exists orden integer not null default 100;

update public.categorias set orden = 1 where nombre = 'Shakes';
update public.categorias set orden = 2 where nombre = 'Alimentos';
update public.categorias set orden = 3 where nombre = 'Bebidas';
update public.categorias set orden = 4 where nombre = 'Snacks';