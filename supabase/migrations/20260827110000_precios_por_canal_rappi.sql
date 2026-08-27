-- Rappi cobra otro precio, y el sistema tiene que saberlo.
--
-- Lo que se vende por Rappi no cuesta lo mismo que en mostrador: la
-- plataforma se lleva su comision, asi que el precio de lista sube (una pieza
-- de $160 sale en $190). Si el sistema cobrara el precio de mostrador, el
-- corte del dia no cuadraria contra lo que deposita Rappi.
--
-- Se guarda como una LISTA DE PRECIOS POR CANAL y no como una columna
-- `precio_rappi` en productos, porque manana va a haber otra plataforma con
-- otro precio y no se trata de ir agregando columnas. Un producto sin precio
-- de canal usa el de mostrador: la lista solo lleva las excepciones.
--
-- Y el precio lo sigue poniendo el SERVIDOR. El navegador manda el canal
-- —un dato, no un importe— y la base decide cuanto cuesta ahi.

-- 'rappi' como canal propio. Ya existia 'delivery', pero un reparto de la
-- casa y una plataforma no son lo mismo: la plataforma tiene su lista de
-- precios y hay que poder separarlas en el corte.
alter type canal_orden add value if not exists 'rappi';
