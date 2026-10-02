-- Los cambios al catalogo que pidio la casa en octubre.
--
-- Todo lo de aqui es DATO, no estructura: productos que faltaban, dos precios
-- mal, un nombre mal y dos secciones que cambian de lugar. Va en migracion y
-- no en Costeos porque el menu de Lily (panes, galletas, anis, bocadillos)
-- vive en `productos` desde la siembra: no esta en `app_data`, asi que
-- `fn_sync_app_data` no lo pisa. Se comprobo renglon por renglon antes de
-- escribir esto.

-- ---------------------------------------------------------------------------
-- 1. La temporada se llama como la llama la casa
-- ---------------------------------------------------------------------------
-- La seccion ya existia con el nombre corto "Temporada", y con el Pan de
-- Muerto sembrado en sus dos tamanos y sus cuatro sabores -- en cero y
-- apagado, tal como venia en la hoja. Lo que faltaba era el nombre con el que
-- ella la busca.
--
-- Y queda APAGADA a proposito: los precios del Pan de Muerto llegan la semana
-- que entra. Una seccion abierta con productos en $0 es una seccion que puede
-- cobrar cero. Se prende desde Admin -> Menus del dia el dia que se capturen.
update public.categorias set nombre = 'Menú de Temporada', activa = false
 where nombre = 'Temporada';

-- El JSON de Costeos tambien apuntaba al nombre viejo. Si no se corrige, el
-- siguiente guardado busca una categoria llamada "Temporada", no la encuentra
-- y deja esos renglones sin categoria.
--
-- Se desactiva el trigger mientras se corrige: lo que cambia es el NOMBRE de
-- una categoria, no el catalogo, y no hay por que hacer correr la
-- sincronizacion entera por un cambio de etiqueta.
alter table public.app_data disable trigger app_data_sync;
update public.app_data
   set data = jsonb_set(data, '{foodRecipes}', (
         select jsonb_agg(
                  case when x->>'categoria' = 'Temporada'
                       then jsonb_set(x, '{categoria}', '"Menú de Temporada"')
                       else x end)
           from jsonb_array_elements(data->'foodRecipes') x))
 where data ? 'foodRecipes'
   and jsonb_path_exists(data, '$.foodRecipes[*] ? (@.categoria == "Temporada")');
alter table public.app_data enable trigger app_data_sync;

-- ---------------------------------------------------------------------------
-- 2. El cafe se apaga, no se borra
-- ---------------------------------------------------------------------------
-- Se apaga la CATEGORIA, no los productos. Dos razones:
--
--   · Los cuatro cafes SI viven en `app_data` (Costeos los conoce), y ahi el
--     sincronizador pone `activo = (precio > 0)`. Apagarlos uno por uno los
--     resucita en el siguiente guardado. La categoria, en cambio, no la toca.
--   · Es el mismo interruptor de Admin -> Menus del dia, asi que ella lo
--     vuelve a prender sin ayuda de nadie.
update public.categorias set activa = false where nombre = 'Café';

-- ---------------------------------------------------------------------------
-- 3. Las bebidas, al final
-- ---------------------------------------------------------------------------
-- Casi no se venden; estaban en el orden 11, o sea antes de bocadillos, panes,
-- galletas y anis. Pasan despues de todas (los extras siguen en 100).
update public.categorias set orden = 40 where nombre = 'Bebidas';

-- ---------------------------------------------------------------------------
-- 4. Son de manteca, no de mantequilla
-- ---------------------------------------------------------------------------
-- Se les pone Clave al renombrarlas. Hoy no hacen falta -- estas galletas no
-- vienen de Costeos -- pero un renombre sin Clave es justo lo que parte un
-- producto en dos el dia que si venga de ahi.
update public.productos
   set nombre = 'Galletas de Manteca Dulces', codigo = coalesce(codigo, 'GA-MD')
 where nombre = 'Galletas de Mantequilla Dulces';
update public.productos
   set nombre = 'Galletas de Manteca Saladas', codigo = coalesce(codigo, 'GA-MS')
 where nombre = 'Galletas de Mantequilla Saladas';

-- ---------------------------------------------------------------------------
-- 5. La Rosca de Anis cuesta $85
-- ---------------------------------------------------------------------------
-- Estaba en $35, el precio de las otras dos piezas de anis. No va en Rappi
-- (su fila de `precios_canal` ya dice `disponible = false`), asi que el
-- cambio no toca la plataforma.
update public.productos set precio = 85 where nombre = 'Rosca de Anís';

-- ---------------------------------------------------------------------------
-- 6. Lo que solo se vende por encargo
-- ---------------------------------------------------------------------------
-- `sabor` y `cuadros` van en NULL en todos: no son hojaldras cortadas de un
-- molde, son piezas que se hornean para el pedido. Si llevaran cuadros,
-- venderlas descontaria pan del inventario de cuadros que nadie horneo.
--
-- La Hojaldra de Corazon es un solo tamano con cinco rellenos: cada relleno es
-- su propio renglon porque cada uno tiene su precio.
with cat as (select id from public.categorias where nombre = 'Por encargo')
insert into public.productos
  (nombre, codigo, categoria_id, precio, iva_incluido, activo, orden, sabor, cuadros)
select v.nombre, v.codigo, cat.id, v.precio, true, true, v.orden, null, null
from cat, (values
  ('Trenza Suiza · Grande',                                      'PE-TS-GR',  280, 40),
  ('Rosca de Queso de Bola · Grande',                            'PE-RQB-GR', 570, 41),
  ('Rosca de Queso Crema · Grande',                              'PE-RQC-GR', 570, 42),
  ('Pastelitos solo queso · 1 pza',                              'PE-PQ-01',   26, 43),
  ('Hojaldra de Corazón · Jamón y Queso',                        'PE-HC-JQ',  310, 44),
  ('Hojaldra de Corazón · Hawaiana',                             'PE-HC-HW',  330, 45),
  ('Hojaldra de Corazón · Daysi, Jamón y Jalapeño',              'PE-HC-DY',  440, 46),
  ('Hojaldra de Corazón · Pasta de Guayaba, Philadelphia y Nuez','PE-HC-PGN', 440, 47),
  ('Hojaldra de Corazón · Nutella',                              'PE-HC-NU',  440, 48)
) as v(nombre, codigo, precio, orden)
on conflict (lower(nombre)) where (activo and not es_extra) do nothing;

-- La Hojaldra Corazon estaba sembrada en Temporada, en cero y apagada, de
-- cuando era una idea sin precio. Ya tiene precios y se vende todo el ano por
-- encargo, asi que esa se queda muerta: dos renglones con el mismo pan es un
-- inventario que no cuadra.
update public.productos set activo = false
 where codigo = 'TE-CORAZON';

-- ---------------------------------------------------------------------------
-- 7. Y ninguno de los nuevos va en Rappi
-- ---------------------------------------------------------------------------
-- Los catorce de Por encargo que ya existian estan marcados `disponible =
-- false`. Sin fila, un producto se vende al precio de MOSTRADOR en todos los
-- canales: los nuevos habrian aparecido en la plataforma sin comision, o sea
-- perdiendo dinero en cada venta y sin que nada lo avisara.
insert into public.precios_canal (producto_id, canal, precio, disponible)
select p.id, 'rappi'::canal_orden, 0, false
from public.productos p
where p.codigo in ('PE-TS-GR','PE-RQB-GR','PE-RQC-GR','PE-PQ-01',
                   'PE-HC-JQ','PE-HC-HW','PE-HC-DY','PE-HC-PGN','PE-HC-NU')
on conflict (producto_id, canal) do update
  set disponible = false, precio = 0;
