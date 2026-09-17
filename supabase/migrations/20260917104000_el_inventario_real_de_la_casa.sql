-- El inventario real de la casa: 99 insumos, con su presentación.
--
-- Lo que había eran 25 insumos heredados del motor original -- "Datil sin
-- hueso", "Queso havarti", vasos de café -- y CERO renglones de existencia:
-- Admin → Inventario era una tabla vacía. No se podía contar nada porque no
-- había qué contar.
--
-- La hoja de inventario del negocio trae 99 renglones en seis grupos, y cada
-- uno con la presentación en la que se compra y se cuenta: saco de 25 kg,
-- cubeta de 18, cartón de 30 huevos, kilo de bolsa. Eso es lo que se siembra.
--
-- Dos decisiones que conviene dejar escritas:
--
--   * Se cuenta en la PRESENTACIÓN, no en gramos. `unidad` es "saco",
--     "cubeta", "cartón", y `contenido` dice cuánto trae cada uno. Quien
--     cuenta el almacén cuenta sacos, no kilos de harina, y un sistema que
--     le pide gramos es un sistema que nadie va a llenar. Para costear,
--     `contenido` alcanza para bajar a la unidad chica cuando haga falta.
--
--   * Los nombres van TAL COMO están en la hoja, incluso donde vienen
--     abreviados ("Manteca C", "Puré T"). Son los nombres con los que el
--     negocio los pide y los reconoce; "corregirlos" aquí obligaría a
--     traducir mentalmente cada vez que se cuenta.
--
-- Las etiquetas llevan el prefijo "Etiqueta " porque si no chocarían con la
-- materia prima: "Nutella" y "Anís" son a la vez un insumo y una etiqueta.

-- ------------------------------------------------------------------------
-- Los seis grupos de la hoja.
-- ------------------------------------------------------------------------
insert into public.insumo_categorias (nombre, activa)
select v.nombre, true
from (values ('Materia prima'), ('Limpieza'), ('Bolsas'),
             ('Etiquetas'), ('Cajas'), ('Domos y empaques')) as v(nombre)
where not exists (select 1 from public.insumo_categorias c where c.nombre = v.nombre);

-- Las del motor original que aquí no significan nada. No se borran (podrían
-- estar referenciadas); se apagan.
update public.insumo_categorias set activa = false
 where nombre in ('Ingredientes Shake', 'Proteínas', 'Snacks', 'Ingredientes Alimentos');

