-- ============================================================================
-- Las categorias del kiosko son las de una panaderia
-- ============================================================================
-- El motor llego con las categorias del negocio original: Shakes, Collagen
-- Drinks, Scoops de proteina, Suplementos... En el kiosko de Hojaldras Lily no
-- pinta ninguna. Se crean las del giro y se apagan las que sobran.
--
-- No se borra nada: `productos.categoria_id` apunta a ellas y borrarlas
-- tiraria el historial. Apagadas no salen en el kiosko ni en la caja.
--
-- Las hojaldras y los bocadillos van a la estacion de **alimentos** (se
-- preparan en cocina); el cafe y las bebidas, a la de bebidas.

insert into categorias (nombre, cocina_id, activa, orden)
select v.nombre, c.id, true, v.orden
from (values
  ('Hojaldras',  'alimentos', 1),
  ('Bocadillos', 'alimentos', 2),
  ('Panadería',  'alimentos', 3),
  ('Temporada',  'alimentos', 4)
) as v(nombre, estacion, orden)
join cocinas c on c.slug = v.estacion
on conflict (nombre) do update
  set activa = true, orden = excluded.orden, cocina_id = excluded.cocina_id;

-- Las del giro anterior se apagan. Se conservan las estructurales que el
-- sincronizador de Costeos necesita por nombre (Alimentos, Bebidas, Snacks),
-- las de extras y combos, y Cafe, que Lily si vende.
update categorias
   set activa = false
 where activa
   and nombre in (
     'Shakes', 'Collagen Drinks', 'Amino Refreshers', 'Hydration Drinks',
     'Tés', 'Kombuchas',
     'Scoops', 'Scoops - Proteínas', 'Scoops - Creatinas', 'Scoops - BCAAs',
     'Scoops - Colágeno', 'Scoops - Pre-entrenos', 'Scoops - Birdman',
     'Suplementos', 'Suplementos - Proteínas', 'Suplementos - Creatinas',
     'Suplementos - BCAAs', 'Suplementos - Colágeno',
     'Suplementos - Pre-entrenos', 'Suplementos Birdman'
   );

-- El cafe se sirve en la barra y se acomoda despues de lo horneado.
update categorias set orden = 5 where nombre = 'Café';
