-- ============================================================================
-- Bases por tipo de bebida (pedido de la sucursal, 13/08/26)
-- ============================================================================
--  · Shakes numerados (#1-#16) y El Clásico: se AGREGA agua como base opcional.
--    La default sigue siendo Leche Entera.
--  · Hydration Drinks y Amino Refreshers: default agua, cambiable a agua
--    mineral +$10. NO llevan leches (ayer las heredaron del bloque general).
--  · Aguas frescas (Blueberry Açaí, jamaicas, limonadas, jengibres, Violetas
--    Açaí, Lemon Glow): igual — agua default, mineral +$10, sin leches.
--  · Cafés (americanos, lattes, cold brew): leches habilitadas. Los lattes
--    default Entera (un latte ES leche); americanos y cold brew default
--    "Sin leche" — si la default fuera Entera, cada americano saldría a
--    barra con "+ENTERA" y le pondrían leche a un café solo.
-- ============================================================================

-- 1. Extras nuevos: Agua mineral (+$10) y Sin leche ($0). Sin vínculos aún.
insert into productos (nombre, precio, categoria_id, es_extra, es_reventa, activo, iva_incluido)
select v.nombre, v.precio,
       (select id from categorias where nombre = 'Extras Bebidas'),
       true, false, true, true
from (values ('Agua mineral', 10::numeric), ('Sin leche', 0::numeric)) v(nombre, precio)
where not exists (
  select 1 from productos p where lower(p.nombre) = lower(v.nombre) and p.es_extra
);

-- 2. Conjuntos de productos, por nombre EXACTO de lo que hoy está activo.
--    Vistas temporales para no repetir listas (y equivocarse en una).
create temp table _grupo (grupo text, producto_id uuid) on commit drop;

-- Shakes numerados: #N al inicio del nombre.
insert into _grupo
select 'shake_numerado', p.id from productos p
join categorias c on c.id = p.categoria_id
where c.nombre = 'Shakes' and p.activo and not p.es_extra and p.nombre ~ '^#[0-9]+ ';

insert into _grupo
select 'clasico', id from productos where lower(nombre) in ('el clásico','el clasico') and activo;

insert into _grupo
select 'cafe_con_leche_default', id from productos
where activo and nombre in ('Latte Caliente', 'Latte Helado');

insert into _grupo
select 'cafe_sin_leche_default', id from productos
where activo and nombre in ('Americano Caliente', 'Americano Helado', 'Cold Brew');

insert into _grupo
select 'agua_mineral', id from productos
where activo and not es_extra and nombre in (
  'Hydration Drink - Durazno', 'Hydration Drink - Lemon Twist',
  'Hydration Drink - Pink Lemonade', 'Hydration Drink - Watermelon Splash',
  'Amino Refresher - Mango Madness', 'Amino Refresher - Lemon Lime',
  'Amino Refresher - Watermelon Wave', 'Amino Refresher - Blueberry Rush',
  'Amino Refresher - Strawberry Bliss', 'Tropical Glow',
  'Blueberry Açaí', 'Guayaba Jamaica', 'Jamaica Arándanos', 'Arándanos Jamaica',
  'Limonada Durazno', 'Limonada Jengibre', 'Mango Jengibre', 'Violetas Açaí',
  'Lemon Glow'
);

-- 3. Quitar las leches de donde no van: las bebidas de agua las heredaron
--    del bloque "todos los shakes" de ayer y ahí estorban.
delete from producto_extras pe
using productos e
where e.id = pe.extra_id
  and e.nombre ilike 'leche%'
  and pe.producto_id in (select producto_id from _grupo where grupo = 'agua_mineral');

-- 4. Vincular lo que sí va.
-- Agua ($0) a los numerados (El Clásico ya la tiene) y a las bebidas de agua.
insert into producto_extras (producto_id, extra_id)
select g.producto_id, (select id from productos where nombre='Agua' and es_extra limit 1)
from _grupo g where g.grupo in ('shake_numerado', 'agua_mineral')
on conflict do nothing;

-- Agua mineral (+$10) solo a las bebidas de agua.
insert into producto_extras (producto_id, extra_id)
select g.producto_id, (select id from productos where nombre='Agua mineral' and es_extra limit 1)
from _grupo g where g.grupo = 'agua_mineral'
on conflict do nothing;

-- Las 6 leches a los cafés (los lattes ya las tenían por el bloque general;
-- el on conflict lo hace idempotente).
insert into producto_extras (producto_id, extra_id)
select g.producto_id, e.id
from _grupo g
cross join (select id from productos where es_extra and nombre ilike 'leche%' and activo) e
where g.grupo in ('cafe_con_leche_default', 'cafe_sin_leche_default')
on conflict do nothing;

-- "Sin leche" solo a americanos y cold brew: su presencia es lo que hace que
-- el kiosko la preseleccione (regla del modal), y un latte no la ofrece
-- porque un latte sin leche no es un latte.
insert into producto_extras (producto_id, extra_id)
select g.producto_id, (select id from productos where nombre='Sin leche' and es_extra limit 1)
from _grupo g where g.grupo = 'cafe_sin_leche_default'
on conflict do nothing;