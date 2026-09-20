-- Las funciones de inventario dejaban a PUBLIC con permiso de ejecución.
--
-- Salió al comparar contra las de encargos y producción, que sí hacen
-- `revoke all ... from public`. Las siete de inventario (20260917105000 y
-- 20260917105100) solo hacían `grant execute ... to authenticated`, y eso
-- **suma** un permiso sin quitar el que Postgres da por omisión: en
-- `pg_proc.proacl` se ven con `=X/postgres`, que es PUBLIC.
--
-- ¿Pasaba algo? No: las siete empiezan con `if not fn_es_staff() then raise`,
-- así que nadie sin sesión de personal ejecutó nunca nada. Pero dejar la
-- puerta abierta y confiar en el candado de adentro es justo lo que CLAUDE.md
-- §5 dice que no se haga -- y ahí la lección se aprendió caro, con 17 tablas
-- que tenían `using (true)` y el GRANT de `anon` al mismo tiempo.
--
-- Una sola capa de seguridad no es una capa de seguridad: es un punto de
-- falla. Si mañana alguien edita una de estas funciones y se le olvida el
-- `fn_es_staff()` de arriba, el GRANT de abajo es lo único que queda.

do $permisos$
declare f text;
begin
  foreach f in array array[
    'fn_inventario_resumen(uuid)',
    'fn_inventario_contar(jsonb, uuid)',
    'fn_inventario_entrada(jsonb, text, uuid)',
    'fn_inventario_merma(uuid, numeric, text, uuid)',
    'fn_inventario_minimo(uuid, numeric, uuid)',
    'fn_inventario_lista_de_compra(uuid)',
    'fn_inventario_huecos(integer)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    -- `anon` conserva el suyo por las privilegios por omisión del esquema, así
    -- que hay que quitárselo por nombre: nadie sin sesión cuenta el almacén.
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$permisos$;
