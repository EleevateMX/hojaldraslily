-- Ocho funciones de personal que `anon` todavía podía llamar.
--
-- Salió al revisar los advisors de Supabase después de tocar encargos y
-- producción. Todas son SECURITY DEFINER, mueven dinero o inventario, y
-- adentro exigen `fn_rol_staff()`. O sea que estaban protegidas por **una
-- sola capa**: el `if` de adentro. El repo ya aprendió que eso no basta
-- (CLAUDE.md §5) — «una sola capa no es una capa, es un punto de falla, y el
-- día que alguien edite la función y se le olvide el `if`, el GRANT es lo
-- único que queda».
--
-- Se comprobó antes de cerrar QUIÉN las llama: `cobrarEncargo`,
-- `crearEncargo`, `cancelarEncargo` y `mandarAProducir` salen solo de Admin y
-- de la caja, y las dos entran con PIN → sesión real de Supabase Auth. Las
-- otras cuatro no tienen ningún llamador en el repo. **El kiosko no toca
-- ninguna**: no llama encargos ni producción.
--
-- Eso último importa, porque aquí **no se puede barrer en masa**. El kiosko y
-- las estaciones escriben sin sesión a propósito, así que quitarle `anon` a
-- `fn_crear_orden` o `fn_cobrar_orden` dejaría a la tienda sin poder vender.
-- Esas se cierran dándoles sesión real a esas pantallas (ya existe
-- `staff-login`), no quitándoles el permiso — sigue anotado como deuda en §5.
--
-- Y el `revoke from public` va junto con el de `anon` por la otra mitad de la
-- misma trampa: Postgres le da EXECUTE a PUBLIC por omisión, así que un
-- `grant ... to authenticated` deja la puerta de PUBLIC abierta igual.
--
-- Comprobado contra la base, en los dos sentidos: como `anon` rebota por
-- **permisos** (no por el `if`), y el personal sigue mandando a producir,
-- apartando y cancelando.

revoke all on function public.fn_encargo_cobrar(uuid, text) from anon, public;
revoke all on function public.fn_encargo_crear(text, jsonb, text, date, text, text, numeric) from anon, public;
revoke all on function public.fn_encargo_cancelar(uuid, text) from anon, public;
revoke all on function public.fn_produccion_mandar_a_hacer(jsonb, text) from anon, public;
revoke all on function public.fn_horneada_registrar(text, integer, text, text) from anon, public;
revoke all on function public.fn_produccion_avanzar(uuid, integer) from anon, public;
revoke all on function public.fn_costos_autorizar(text, boolean) from anon, public;
revoke all on function public.fn_costos_usuarios() from anon, public;

grant execute on function public.fn_encargo_cobrar(uuid, text) to authenticated;
grant execute on function public.fn_encargo_crear(text, jsonb, text, date, text, text, numeric) to authenticated;
grant execute on function public.fn_encargo_cancelar(uuid, text) to authenticated;
grant execute on function public.fn_produccion_mandar_a_hacer(jsonb, text) to authenticated;
grant execute on function public.fn_horneada_registrar(text, integer, text, text) to authenticated;
grant execute on function public.fn_produccion_avanzar(uuid, integer) to authenticated;
grant execute on function public.fn_costos_autorizar(text, boolean) to authenticated;
grant execute on function public.fn_costos_usuarios() to authenticated;
