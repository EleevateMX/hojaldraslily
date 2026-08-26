-- Login de cajero por PIN, sin exponer pin_hash a anon.
-- RPC SECURITY DEFINER: valida el PIN contra pin_hash (pgcrypto crypt) y
-- devuelve el empleado si está activo. Aditivo, no rompe nada.
create or replace function fn_login_cajero(p_pin text)
returns table(id uuid, nombre text, rol text, sucursal_id uuid)
language sql
security definer
set search_path = public, extensions
as $$
  select e.id, e.nombre, r.slug, e.sucursal_id
  from empleados e
  join roles r on r.id = e.rol_id
  where e.activo
    and e.pin_hash is not null
    and e.pin_hash = crypt(p_pin, e.pin_hash)
  order by e.created_at
  limit 1;
$$;

revoke all on function fn_login_cajero(text) from public;
grant execute on function fn_login_cajero(text) to anon, authenticated;

-- Cajero inicial (PIN 1234) para poder operar; cámbialo/administra en Admin.
insert into empleados (nombre, rol_id, sucursal_id, pin_hash, activo)
select 'Cajero 1',
       (select id from roles where nombre = 'Cajero' limit 1),
       (select id from sucursales order by created_at limit 1),
       crypt('1234', gen_salt('bf')),
       true
where not exists (select 1 from empleados);