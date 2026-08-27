-- fn_crear_orden cobra el precio del CANAL.
--
-- La funcion es grande y no se reescribe entera: se parchea con el metodo de
-- CLAUDE.md (leer pg_get_functiondef, verificar que el ancla aparece
-- exactamente N veces, reemplazar y ejecutar). Si el ancla no cuadra, aborta
-- ruidosamente en vez de dejar la funcion a medias.
--
-- Lo unico que cambia: las dos llamadas a fn_precio_linea(producto, padre)
-- pasan a fn_precio_linea(producto, padre, p_canal). El resto —el recalculo
-- del total, la idempotencia, las comandas— queda intacto.

do $$
declare
  v_def text;
  v_veces int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_crear_orden';

  if v_def is null then
    raise exception 'No existe fn_crear_orden: nada que parchear.';
  end if;

  -- Si ya trae el canal, esta migracion ya corrio. Se busca un marcador
  -- ESPECIFICO de la llamada parchada: la firma tambien menciona `p_canal`
  -- y un `position('p_canal' ...)` a secas daria siempre positivo.
  if position('::uuid, p_canal)' in v_def) > 0 then
    raise notice 'fn_crear_orden ya usa el precio del canal; no se toca.';
    return;
  end if;

  select count(*) into v_veces
  from regexp_matches(v_def, 'fn_precio_linea\(', 'g');

  if v_veces <> 2 then
    raise exception
      'fn_crear_orden llama a fn_precio_linea % veces, se esperaban 2. La funcion cambio: revisar a mano antes de parchear.',
      v_veces;
  end if;

  -- Las dos llamadas estan escritas distinto: una en un renglon y otra
  -- partida en varios. Por eso el patron tolera saltos de linea y espacios
  -- (\s*) en vez de exigir un texto exacto: buscar la forma literal solo
  -- encontraba una de las dos y dejaba la funcion cobrando mitad y mitad.
  v_def := regexp_replace(
    v_def,
    '(fn_precio_linea\(\s*\(e\.item->>''producto_id''\)::uuid,\s*\(padre\.item->>''producto_id''\)::uuid)\s*\)',
    '\1, p_canal)',
    'g'
  );

  select count(*) into v_veces
  from regexp_matches(v_def, 'p_canal\)', 'g');
  if v_veces < 2 then
    raise exception
      'El parche no aplico en las 2 llamadas (solo %). Se aborta sin tocar la funcion.', v_veces;
  end if;

  execute v_def;
  raise notice 'fn_crear_orden parchada: ahora cobra el precio del canal.';
end $$;
