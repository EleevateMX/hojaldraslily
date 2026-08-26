-- La baja logica de fn_sync_app_data solo mira una lista fija de categorias.
-- Al partir Scoops y Suplementos por tipo, los productos quedaron fuera de esa
-- lista: uno borrado de costosshake se habria quedado activo para siempre.
-- Se agregan las doce categorias nuevas para que sigan la misma regla que su
-- categoria madre.
do $$
declare
  d text;
  viejo constant text := $a$'Café','Tés','Kombuchas')$a$;
  nuevo constant text := $a$'Café','Tés','Kombuchas',
                     'Scoops - Proteínas','Scoops - Creatinas','Scoops - BCAAs',
                     'Scoops - Colágeno','Scoops - Pre-entrenos','Scoops - Birdman',
                     'Suplementos - Proteínas','Suplementos - Creatinas','Suplementos - BCAAs',
                     'Suplementos - Colágeno','Suplementos - Pre-entrenos','Suplementos Birdman')$a$;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  if d is null then
    raise exception 'No existe public.fn_sync_app_data.';
  end if;
  if position('Suplementos Birdman' in d) > 0 then
    return;  -- ya aplicado
  end if;
  if position(viejo in d) = 0 then
    raise exception 'No se encontro la lista de categorias de la baja logica. La funcion cambio: revisar a mano.';
  end if;

  d := replace(d, viejo, nuevo);
  execute d;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_sync_app_data';
  if position('Suplementos Birdman' in d) = 0 then
    raise exception 'El parche de la lista de bajas no quedo aplicado.';
  end if;
  if position('Renombre en el lugar' in d) = 0 then
    raise exception 'Se perdio el parche de renombre al reescribir la funcion.';
  end if;
end $$;