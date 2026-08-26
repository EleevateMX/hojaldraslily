-- Una imagen de referencia por sabor.
--
-- El kiosko, la caja y sobre todo el INVENTARIO eran listas de texto: para
-- saber cual es cual hay que leer "Pasta de Guayaba - Chica - 24 cuadros"
-- entero. Con un dibujo por sabor se distinguen de un vistazo.
--
-- Aqui NO se guarda una imagen: se guarda el NOMBRE del archivo del dibujo
-- (`pasta-de-guayaba.png`). El dibujo vive dentro de cada app, en
-- `public/productos/`, y la funcion `urlDeFoto` de @shake/utils lo resuelve.
-- Las fotos de verdad, cuando Lily las suba desde Admin, quedan como URL
-- completa de Storage y esa gana sola: la regla es "si empieza con http, es
-- foto; si no, es dibujo".
--
-- Por eso solo se toca a quien NO tiene nada puesto: un producto con foto
-- de verdad no se pisa.

update productos p
   set imagen_url = d.archivo
  from (
    -- El orden IMPORTA: "Pasta de Guayaba y Queso de Bola" tiene que empatar
    -- antes que "Pasta de Guayaba", o se lleva el dibujo equivocado.
    select id,
      case
        when nombre ilike '%pasta de guayaba y queso de bola%' then 'guayaba-queso-bola.png'
        when nombre ilike '%jamón y queso%' or nombre ilike '%jamon y queso%' then 'jamon-y-queso.png'
        when nombre ilike '%hawaiana%'            then 'hawaiana.png'
        when nombre ilike '%fiesta%'              then 'fiesta.png'
        when nombre ilike '%guayaba%'             then 'pasta-de-guayaba.png'
        when nombre ilike '%daysi%' or nombre ilike '%jalape%' then 'daysi.png'
        when nombre ilike '%cóctel%' or nombre ilike '%coctel%' then 'coctel.png'
        when nombre ilike '%nutella%'             then 'nutella.png'
        when nombre ilike '%manchego%'            then 'queso-manchego.png'
        when nombre ilike '%philadelphia%'        then 'queso-philadelphia.png'
        when nombre ilike '%queso de bola%'       then 'queso-de-bola.png'
        when nombre ilike '%lomo%'                then 'lomo.png'
        when nombre ilike '%café de olla%' or nombre ilike '%cafe de olla%' then 'cafe-de-olla.png'
        when nombre ilike '%americano%'           then 'americano.png'
        when nombre ilike '%café con leche%' or nombre ilike '%cafe con leche%' then 'cafe-con-leche.png'
        when nombre ilike '%chocolate%'           then 'chocolate-caliente.png'
        when nombre ilike '%horchata%'            then 'agua-de-horchata.png'
        when nombre ilike '%refresco%'            then 'refresco.png'
        when nombre ilike '%agua%'                then 'agua-embotellada.png'
      end as archivo
    from productos
  ) d
 where d.id = p.id
   and d.archivo is not null
   and coalesce(p.imagen_url, '') = '';
