-- Le falta un escalon al camino de una orden.
--
-- Esta migracion va DESPUES de `funciones_de_horno` a proposito: asi paso de
-- verdad. `fn_produccion_refrescar_estado` ya ponia 'en_horno' y el check
-- viejo lo rechazaba -- el error salio al probar la cadena completa contra la
-- base, no antes. Se deja en su lugar real del historial porque el estado
-- final da el destino, no el camino (CLAUDE.md §4).

alter table public.ordenes_produccion
  drop constraint if exists ordenes_produccion_estado_check;
alter table public.ordenes_produccion
  add constraint ordenes_produccion_estado_check
  check (estado in ('pendiente', 'en_proceso', 'en_horno', 'terminada', 'cancelada'));

comment on column public.ordenes_produccion.estado is
  'pendiente -> en_proceso (produccion arma) -> en_horno -> terminada. Se DEDUCE de los renglones, nadie la marca a mano.';
