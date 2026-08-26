-- ============================================================================
-- Las dos funciones que se le escaparon a `fijar_search_path_funciones_restantes`
-- ============================================================================
-- `fn_precio_linea` y `fn_tasa_mancuernas` nacieron despues de aquella
-- migracion y quedaron con el search_path mutable, que es lo que el advisor
-- marca. Ninguna es `security definer`, asi que no hay escalada de privilegios
-- posible; se fijan igual porque una funcion que resuelve nombres segun el
-- search_path del que llama puede terminar leyendo otra tabla que la que cree.
--
-- Se usa `alter function ... set`, que NO toca la firma: la trampa #2 del
-- CLAUDE.md (cambiar la firma no reemplaza, duplica) no aplica aqui.
alter function public.fn_precio_linea(uuid, uuid) set search_path = public;
alter function public.fn_tasa_mancuernas() set search_path = public;
