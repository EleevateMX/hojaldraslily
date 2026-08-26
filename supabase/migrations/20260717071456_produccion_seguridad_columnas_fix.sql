revoke select on empleados from anon, authenticated;
grant select (id, nombre, rol_id, sucursal_id, auth_user_id, activo, created_at)
  on empleados to anon, authenticated;

revoke update on ordenes from anon, authenticated;
grant update (estado) on ordenes to anon, authenticated;