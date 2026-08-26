-- El scoop y el bote de una misma fila comparten Clave; el ancla de
-- renombre exigía "exactamente 1 con esa clave" y por eso se inhibía justo
-- en las filas que se venden de las dos formas. Ahora compara dentro de su
-- especie: los que empiezan con 'Scoop ' entre sí, los botes entre sí.
do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  v_old := $a$    and (select count(*) from _prod e where trim(e.codigo) = trim(d.codigo)) = 1
    and (select count(*) from productos q
          where q.activo and not q.es_extra and not q.es_combo
            and trim(q.codigo) = trim(d.codigo)) = 1;$a$;
  v_new := $a$    and (p.nombre ilike 'Scoop %') = (d.nombre ilike 'Scoop %')
    and (select count(*) from _prod e where trim(e.codigo) = trim(d.codigo)
           and (e.nombre ilike 'Scoop %') = (d.nombre ilike 'Scoop %')) = 1
    and (select count(*) from productos q
          where q.activo and not q.es_extra and not q.es_combo
            and trim(q.codigo) = trim(d.codigo)
            and (q.nombre ilike 'Scoop %') = (d.nombre ilike 'Scoop %')) = 1;$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla del renombre no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end $mig$;