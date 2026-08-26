-- Un sabor capturado con espacio al final ("... - B ") esquivaba el
-- recorte del sufijo. Se recorta el sabor ANTES de buscar el sufijo.
do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
  n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
  where n2.nspname = 'public' and p.proname = 'fn_sync_app_data';

  v_old := $a$regexp_replace(x->>'sabor', '\s*-\s*[BR]$', '')$a$;
  v_new := $a$regexp_replace(trim(x->>'sabor'), '\s*-\s*[BR]$', '')$a$;
  n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if n < 4 then
    raise exception 'Se esperaban al menos 4 apariciones del recorte, hay %', n;
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- Las condiciones ilike también deben tolerar el espacio final.
  v_old := $a$x->>'sabor' ilike '%- B'$a$;
  v_new := $a$trim(x->>'sabor') ilike '%- B'$a$;
  v_def := replace(v_def, v_old, v_new);
  v_old := $a$x->>'sabor' ilike '%- R'$a$;
  v_new := $a$trim(x->>'sabor') ilike '%- R'$a$;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end $mig$;

-- El scoop que alcanzó a nacer con el sufijo pegado.
update productos
set nombre = trim(regexp_replace(nombre, '\s*-\s*B$', ''))
where nombre ~ '\s-\s*B$' and not es_extra
  and not exists (select 1 from productos q
                  where lower(q.nombre) = lower(trim(regexp_replace(productos.nombre, '\s*-\s*B$', '')))
                    and q.id <> productos.id);