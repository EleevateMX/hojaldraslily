-- Renombrar en costosshake deja de duplicar y de romper vinculos.
-- Ver supabase/migrations/sync_renombra_en_su_lugar.sql para el detalle.
do $$
declare
  d text;
  ancla constant text := 'update productos p set precio=d.precio';
  renombre constant text :=
$ren$-- Renombre en el lugar: si el codigo ya existe con otro nombre, es el
  -- MISMO producto con nombre nuevo. Sin esto, el nombre nuevo no empata
  -- con nada, se inserta un producto vacio y el viejo se desactiva: el
  -- producto se parte en dos y pierde sus extras.
  -- Solo cuando no hay ambiguedad: un producto activo y una fila.
  update productos p
  set nombre = d.nombre
  from _prod d
  where coalesce(trim(d.codigo),'') <> ''
    and trim(p.codigo) = trim(d.codigo)
    and lower(p.nombre) <> lower(d.nombre)
    and p.activo
    and not p.es_extra
    and not p.es_combo
    and (select count(*) from _prod e where trim(e.codigo) = trim(d.codigo)) = 1
    and (select count(*) from productos q
          where q.activo and not q.es_extra and not q.es_combo
            and trim(q.codigo) = trim(d.codigo)) = 1;

  $ren$;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  if d is null then
    raise exception 'No existe public.fn_sync_app_data.';
  end if;
  if position(ancla in d) = 0 then
    raise exception 'No se encontro el update por nombre. La funcion cambio: revisar a mano.';
  end if;
  if position('_prod' in d) = 0 then
    raise exception 'No se encontro la tabla temporal _prod. La funcion cambio: revisar a mano.';
  end if;
  if position('Renombre en el lugar' in d) > 0 then
    return;
  end if;

  d := replace(d, ancla, renombre || ancla);
  execute d;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_sync_app_data';
  if position('Renombre en el lugar' in d) = 0 then
    raise exception 'El parche de renombre no quedo aplicado.';
  end if;
end $$;