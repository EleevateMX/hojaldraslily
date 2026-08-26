-- Fuera las categorias que se heredaron del motor original.
--
-- La replica trajo el arbol de categorias del negocio del que se copio el
-- sistema: "Scoops - Creatinas", "Kombuchas", "Collagen Drinks", "Amino
-- Refreshers", "Suplementos Birdman"... Nada de eso se vende en una
-- panaderia de hojaldras, pero seguia ahi, y con el interruptor de menus
-- nuevo salian TODAS en la pantalla desde la que se abre y cierra el menu:
-- 32 renglones para elegir entre 5 que existen de verdad.
--
-- Solo se borran las que no le sirven a nadie: sin un solo producto que las
-- apunte (ni activo ni apagado) y ya inactivas. `productos.categoria_id` es
-- la unica llave foranea que apunta aqui, asi que sin productos no hay nada
-- que se rompa. Las que si tienen historia se quedan: apagadas no estorban,
-- y borrarlas dejaria productos viejos sin categoria.

delete from categorias c
where c.activa = false
  and c.nombre not in ('Extras', 'Extras Bebidas')
  and not exists (select 1 from productos p where p.categoria_id = c.id);
