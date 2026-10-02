-- El Pan de Muerto ya tiene precios: se prende la temporada.
--
-- Llegaron de la casa con su cartel: Tradicional $80 / $130, y Queso
-- Philadelphia, Queso de Bola y Nutella $120 / $230. Los ocho renglones ya
-- estaban sembrados en cero desde la siembra del menu; aqui solo se les pone
-- precio, Clave y se encienden.

-- ---------------------------------------------------------------------------
-- 1. El sabor se junta al nombre de la familia; el tamano se queda aparte
-- ---------------------------------------------------------------------------
-- Se llamaban "Pan de Muerto · Tradicional · Chica": TRES partes. El catalogo
-- de la caja agrupa por lo que va **antes del primer punto medio**, asi que
-- los ocho habrian caido en una sola tarjeta y los mosaicos habrian dicho
-- "Tradicional, Tradicional, Queso de Bola, Queso de Bola..." -- cuatro
-- parejas de etiquetas identicas, distinguibles solo por el precio. En una
-- pantalla tactil eso es cobrar la chica creyendo que es la grande.
--
-- Con el sabor pegado al nombre quedan CUATRO tarjetas de dos tamanos cada
-- una, que es exactamente como esta el cartel: TRADICIONAL  CH $80  GDE $130.
update public.productos p
   set nombre = v.nombre, precio = v.precio, codigo = v.codigo, orden = v.orden, activo = true
  from (values
    ('Pan de Muerto · Tradicional · Chica',         'Pan de Muerto Tradicional · Chica',         'TE-PM-TR-CH',  80, 50),
    ('Pan de Muerto · Tradicional · Grande',        'Pan de Muerto Tradicional · Grande',        'TE-PM-TR-GR', 130, 51),
    ('Pan de Muerto · Queso Philadelphia · Chica',  'Pan de Muerto Queso Philadelphia · Chica',  'TE-PM-QP-CH', 120, 52),
    ('Pan de Muerto · Queso Philadelphia · Grande', 'Pan de Muerto Queso Philadelphia · Grande', 'TE-PM-QP-GR', 230, 53),
    ('Pan de Muerto · Queso de Bola · Chica',       'Pan de Muerto Queso de Bola · Chica',       'TE-PM-QB-CH', 120, 54),
    ('Pan de Muerto · Queso de Bola · Grande',      'Pan de Muerto Queso de Bola · Grande',      'TE-PM-QB-GR', 230, 55),
    ('Pan de Muerto · Nutella · Chica',             'Pan de Muerto Nutella · Chica',             'TE-PM-NU-CH', 120, 56),
    ('Pan de Muerto · Nutella · Grande',            'Pan de Muerto Nutella · Grande',            'TE-PM-NU-GR', 230, 57)
  ) as v(viejo, nombre, codigo, precio, orden)
 where p.nombre = v.viejo;

-- La Rosca de Reyes tiene el mismo defecto de nombre y la misma cura. Se
-- arregla ahora, apagada y en cero como esta, y no en enero con la fila en la
-- puerta: renombrar un producto que ya se vende es mucho mas caro.
update public.productos p
   set nombre = v.nombre, codigo = v.codigo
  from (values
    ('Rosca de Reyes · Tradicional · Chica',         'Rosca de Reyes Tradicional · Chica',         'TE-RR-TR-CH'),
    ('Rosca de Reyes · Tradicional · Grande',        'Rosca de Reyes Tradicional · Grande',        'TE-RR-TR-GR'),
    ('Rosca de Reyes · Queso Philadelphia · Chica',  'Rosca de Reyes Queso Philadelphia · Chica',  'TE-RR-QP-CH'),
    ('Rosca de Reyes · Queso Philadelphia · Grande', 'Rosca de Reyes Queso Philadelphia · Grande', 'TE-RR-QP-GR'),
    ('Rosca de Reyes · Queso de Bola · Chica',       'Rosca de Reyes Queso de Bola · Chica',       'TE-RR-QB-CH'),
    ('Rosca de Reyes · Queso de Bola · Grande',      'Rosca de Reyes Queso de Bola · Grande',      'TE-RR-QB-GR'),
    ('Rosca de Reyes · Nutella · Chica',             'Rosca de Reyes Nutella · Chica',             'TE-RR-NU-CH'),
    ('Rosca de Reyes · Nutella · Grande',            'Rosca de Reyes Nutella · Grande',            'TE-RR-NU-GR')
  ) as v(viejo, nombre, codigo)
 where p.nombre = v.viejo;

-- ---------------------------------------------------------------------------
-- 2. La rosca grande es la MISMA rosca, solo mas grande
-- ---------------------------------------------------------------------------
-- La casa lo aclaro: "la rosca solo cambia el tamano, la chica o normal es la
-- del menu diario y la grande es la del menu de encargo". Se habia dado de
-- alta como "Rosca de Queso Crema · Grande" porque asi venia escrita en la
-- lista, pero el menu diario la llama Philadelphia -- y con dos nombres
-- distintos la caja pintaba DOS tarjetas de un producto, en vez de una con
-- sus dos tamanos. Manda el nombre de la casa.
update public.productos
   set nombre = 'Rosca de Queso Philadelphia · Grande'
 where codigo = 'PE-RQC-GR';

-- ---------------------------------------------------------------------------
-- 3. Se abre la temporada
-- ---------------------------------------------------------------------------
-- La Rosca de Reyes sigue apagada y en cero dentro de esta misma seccion, asi
-- que no se asoma hasta enero.
update public.categorias set activa = true where nombre = 'Menú de Temporada';

-- ---------------------------------------------------------------------------
-- 4. Y no va en Rappi mientras nadie lo decida
-- ---------------------------------------------------------------------------
-- El cartel dice "ENCARGA tu Pan de Muerto": es de encargo, como los otros
-- catorce. Y sobre todo: sin fila en `precios_canal` se venderia en la
-- plataforma al precio de MOSTRADOR, o sea sin comision, perdiendo dinero en
-- cada venta sin que nada lo avisara. Si deciden ponerlo, se captura su
-- precio de plataforma y se marca disponible.
insert into public.precios_canal (producto_id, canal, precio, disponible)
select p.id, 'rappi'::canal_orden, 0, false
from public.productos p where p.codigo like 'TE-PM-%'
on conflict (producto_id, canal) do update set disponible = false, precio = 0;
