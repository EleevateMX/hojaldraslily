-- Precision sobre lo que publicar hace y lo que NO hace.
--
-- La migracion anterior decia "el kiosko sigue mostrando lo ultimo
-- publicado hasta que alguien confirme". Eso es mas de lo que ocurre: las
-- pantallas leen `productos` en vivo, asi que publicar es TOCARLES EL
-- TIMBRE para que recarguen. Si alguien recarga el kiosko a mano antes de
-- publicar, va a ver los cambios sin publicar.
--
-- Se deja escrito en la propia base para que nadie tenga que deducirlo
-- leyendo el codigo, y porque la diferencia importa: significa que
-- "guardar a medias" sigue teniendo consecuencia si la pantalla se
-- reinicia, no que este blindado.
comment on function fn_catalogo_publicar(text, text) is
  'Guarda la foto del catalogo y toca el timbre para que las pantallas '
  'recarguen. Las pantallas leen productos en vivo: publicar sincroniza el '
  'momento en que lo ven, no congela lo que ven. Un reinicio del kiosko '
  'tambien trae lo no publicado.';

comment on function fn_catalogo_cambios() is
  'Que cambio en el catalogo desde la ultima publicacion: altas, bajas, '
  'renombres (por id, por eso un renombre no aparece como alta+baja), '
  'precios, encendidos/apagados y combos.';

comment on table catalogo_publicaciones is
  'Una fila por publicacion, con la foto del catalogo en ese momento. Es '
  'contra la ultima de estas que se compara, no contra "hace un rato": si '
  'alguien guardo el lunes y publica el jueves tiene que ver los tres dias '
  'de cambios juntos.';