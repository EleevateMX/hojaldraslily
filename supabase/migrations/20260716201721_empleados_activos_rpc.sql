-- Lista de empleados activos (nombre + rol) SIN exponer pin_hash. Para el
-- selector del login del POS. Aditivo.
create or replace function fn_empleados_activos(p_sucursal uuid default null)
returns table(id uuid, nombre text, rol text, sucursal_id uuid)
language sql
security definer
set search_path = public
as $$
  select e.id, e.nombre, r.slug, e.sucursal_id
  from empleados e
  join roles r on r.id = e.rol_id
  where e.activo
    and (p_sucursal is null or e.sucursal_id = p_sucursal or e.sucursal_id is null)
  order by e.nombre;
$$;

revoke all on function fn_empleados_activos(uuid) from public;
grant execute on function fn_empleados_activos(uuid) to anon, authenticated;