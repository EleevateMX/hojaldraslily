-- El panel "En vivo" muestra la versión del agente junto a cada impresora,
-- para saber desde aquí si la tienda ya corre el agente nuevo.
do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_panel_en_vivo';

  v_old := $a$        'ultima_impresion', to_char(i.ultima_impresion at time zone 'America/Merida', 'HH24:MI')$a$;
  v_new := $a$        'ultima_impresion', to_char(i.ultima_impresion at time zone 'America/Merida', 'HH24:MI'),
        'version', i.agente_version$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla de impresoras no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end $mig$;