-- CRUD de empleados para Admin. PIN siempre hasheado con pgcrypto; nunca se
-- expone pin_hash. SECURITY DEFINER. Aditivo. (Hardening de auth: Fase 9.)

-- Roles disponibles (para el selector).
create or replace function fn_roles()
returns table(id uuid, slug text, nombre text)
language sql security definer set search_path = public as $$
  select id, slug, nombre from roles order by nombre;
$$;

-- Lista de empleados para administración (incluye inactivos, sin pin_hash).
create or replace function fn_admin_empleados()
returns table(id uuid, nombre text, rol text, rol_id uuid, sucursal_id uuid, activo boolean, tiene_pin boolean)
language sql security definer set search_path = public as $$
  select e.id, e.nombre, r.nombre, e.rol_id, e.sucursal_id, e.activo, (e.pin_hash is not null)
  from empleados e join roles r on r.id = e.rol_id
  order by e.activo desc, e.nombre;
$$;

-- Alta de empleado (PIN opcional; si viene, se hashea).
create or replace function fn_crear_empleado(p_nombre text, p_rol_id uuid, p_pin text default null, p_sucursal uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if coalesce(trim(p_nombre),'') = '' then raise exception 'El nombre es obligatorio'; end if;
  insert into empleados (nombre, rol_id, sucursal_id, pin_hash, activo)
  values (trim(p_nombre), p_rol_id,
          coalesce(p_sucursal, (select id from sucursales order by created_at limit 1)),
          case when coalesce(p_pin,'') = '' then null else crypt(p_pin, gen_salt('bf')) end,
          true)
  returning id into v_id;
  return v_id;
end $$;

-- Edición (nombre/rol/activo/PIN opcionales; PIN sólo cambia si se envía).
create or replace function fn_actualizar_empleado(p_id uuid, p_nombre text default null, p_rol_id uuid default null, p_activo boolean default null, p_pin text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update empleados set
    nombre = coalesce(nullif(trim(p_nombre),''), nombre),
    rol_id = coalesce(p_rol_id, rol_id),
    activo = coalesce(p_activo, activo),
    pin_hash = case when p_pin is null then pin_hash
                    when p_pin = '' then pin_hash
                    else crypt(p_pin, gen_salt('bf')) end
  where id = p_id;
end $$;

revoke all on function fn_roles() from public;
revoke all on function fn_admin_empleados() from public;
revoke all on function fn_crear_empleado(text,uuid,text,uuid) from public;
revoke all on function fn_actualizar_empleado(uuid,text,uuid,boolean,text) from public;
grant execute on function fn_roles() to anon, authenticated;
grant execute on function fn_admin_empleados() to anon, authenticated;
grant execute on function fn_crear_empleado(text,uuid,text,uuid) to anon, authenticated;
grant execute on function fn_actualizar_empleado(uuid,text,uuid,boolean,text) to anon, authenticated;