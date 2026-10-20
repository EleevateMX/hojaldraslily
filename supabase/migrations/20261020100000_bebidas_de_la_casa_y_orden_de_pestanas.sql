-- Las bebidas que de verdad vende la casa, y las pestañas de la caja en el
-- orden que pidió gerencia (20/10/26).
--
-- Todo es DATO, no estructura. Las bebidas SÍ viven en `app_data` (Costeos
-- las conoce: son los renglones de reventa), así que hay que cambiarlas en
-- los dos lados a la vez: en el JSON de Costeos, para que el siguiente
-- guardado no reviva la lista vieja, y en `productos`, porque desde aquí no
-- se puede disparar `fn_sync_app_data` (crea y tira tablas temporales, y eso
-- cuelga el MCP; CLAUDE.md §4). Los nombres y las claves coinciden letra por
-- letra en los dos lados: es el ancla con la que el sincronizador los empata.

-- ---------------------------------------------------------------------------
-- 1. La lista de Kenny, en Costeos
-- ---------------------------------------------------------------------------
-- Se queda el café (apagado por categoría desde octubre; sus cuatro renglones
-- siguen en el JSON para que no se den de baja). Salen Agua de horchata y
-- Refresco; entran las Coca Colas en sus cuatro formas, el Boxito, el
-- Soldado de chocolate y el jugo. «Agua embotellada» pasa a llamarse «Agua»,
-- que es como está en la lista, con su Clave para que el renombre no la
-- parta en dos.
--
-- Sin costo: la hoja no lo traía y un costo inventado es peor que ninguno.
-- Se captura en Costeos → Bebidas cuando se tenga.
alter table public.app_data disable trigger app_data_sync;
update public.app_data
   set data = jsonb_set(data, '{bebidas}', '[
     {"nombre": "Cafe de olla",       "precio": 35, "costo": 6,  "categoria": "Café"},
     {"nombre": "Americano",          "precio": 40, "costo": 7,  "categoria": "Café"},
     {"nombre": "Cafe con leche",     "precio": 45, "costo": 9,  "categoria": "Café"},
     {"nombre": "Chocolate caliente", "precio": 45, "costo": 10, "categoria": "Café"},
     {"nombre": "Coca Cola · Lata",                "codigo": "BE-CL",  "precio": 25, "categoria": "Bebidas"},
     {"nombre": "Coca Cola · Lata Sin Azúcar",     "codigo": "BE-CLS", "precio": 25, "categoria": "Bebidas"},
     {"nombre": "Coca Cola · Botella",             "codigo": "BE-CB",  "precio": 30, "categoria": "Bebidas"},
     {"nombre": "Coca Cola · Botella Sin Azúcar",  "codigo": "BE-CBS", "precio": 30, "categoria": "Bebidas"},
     {"nombre": "Agua",                            "codigo": "BE-AG",  "precio": 20, "categoria": "Bebidas"},
     {"nombre": "Boxito",                          "codigo": "BE-BX",  "precio": 30, "categoria": "Bebidas"},
     {"nombre": "Soldado Chocolate",               "codigo": "BE-SC",  "precio": 31, "categoria": "Bebidas"},
     {"nombre": "Jugo",                            "codigo": "BE-JU",  "precio": 20, "categoria": "Bebidas"}
   ]'::jsonb)
 where data ? 'bebidas';
alter table public.app_data enable trigger app_data_sync;

-- ---------------------------------------------------------------------------
-- 2. Lo mismo en `productos`
-- ---------------------------------------------------------------------------
-- El agua ya existía: se renombra (la ilustración se queda). Las dos que
-- salen se apagan, no se borran: el sincronizador hará lo mismo en el
-- siguiente guardado, porque ya no están en el costeo.
update public.productos
   set nombre = 'Agua', codigo = 'BE-AG', precio = 20, orden = 5
 where nombre = 'Agua embotellada' and not es_extra;

update public.productos set activo = false
 where nombre in ('Agua de horchata', 'Refresco') and not es_extra;

-- Las nuevas. `orden` sigue la lista de Kenny; el sincronizador pondrá el
-- mismo número (es la posición en el JSON de arriba, contando los cuatro
-- cafés primero, y por eso las Coca Colas empiezan en 5 allá; aquí da igual
-- porque las categorías se ordenan aparte y dentro de Bebidas el orden
-- relativo es el mismo).
insert into public.productos
  (nombre, codigo, precio, iva_incluido, es_reventa, activo, categoria_id, orden, imagen_url)
select v.nombre, v.codigo, v.precio, true, true, true,
       (select id from public.categorias where nombre = 'Bebidas'), v.orden, v.imagen
  from (values
    ('Coca Cola · Lata',               'BE-CL',  25, 1, 'coca-cola-lata.png'),
    ('Coca Cola · Lata Sin Azúcar',    'BE-CLS', 25, 2, 'coca-cola-lata.png'),
    ('Coca Cola · Botella',            'BE-CB',  30, 3, 'coca-cola-botella.png'),
    ('Coca Cola · Botella Sin Azúcar', 'BE-CBS', 30, 4, 'coca-cola-botella.png'),
    ('Boxito',                         'BE-BX',  30, 6, 'boxito.png'),
    ('Soldado Chocolate',              'BE-SC',  31, 7, 'soldado-chocolate.png'),
    ('Jugo',                           'BE-JU',  20, 8, 'jugo.png')
  ) as v(nombre, codigo, precio, orden, imagen)
 where not exists (
   select 1 from public.productos p where lower(p.nombre) = lower(v.nombre) and not p.es_extra
 );

-- ---------------------------------------------------------------------------
-- 3. Las pestañas de la caja, en el orden de gerencia
-- ---------------------------------------------------------------------------
-- «Todos» no es una categoría (lo pinta la caja). Lo demás, tal cual lo pidió:
-- Menú del día, Bocadillos, Panes, Galletas, Anís, Menú de temporada,
-- Bebidas, Por encargo. Lo que no está en la lista (Extras, Café apagado,
-- los extras de bebidas) se queda después.
update public.categorias
   set orden = case nombre
     when 'Menú del día'      then 1
     when 'Bocadillos'        then 2
     when 'Panes'             then 3
     when 'Galletas'          then 4
     when 'Anís'              then 5
     when 'Menú de Temporada' then 6
     when 'Bebidas'           then 7
     when 'Por encargo'       then 8
   end
 where nombre in ('Menú del día', 'Bocadillos', 'Panes', 'Galletas', 'Anís',
                  'Menú de Temporada', 'Bebidas', 'Por encargo');
