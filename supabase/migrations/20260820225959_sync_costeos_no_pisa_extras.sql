-- La sincronizacion de costosshake deja de pisarle el precio a los extras.
-- Ver supabase/migrations/sync_costeos_no_pisa_extras.sql para el detalle.
do $$
declare
  d text;
  antes_update  constant text := 'from _prod d where lower(p.nombre)=lower(d.nombre);';
  antes_insert  constant text := 'from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre));';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  if d is null then
    raise exception 'No existe public.fn_sync_app_data: nada que parchear.';
  end if;

  if position(antes_update in d) = 0 then
    raise exception 'No se encontro el update por nombre en fn_sync_app_data. La funcion cambio: revisar a mano antes de tocar nada.';
  end if;
  d := replace(d, antes_update,
       'from _prod d where lower(p.nombre)=lower(d.nombre) and not p.es_extra;');

  if position(antes_insert in d) = 0 then
    raise exception 'No se encontro el insert por nombre en fn_sync_app_data. La funcion cambio: revisar a mano antes de tocar nada.';
  end if;
  d := replace(d, antes_insert,
       'from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre) and not p.es_extra);');

  execute d;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_sync_app_data';
  if position('lower(p.nombre)=lower(d.nombre) and not p.es_extra;' in d) = 0 then
    raise exception 'El parche no quedo aplicado.';
  end if;
end $$;