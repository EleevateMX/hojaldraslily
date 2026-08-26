-- Hallazgos de get_advisors sobre lo recién creado, cerrados antes de dar
-- por terminada la ronda:
--
-- 1) `producto_extras` tenía INSERT/DELETE abiertos. No hacen falta: la
--    única forma de gestionar extras es vía fn_guardar_extra/fn_quitar_extra
--    (SECURITY DEFINER), que además validan estación, precio y que el
--    destino sea realmente un extra. Se quitan y se revoca el GRANT de
--    tabla para que la escritura directa quede cerrada de verdad (una
--    policy sin GRANT base no protege, y un GRANT sin policy tampoco:
--    aquí se cierran los dos).
-- 2) `fn_producto_extras_validar()` es una función de trigger — nadie debe
--    poder invocarla como RPC. El `revoke from public` no bastó porque
--    Supabase otorga EXECUTE explícitamente a anon/authenticated.
drop policy if exists ins_producto_extras on public.producto_extras;
drop policy if exists upd_producto_extras on public.producto_extras;
drop policy if exists del_producto_extras on public.producto_extras;

revoke all on public.producto_extras from anon, authenticated;
grant select on public.producto_extras to anon, authenticated;

revoke execute on function public.fn_producto_extras_validar() from anon, authenticated, public;
revoke execute on function public.fn_combo_items_validar() from anon, authenticated;
revoke execute on function public.trg_combo_items_recalcular() from anon, authenticated;
revoke execute on function public.trg_recetas_actualiza_combos() from anon, authenticated;
revoke execute on function public.trg_producto_desactiva_combos() from anon, authenticated;
revoke execute on function public.fn_cocina_de_producto(uuid) from anon, authenticated;
revoke execute on function public.fn_combo_recalcular(uuid) from anon, authenticated;