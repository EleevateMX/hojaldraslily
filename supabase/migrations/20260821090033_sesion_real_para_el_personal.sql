-- El personal deja de ser "anon": PIN que da una sesion de verdad.
-- Ver supabase/migrations/sesion_real_para_el_personal.sql para el detalle.
-- Todo aqui es ADITIVO: no revoca ni un permiso.
create or replace function public.fn_empleado_actual()
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1
$$;

create or replace function public.fn_es_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_empleado_actual() is not null
$$;

create or replace function public.fn_rol_staff()
returns text language sql stable security definer set search_path = public as $$
  select r.slug from empleados e join roles r on r.id = e.rol_id
  where e.auth_user_id = auth.uid() and e.activo limit 1
$$;

create or replace function public.fn_es_jefe()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(fn_rol_staff() in ('administrador', 'gerente'), false)
$$;

revoke all on function public.fn_empleado_actual() from public;
revoke all on function public.fn_es_staff() from public;
revoke all on function public.fn_rol_staff() from public;
revoke all on function public.fn_es_jefe() from public;
grant execute on function public.fn_empleado_actual() to anon, authenticated, service_role;
grant execute on function public.fn_es_staff() to anon, authenticated, service_role;
grant execute on function public.fn_rol_staff() to anon, authenticated, service_role;
grant execute on function public.fn_es_jefe() to anon, authenticated, service_role;

create table if not exists public.intentos_pin (
  id bigserial primary key,
  origen text not null,
  exito boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_intentos_pin_origen on public.intentos_pin (origen, created_at desc);
alter table public.intentos_pin enable row level security;

create or replace function public.fn_pin_fallos_recientes(p_origen text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from intentos_pin
  where origen = p_origen and not exito and created_at > now() - interval '15 minutes'
$$;

create or replace function public.fn_pin_registrar_intento(p_origen text, p_exito boolean)
returns void language sql security definer set search_path = public as $$
  insert into intentos_pin (origen, exito) values (p_origen, coalesce(p_exito, false));
$$;

revoke all on function public.fn_pin_fallos_recientes(text) from public;
revoke all on function public.fn_pin_registrar_intento(text, boolean) from public;
grant execute on function public.fn_pin_fallos_recientes(text) to service_role;
grant execute on function public.fn_pin_registrar_intento(text, boolean) to service_role;

create or replace function public.fn_staff_por_pin(p_pin text)
returns table (empleado_id uuid, nombre text, rol text, sucursal_id uuid, correo text, auth_user_id uuid)
language sql stable security definer set search_path = public, extensions as $$
  select e.id, e.nombre, r.slug, e.sucursal_id,
         'emp-' || e.id::text || '@staff.hojaldraslily.com',
         e.auth_user_id
  from empleados e join roles r on r.id = e.rol_id
  where e.activo and e.pin_hash is not null and e.pin_hash = crypt(p_pin, e.pin_hash)
  order by e.created_at limit 1
$$;

create or replace function public.fn_staff_vincular_auth(p_empleado_id uuid, p_auth_user_id uuid)
returns void language sql security definer set search_path = public as $$
  update empleados set auth_user_id = p_auth_user_id where id = p_empleado_id;
$$;

revoke all on function public.fn_staff_por_pin(text) from public;
revoke all on function public.fn_staff_vincular_auth(uuid, uuid) from public;
grant execute on function public.fn_staff_por_pin(text) to service_role;
grant execute on function public.fn_staff_vincular_auth(uuid, uuid) to service_role;