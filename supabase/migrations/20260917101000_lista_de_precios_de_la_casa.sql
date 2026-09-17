-- La lista de precios de la casa, tal como la tienen escrita.
--
-- Hasta hoy el catalogo tenia las hojaldras (que si estaban bien) y nada mas:
-- faltaban los bocadillos, los panes, las galletas y el anis -- 17 productos
-- que se venden todos los dias y que la caja no podia cobrar. Tambien faltaba
-- el menu de temporada, que la hoja lista por variante y tamano.
--
-- Dos reglas de la hoja que hay que leer bien:
--
--   * La columna de Rappi trae "X" donde el producto NO se vende en la
--     plataforma. Se escribe con `precios_canal.disponible = false`, no
--     dejando el renglon vacio: sin fila, el sistema cobraria el precio de
--     mostrador en Rappi (ver 20260917100000).
--
--   * Temporada viene SIN precio. Se siembran las variantes en ceros y
--     apagadas, que es justo lo que dice la hoja: el pan existe, el precio
--     todavia no se decide. Cuando llegue la temporada se captura el precio y
--     se prende -- ningun producto nace inventado.

-- ------------------------------------------------------------------------
-- Las familias que faltaban.
-- ------------------------------------------------------------------------
-- `va_a_pantalla = false` a proposito: estos panes ya estan hechos y se
-- despachan de la vitrina, no se le piden al horno en el momento. Mandarlos a
-- una pantalla llenaria la estacion de comandas que nadie tiene que atender, y
-- de paso ensuciaria el indicador de "ventas sin comanda" (CLAUDE.md, 4).
insert into public.categorias (nombre, nombre_singular, orden, activa, va_a_pantalla, cocina_id)
select v.nombre, v.singular, v.orden, true, false,
       (select id from public.cocinas where nombre = 'Alimentos' limit 1)
from (values ('Panes', 'Pan', 30), ('Galletas', 'Galleta', 31), ('Anís', 'Anís', 32))
     as v(nombre, singular, orden)
where not exists (select 1 from public.categorias c where c.nombre = v.nombre);

-- Bocadillos ya existia del sembrado, pero apagada.
update public.categorias set activa = true, orden = 29 where nombre = 'Bocadillos';

-- ------------------------------------------------------------------------
-- Los productos, con su precio de mostrador y el de Rappi.
--
-- rappi = null significa la "X" de la hoja: no se vende ahi.
-- ------------------------------------------------------------------------
do $seed$
declare
  r record;
  v_cat  uuid;
  v_id   uuid;
begin
  for r in
    select * from (values
      -- categoria,      nombre,                                  tienda, rappi, orden, activo
      ('Bocadillos', 'Pastelitos de Jamón y Queso · 5 pzas',      110.0,  135.0,  10, true),
      ('Bocadillos', 'Pastelitos de Lomo · 5 pzas',               140.0,  165.0,  11, true),
      ('Bocadillos', 'Bolitas de Queso Philadelphia',             110.0,  135.0,  12, true),

      ('Panes',      'Pan de leche',                               60.0,   75.0,  20, true),
      ('Panes',      'Tuti de Queso de Bola',                     120.0,  150.0,  21, true),
      ('Panes',      'Pata de Queso de Bola',                     120.0,  150.0,  22, true),
      ('Panes',      'Tuti de Nutella y Queso de Bola',           120.0,   null,  23, true),
      ('Panes',      'Rosca de Queso de Bola',                    310.0,  350.0,  24, true),
      ('Panes',      'Rosca de Queso Philadelphia',               310.0,  350.0,  25, true),
      ('Panes',      'Pata de Canela',                             60.0,   80.0,  26, true),
      ('Panes',      'Trenza Suiza',                              160.0,   null,  27, true),

      ('Galletas',   'Galletas de Mantequilla Dulces',             35.0,   45.0,  30, true),
      ('Galletas',   'Galletas de Mantequilla Saladas',            35.0,   45.0,  31, true),
      ('Galletas',   'Hojaldritas',                                35.0,   45.0,  32, true),

      ('Anís',       'Rosca de Anís',                              35.0,   null,  40, true),
      ('Anís',       'Bola Francesa',                              35.0,   null,  41, true),
      ('Anís',       'Bolitas de Anís',                            35.0,   null,  42, true),

      -- Temporada: la hoja lista las variantes y deja el precio en blanco.
      ('Temporada',  'Pan de Muerto · Tradicional · Chica',          0.0,   null,  50, false),
      ('Temporada',  'Pan de Muerto · Tradicional · Grande',         0.0,   null,  51, false),
      ('Temporada',  'Pan de Muerto · Queso de Bola · Chica',        0.0,   null,  52, false),
      ('Temporada',  'Pan de Muerto · Queso de Bola · Grande',       0.0,   null,  53, false),
      ('Temporada',  'Pan de Muerto · Nutella · Chica',              0.0,   null,  54, false),
      ('Temporada',  'Pan de Muerto · Nutella · Grande',             0.0,   null,  55, false),
      ('Temporada',  'Pan de Muerto · Queso Philadelphia · Chica',   0.0,   null,  56, false),
      ('Temporada',  'Pan de Muerto · Queso Philadelphia · Grande',  0.0,   null,  57, false),
      ('Temporada',  'Rosca de Reyes · Tradicional · Chica',         0.0,   null,  60, false),
      ('Temporada',  'Rosca de Reyes · Tradicional · Grande',        0.0,   null,  61, false),
      ('Temporada',  'Rosca de Reyes · Queso de Bola · Chica',       0.0,   null,  62, false),
      ('Temporada',  'Rosca de Reyes · Queso de Bola · Grande',      0.0,   null,  63, false),
      ('Temporada',  'Rosca de Reyes · Nutella · Chica',             0.0,   null,  64, false),
      ('Temporada',  'Rosca de Reyes · Nutella · Grande',            0.0,   null,  65, false),
      ('Temporada',  'Rosca de Reyes · Queso Philadelphia · Chica',  0.0,   null,  66, false),
      ('Temporada',  'Rosca de Reyes · Queso Philadelphia · Grande', 0.0,   null,  67, false)
    ) as t(categoria, nombre, tienda, rappi, orden, activo)
  loop
    select id into v_cat from public.categorias where nombre = r.categoria limit 1;
    if v_cat is null then
      raise exception 'No encuentro la categoria %', r.categoria;
    end if;

    -- Idempotente por nombre: correr la migracion dos veces no duplica el
    -- catalogo ni pisa un precio que gerencia ya haya movido a mano.
    select id into v_id from public.productos
     where lower(nombre) = lower(r.nombre) and not es_extra limit 1;

    if v_id is null then
      insert into public.productos
        (nombre, categoria_id, precio, activo, es_reventa, iva_incluido, orden)
      values
        (r.nombre, v_cat, r.tienda, r.activo, false, true, r.orden)
      returning id into v_id;
    else
      update public.productos
         set categoria_id = v_cat, orden = r.orden
       where id = v_id;
    end if;

    if r.rappi is null then
      -- La "X": existe, pero no en Rappi.
      insert into public.precios_canal (producto_id, canal, precio, disponible)
      values (v_id, 'rappi', 0, false)
      on conflict (producto_id, canal)
        do update set precio = 0, disponible = false, updated_at = now();
    else
      insert into public.precios_canal (producto_id, canal, precio, disponible)
      values (v_id, 'rappi', r.rappi, true)
      on conflict (producto_id, canal)
        do update set precio = excluded.precio, disponible = true, updated_at = now();
    end if;
  end loop;