-- ------------------------------------------------------------------------
-- Primero el renombre, después el alta.
--
-- Nueve insumos del sembrado son los mismos de la hoja con otro nombre. Si se
-- insertaran los de la hoja sin renombrar estos, quedarían DUPLICADOS: dos
-- harinas, dos nueces, dos piñas -- y las recetas seguirían colgadas del
-- ejemplar viejo mientras el conteo se haría sobre el nuevo. Renombrar
-- primero conserva las recetas y deja un solo renglón por cosa.
-- ------------------------------------------------------------------------
do $renombre$
declare r record;
begin
  for r in
    select * from (values
      ('Harina de trigo',   'Harina Trigo'),
      ('Azucar',            'Azúcar Blanca'),
      ('Nuez picada',       'Nuez'),
      ('Pina en almibar',   'Piña'),
      ('Pasta de guayaba',  'Pasta de Guayaba'),
      ('Queso de bola',     'Queso Bola'),
      ('Jamon de pierna',   'Jamón')
    ) as t(viejo, nuevo)
  loop
    -- Solo si el nuevo todavía no existe: si alguien ya corrió esto, no hay
    -- nada que hacer y tampoco hay que fabricar un duplicado.
    -- Cuando solo cambian las mayusculas ('Pasta de guayaba' -> 'Pasta de
    -- Guayaba') el viejo Y el nuevo son la misma fila: renombrar directo, sin
    -- el candado de duplicado, que si no la dejaria con la grafia vieja.
    if lower(r.viejo) = lower(r.nuevo) then
      update public.insumos set nombre = r.nuevo
       where lower(nombre) = lower(r.viejo) and nombre <> r.nuevo;
    elsif exists (select 1 from public.insumos where lower(nombre) = lower(r.viejo))
      and not exists (select 1 from public.insumos where lower(nombre) = lower(r.nuevo)) then
      update public.insumos set nombre = r.nuevo where lower(nombre) = lower(r.viejo);
    end if;
  end loop;
end
$renombre$;

-- ------------------------------------------------------------------------
-- El alta.
-- ------------------------------------------------------------------------
do $insumos$
declare
  r     record;
  v_cat uuid;
  v_id  uuid;
begin
  for r in
    select * from (values
      ('Materia prima', 'Harina Trigo', 'alimento', 'saco', 25, 'Saco 25 kg'),
      ('Materia prima', 'Harina Extra', 'alimento', 'saco', 23, 'Saco 23 kg'),
      ('Materia prima', 'Azúcar Blanca', 'alimento', 'saco', 25, 'Saco 25 kg'),
      ('Materia prima', 'Azúcar Estándar', 'alimento', 'saco', 25, 'Saco 25 kg'),
      ('Materia prima', 'Manteca C', 'alimento', 'cubeta', 18, 'Cubeta 18 kg'),
      ('Materia prima', 'Manteca V', 'alimento', 'caja', 23, 'Caja 23 kg'),
      ('Materia prima', 'Sal', 'alimento', 'bolsa', 1, 'Bolsa 1 kg'),
      ('Materia prima', 'Levadura', 'alimento', 'pieza', 0.4, 'Pieza 400 gr'),
      ('Materia prima', 'Huevo', 'alimento', 'cartón', 30, 'Cartón 30 pzas'),
      ('Materia prima', 'Colorante Amarillo', 'alimento', 'bote', 1, 'Bote 1 litro'),
      ('Materia prima', 'Vainilla', 'alimento', 'galón', 3.785, 'Galón'),
      ('Materia prima', 'Canela', 'alimento', 'kg', 1, 'Kilo'),
      ('Materia prima', 'Anís', 'alimento', 'kg', 1, 'Kilo'),
      ('Materia prima', 'Polvo para Hornear', 'alimento', 'bolsa', 4.5, 'Bolsa 4.5 kg'),
      ('Materia prima', 'Mejorante', 'alimento', 'paquete', 0.44, 'Paquete 440 gr'),
      ('Materia prima', 'Queso Bola', 'alimento', 'kg', 1, 'Kilo (bola)'),
      ('Materia prima', 'Queso Manchego', 'alimento', 'kg', 1, 'Kilo (barra)'),
      ('Materia prima', 'Queso Manchego Blanco', 'alimento', 'kg', 1, 'Kilo (barra)'),
      ('Materia prima', 'Queso Daisy', 'alimento', 'kg', 1, 'Kilo (barra)'),
      ('Materia prima', 'Queso Crema', 'alimento', 'caja', 8, 'Caja 8 kg'),
      ('Materia prima', 'Jamón', 'alimento', 'kg', 1, 'Kilo (paquetes)'),
      ('Materia prima', 'Mantequilla', 'alimento', 'barra', 1, 'Barra 1 kg'),
      ('Materia prima', 'Margarina', 'alimento', 'barra', 1, 'Barra 1 kg'),
      ('Materia prima', 'Nuez', 'alimento', 'kg', 1, 'Kilo'),
      ('Materia prima', 'Piña', 'alimento', 'lata', 0.45, 'Lata 450 gr'),
      ('Materia prima', 'Chile Jalapeño', 'alimento', 'lata', 0.44, 'Lata 440 gr'),
      ('Materia prima', 'Chícharo', 'alimento', 'lata', 0.189, 'Lata 189 gr'),
      ('Materia prima', 'Elote', 'alimento', 'lata', 0.195, 'Lata 195 gr'),
      ('Materia prima', 'Puré T', 'alimento', 'pieza', 1, 'Pieza 1 litro'),
      ('Materia prima', 'Media Crema', 'alimento', 'pieza', 0.25, 'Pieza 250 ml'),
      ('Materia prima', 'Nutella', 'alimento', 'pieza', 1, 'Pieza 1 kg'),
      ('Materia prima', 'Pasitas', 'alimento', 'kg', 1, 'Kilo'),
      ('Materia prima', 'Pasta de Guayaba', 'alimento', 'pieza', 0.34, 'Pieza 340 gr'),
      ('Materia prima', 'Cóctel de Frutas', 'alimento', 'lata', 0.48, 'Lata 480 gr'),
      ('Materia prima', 'Leche Entera', 'alimento', 'pieza', 1, 'Pieza 1 litro'),
      ('Materia prima', 'Pimiento Morrón', 'alimento', 'lata', 0.11, 'Lata 110 gr'),
      ('Materia prima', 'Ate en Tiras Tricolor', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Granillo Multicolor', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Granillo Rojo', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Granillo Verde', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Granillo Chocolate', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Cereza Verde', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Cereza Roja', 'alimento', 'pieza', 1, null),
      ('Materia prima', 'Muñecos', 'alimento', 'pieza', 1, null),
      ('Limpieza', 'Cloro', 'limpieza', 'pieza', 10, 'Pieza 10 litros'),
      ('Limpieza', 'Vinagre', 'limpieza', 'pieza', 3.7, '3.7 litros'),
      ('Limpieza', 'Detergente', 'limpieza', 'bulto', 0.72, 'Bulto 720 gr'),
      ('Limpieza', 'Jabón Líquido', 'limpieza', 'litro', 1, 'Litro'),
      ('Limpieza', 'Papel Rollo para Manos', 'limpieza', 'pieza', 1, 'Pieza'),
      ('Limpieza', 'Papel Rollo Sanitario', 'limpieza', 'pieza', 1, 'Pieza'),
      ('Limpieza', 'Cofia', 'limpieza', 'pieza', 1, 'Piezas'),
      ('Limpieza', 'Red', 'limpieza', 'pieza', 1, 'Piezas'),
      ('Limpieza', 'Cubrebocas', 'limpieza', 'paquete', 50, 'Paquete 50 pzas'),
      ('Limpieza', 'Mandiles', 'limpieza', 'pieza', 1, 'Pieza'),
      ('Limpieza', 'Alcohol', 'limpieza', 'litro', 1, 'Litros'),
      ('Limpieza', 'Fibra Verde', 'limpieza', 'pieza', 1, 'Pieza'),
      ('Limpieza', 'Fibra de Algodón', 'limpieza', 'pieza', 1, 'Pieza'),
      ('Limpieza', 'Spray para Horno', 'limpieza', 'bote', 0.4, 'Bote 400 g'),
      ('Limpieza', 'Paños', 'limpieza', 'pieza', 1, 'Pieza'),
      ('Bolsas', 'Bolsa Natural 15 × 25', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Natural 20 × 30', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Natural 25 × 35', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Natural 35 × 50', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Natural 40 × 60', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Camiseta #0', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Camiseta Roja #1', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Camiseta Azul #2', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Camiseta Amarilla #3', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Camiseta Negra #3', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Bolsa Rollo Baja Densidad 50 × 70', 'empaque', 'kg', 1, 'Kilo'),
      ('Bolsas', 'Rollo de Bolsa para Basura 90 × 1.20', 'empaque', 'kg', 1, 'Kilo'),
      ('Etiquetas', 'Etiqueta Fiesta', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta P. Guayaba, Philadelphia y Nuez', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Daisy, Jamón y Jalapeño', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Hawaiana', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Lomo', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Jamón y Queso', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Queso Philadelphia', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Queso de Bola', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Tradicional', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Nutella', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Anís', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Nutella y Queso de Bola', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Cóctel', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta Philadelphia y Nuez', 'empaque', 'pieza', 1, null),
      ('Etiquetas', 'Etiqueta P. Guayaba y Queso de Bola', 'empaque', 'pieza', 1, null),
      ('Cajas', 'Caja 6 pzas. 17 × 13 × 4', 'empaque', 'pieza', 1, 'Pieza'),
      ('Cajas', 'Caja 12 pzas. 26 × 18 × 24', 'empaque', 'pieza', 1, 'Pieza'),
      ('Cajas', 'Caja 24 pzas. con ventana 35 × 25 × 4', 'empaque', 'pieza', 1, 'Pieza'),
      ('Cajas', 'Caja 24 pzas. sin ventana 35 × 25 × 4', 'empaque', 'pieza', 1, 'Pieza'),
      ('Cajas', 'Caja 48 pzas. con ventana 45 × 33 × 4', 'empaque', 'pieza', 1, 'Pieza'),
      ('Cajas', 'Caja 48 pzas. sin ventana 45 × 33 × 4', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', 'P 23 PET Rosca todo el año', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', '1514-44-PET Almeja Domo bolitas y pastelitos', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', '77-DB08ANGC Domo para Pastel Alto 8 c/Base Negra', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', 'NRR100CAJA Empaque Rosca Reyes Mediano Base Negra', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', 'P-20 AN Pan de Muerto', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', 'P3011 Domo media barra sandwichón', 'empaque', 'pieza', 1, 'Pieza'),
      ('Domos y empaques', 'Domo trenza grande', 'empaque', 'pieza', 1, 'Pieza')
    ) as t(categoria, nombre, tipo, unidad, contenido, presentacion)
  loop
    select id into v_cat from public.insumo_categorias where nombre = r.categoria limit 1;

    select id into v_id from public.insumos
     where lower(trim(nombre)) = lower(trim(r.nombre)) limit 1;

    if v_id is null then
      insert into public.insumos
        (nombre, tipo, unidad, contenido, costo_compra, presentacion, categoria_id, activo)
      values
        (r.nombre, r.tipo::public.tipo_insumo, r.unidad, r.contenido, 0,
         r.presentacion, v_cat, true)
      returning id into v_id;
    else
      -- Ya existía (del sembrado o de un renombre de arriba): se le pone la
      -- presentación y el grupo, y se deja en paz el costo, que es dato del
      -- negocio y no mío.
      update public.insumos
         set presentacion = coalesce(r.presentacion, presentacion),
             unidad       = r.unidad,
             contenido    = case when contenido > 0 then contenido else r.contenido end,
             categoria_id = coalesce(categoria_id, v_cat),
             activo       = true
       where id = v_id;
    end if;
  end loop;
end
$insumos$;

-- ------------------------------------------------------------------------
-- Lo que quedó del motor original y aquí sí se usa.
-- ------------------------------------------------------------------------
update public.insumos set categoria_id = (select id from public.insumo_categorias where nombre = 'Bebidas')
 where categoria_id is null
   and nombre in ('Agua de horchata', 'Agua embotellada', 'Americano', 'Cafe con leche',
                  'Cafe de olla', 'Chocolate caliente', 'Refresco');

update public.insumos set categoria_id = (select id from public.insumo_categorias where nombre = 'Empaque')
 where categoria_id is null
   and nombre in ('Bolsa kraft', 'Caja de viaje grande', 'Vaso cafe 12 oz');

update public.insumos set categoria_id = (select id from public.insumo_categorias where nombre = 'Materia prima')
 where categoria_id is null
   and nombre in ('Datil sin hueso', 'Queso havarti', 'Lomo de cerdo', 'Nutella', 'Mantequilla');

-- Producto terminado que el motor original guardaba como insumo y que aquí ya
-- tiene su propio producto en el catálogo. Dejarlos activos llenaría la
-- pantalla de conteo de renglones que nadie va a contar.
update public.insumos set activo = false
 where nombre in ('Galletas de mantequilla (3 pzas)', 'Pan dulce de temporada', 'Rosca individual');

-- ------------------------------------------------------------------------
-- El renglón de existencia, para que haya qué contar.
--
-- Sin una fila en `inventario_stock` el insumo no aparece en ninguna pantalla
-- de inventario: existe en el catálogo y es invisible en el almacén. Se crean
-- en cero, que es la verdad -- todavía nadie ha contado nada.
-- ------------------------------------------------------------------------
insert into public.inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
select a.id, i.id, 0, 0
from public.insumos i
cross join public.almacenes a
where i.activo and a.nombre = 'Bodega'
on conflict (almacen_id, insumo_id) do nothing;
