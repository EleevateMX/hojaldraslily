-- ============================================================================
-- Las tablas de respaldo dejan de ser legibles por cualquiera
-- ============================================================================
-- En el proyecto original, `_respaldo_pruebas_28jul` y `_respaldo_pruebas_30jul`
-- guardaban 198 filas de datos reales copiadas antes de unas pruebas de julio:
-- cada renglon trae el nombre de la tabla y la fila entera en JSON. Eran las
-- dos unicas tablas de `public` sin RLS, o sea legibles por cualquiera con la
-- llave publicable —que vive dentro del frontend desplegado.
--
-- Se les prende RLS y se quedan SIN politicas a proposito: no son de ninguna
-- app, son un respaldo. Asi solo las alcanzan las funciones con definer y la
-- llave de servicio. No se borran: son justamente un respaldo, y borrarlas
-- seria tirar el paracaidas por ordenar el clóset.
--
-- ADAPTACION PARA HOJALDRAS LILY (2026-08-26): esos dos respaldos son
-- artefactos de una tarde de pruebas del proyecto original; en esta base
-- nunca se crearon. El `alter table` directo abortaba la migracion entera con
-- "relation does not exist". Se vuelve condicional para que la migracion
-- corra igual aqui y siga sirviendo tal cual alla. Lo que NO se toca es el
-- candado del final —que ninguna tabla de `public` se quede sin RLS—, que es
-- la razon de ser de esta migracion y aplica a las dos bases por igual.
do $$
declare t text;
begin
  foreach t in array array['_respaldo_pruebas_28jul', '_respaldo_pruebas_30jul']
  loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      -- Y por si algun grant suelto las dejaba pasar de todos modos.
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

do $$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where c.relkind = 'r' and ns.nspname = 'public' and not c.relrowsecurity;
  if n > 0 then
    raise exception 'Quedaron % tablas de public sin RLS.', n;
  end if;
end $$;