end
$seed$;

-- ------------------------------------------------------------------------
-- Las hojaldras en Rappi: los precios reales, no un porcentaje.
--
-- Lo que habia sembrado era el precio de mostrador mas ~19 %, calculado.
-- La lista de la casa no sigue ningun porcentaje: la Fiesta de 12 sube de
-- $225 a $290 (+29 %) y la de 24 de $440 a $490 (+11 %). Con el calculo,
-- nueve de dieciocho hojaldras salian a un precio que el negocio no puso.
--
-- Y la hoja marca "X" en siete tamanos: se venden en el mostrador, no en la
-- plataforma. Eso tampoco se podia expresar con un porcentaje.
-- ------------------------------------------------------------------------
do $rappi$
declare
  r record;
  v_id uuid;
begin
  for r in
    select * from (values
      -- sabor,                     cuadros, rappi (null = X en la hoja)
      ('Jamón y Queso',                  12, 190.0),
      ('Jamón y Queso',                  24, 365.0),
      ('Jamón y Queso',                  48, 595.0),
      ('Hawaiana',                       12, 205.0),
      ('Hawaiana',                       24, null),
      ('Hawaiana',                       48, null),
      ('Fiesta',                          6, 145.0),
      ('Fiesta',                         12, 290.0),
      ('Fiesta',                         24, 490.0),
      ('Fiesta',                         48, null),
      ('Pasta de Guayaba',                6, 145.0),
      ('Pasta de Guayaba',               12, 290.0),
      ('Pasta de Guayaba',               24, null),
      ('Pasta de Guayaba',               48, null),
      ('Daysi, Jamón y Jalapeño',         6, 145.0),
      ('Daysi, Jamón y Jalapeño',        12, 290.0),
      ('Daysi, Jamón y Jalapeño',        24, null),
      ('Daysi, Jamón y Jalapeño',        48, null)
    ) as t(sabor, cuadros, rappi)
  loop
    select id into v_id from public.productos
     where sabor = r.sabor and cuadros = r.cuadros and not es_extra limit 1;
    if v_id is null then
      raise exception 'No encuentro la hojaldra % de % cuadros', r.sabor, r.cuadros;
    end if;

    insert into public.precios_canal (producto_id, canal, precio, disponible)
    values (v_id, 'rappi', coalesce(r.rappi, 0), r.rappi is not null)
    on conflict (producto_id, canal) do update
      set precio     = excluded.precio,
          disponible = excluded.disponible,
          updated_at = now();
  end loop;
end
$rappi$;

-- Lo de "Por encargo" no va en la plataforma: se pide, se hornea y se recoge
-- en la tienda. La hoja ni siquiera le pone columna de Rappi. Sin esta marca
-- se listaria al precio de mostrador, que es el error que arregla la X.
insert into public.precios_canal (producto_id, canal, precio, disponible)
select p.id, 'rappi', 0, false
from public.productos p
join public.categorias c on c.id = p.categoria_id
where c.nombre = 'Por encargo'
on conflict (producto_id, canal) do update
  set precio = 0, disponible = false, updated_at = now();
