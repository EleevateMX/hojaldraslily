-- 1) vw_combos (y vw_costeo_producto, mismo hallazgo, aprovechado aquí) se
-- creaban con semántica SECURITY DEFINER por default de Postgres (corren
-- con los privilegios del dueño de la vista, no del que consulta) — eso
-- puede saltarse RLS de las tablas subyacentes. Forzamos security_invoker
-- para que respeten los permisos reales de quien consulta.
alter view public.vw_combos set (security_invoker = true);
alter view public.vw_costeo_producto set (security_invoker = true);

-- 2) Funciones de triggers y helpers internos de combos no deben quedar
-- expuestas como RPC pública (Postgres otorga EXECUTE a PUBLIC por
-- default al crear una función) — nadie las llama directo, solo el
-- motor de triggers o desde dentro de otras funciones SECURITY DEFINER.
revoke execute on function public.fn_cocina_de_producto(uuid) from public;
revoke execute on function public.fn_combo_items_validar() from public;
revoke execute on function public.fn_combo_recalcular(uuid) from public;
revoke execute on function public.trg_combo_items_recalcular() from public;
revoke execute on function public.trg_recetas_actualiza_combos() from public;
revoke execute on function public.trg_producto_desactiva_combos() from public;