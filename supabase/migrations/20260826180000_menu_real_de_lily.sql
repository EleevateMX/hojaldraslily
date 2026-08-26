-- ============================================================================
-- El catalogo es el menu de verdad de Hojaldras Lily
-- ============================================================================
-- Tomado de hojaldraslily.com y de sus menus impresos (menu del dia, por
-- encargo y de temporada). Sustituye a la siembra de ejemplo.
--
-- Decision que importa: **un sabor+tamano existe UNA sola vez**. En sus menus,
-- "Jamon y Queso Chica" cuesta $310 se compre en vitrina o se encargue; son el
-- mismo producto. Duplicarlo rompia el catalogo (el sincronizador colapsa por
-- nombre a proposito, ver `un_solo_producto_por_nombre`) y ademas confunde a
-- quien cobra. Asi que:
--   · "Menu del dia"  = los cinco sabores de vitrina, en sus cuatro tamanos.
--   · "Por encargo"   = SOLO los sabores que no estan en vitrina. Esa es la
--                       diferencia real entre las dos cartas.
--   · "Temporada"     = Rosca de Reyes, Hojaldra Corazon y Pan de Muerto,
--                       SIN precio a proposito: nacen apagados y ella los
--                       enciende desde Costeos cuando llega la temporada.
--
-- Las recetas van vacias: los precios de venta son los suyos, pero el costeo
-- (insumos y cantidades) lo captura ella. Sin receta el producto se vende
-- igual; lo que falta es el food cost.
--
-- Este archivo es el registro de lo aplicado; el catalogo vive en `app_data`
-- y de ahi lo sincroniza `fn_sync_app_data()`. Para cambiarlo se edita en
-- Costeos, no aqui.

-- Las tres cartas
insert into categorias (nombre, cocina_id, activa, orden)
select v.nombre, c.id, true, v.orden
from (values ('Menú del día','alimentos',1), ('Por encargo','alimentos',2), ('Temporada','alimentos',3))
  as v(nombre, estacion, orden)
join cocinas c on c.slug = v.estacion
on conflict (nombre) do update
  set activa = true, orden = excluded.orden, cocina_id = excluded.cocina_id;

-- Se apagan las categorias del giro anterior y las de la siembra de ejemplo
update categorias set activa = false
 where nombre in ('Hojaldras','Bocadillos','Panadería','Combos','Recargas','Snacks','Alimentos');

-- Y los productos que no son suyos
update productos set activo = false
 where activo and (
   nombre in ('Empanada de temporada','Paquete Americano','Pan dulce de temporada',
              'Galletas de mantequilla (3 pzas)','Rosca individual',
              'Galleta: Chispas de Chocolate','Galleta: Macadamia','Agua mineral')
   or nombre like 'Recarga %'
 );

-- El menu (18 del dia + 14 por encargo + 3 de temporada sin precio) se cargo
-- en `app_data.data` con las claves MD-*, PE-* y TE-*, y el trigger de
-- sincronizacion creo los productos. Precios verificados contra sus menus:
--   Jamon y Queso  160 / 310 / 540      Hawaiana        170 / 330 / 555
--   Fiesta         115 / 225 / 440 / 660   Pasta de Guayaba  igual
--   Daysi, Jamon y Jalapeno  igual
--   Por encargo: Coctel, Nutella, Manchego y Philadelphia 440 / 660;
--                Queso de Bola, Lomo y Guayaba c/Queso de Bola 510 / 790.
