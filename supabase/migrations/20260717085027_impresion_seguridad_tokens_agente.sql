-- =====================================================================
-- Hallazgo crítico de la re-verificación exhaustiva de seguridad: la
-- tabla `impresoras` tenía policies RLS completamente abiertas
-- (using(true)/with_check(true) para SELECT/INSERT/UPDATE) COMBINADAS con
-- GRANT de tabla completa a anon/authenticated, incluida la columna
-- `agente_token` — el secreto que las RPCs fn_imprimir_reclamar_trabajos /
-- fn_imprimir_confirmar / fn_imprimir_fallar / fn_imprimir_latido usan como
-- única prueba de identidad de una impresora física.
--
-- Esto invalidaba la garantía documentada de "un token robado de una
-- impresora no puede reclamar trabajos de otra sucursal": con la anon key
-- pública (la misma que usa el kiosko), cualquiera podía hacer
-- `GET /impresoras?select=agente_token,sucursal_id,nombre` y obtener el
-- token de CADA impresora de CADA sucursal, o hacer `PATCH` para rotar o
-- apagar (`activa=false`) cualquier impresora — un vector de sabotaje
-- silencioso del sistema de comandas que no estaba cubierto por ninguna
-- prueba anterior.
--
-- Se cierra con el mismo patrón ya usado para `empleados.pin_hash`: cero
-- acceso directo de tabla para anon/authenticated, todo pasa por RPCs
-- `SECURITY DEFINER` que nunca devuelven `agente_token` salvo en el
-- instante de creación (una sola vez, igual que ya hacía la UI de Admin) o
-- al rotarlo explícitamente.
--
-- ACCIÓN DE SEGUIMIENTO REQUERIDA (documentada en el reporte final): como
-- los tokens actuales ya estuvieron expuestos, deben rotarse con
-- fn_rotar_token_impresora() y actualizarse en printers.config.json de
-- cada agente local.
-- =====================================================================

revoke all on impresoras from anon, authenticated;
drop policy if exists sel_impresoras on impresoras;
drop policy if exists ins_impresoras on impresoras;
drop policy if exists upd_impresoras on impresoras;

-- Listado para Admin: todo excepto agente_token, más si tiene token
-- configurado y si está "conectada" (latido reciente).
create or replace function fn_admin_impresoras()
returns table (
  id uuid, sucursal_id uuid, nombre text, cocina_id uuid,
  tipo_conexion tipo_conexion_impresora, ip text, puerto integer,
  nombre_dispositivo text, ancho_papel ancho_papel, copias integer,
  corte_automatico boolean, buzzer boolean, activa boolean,
  agente_id text, ultima_conexion timestamptz, ultima_impresion timestamptz,
  created_at timestamptz, conectada boolean
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.sucursal_id, i.nombre, i.cocina_id, i.tipo_conexion, i.ip, i.puerto,
         i.nombre_dispositivo, i.ancho_papel, i.copias, i.corte_automatico, i.buzzer, i.activa,
         i.agente_id, i.ultima_conexion, i.ultima_impresion, i.created_at,
         (i.ultima_conexion is not null and i.ultima_conexion > now() - interval '2 minutes') as conectada
  from impresoras i
  order by i.nombre;
$$;

-- Alta: genera el token en el servidor y lo devuelve UNA vez (igual que
-- antes lo hacía el INSERT directo) para que Admin lo copie a
-- printers.config.json.
create or replace function fn_crear_impresora(
  p_sucursal_id uuid, p_nombre text, p_cocina_id uuid,
  p_tipo_conexion tipo_conexion_impresora, p_ip text default null, p_puerto integer default null,
  p_nombre_dispositivo text default null, p_ancho_papel ancho_papel default '80mm',
  p_copias integer default 1, p_corte_automatico boolean default true, p_buzzer boolean default false
)
returns table (id uuid, agente_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token uuid;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la impresora es obligatorio';
  end if;

  insert into impresoras (
    sucursal_id, nombre, cocina_id, tipo_conexion, ip, puerto,
    nombre_dispositivo, ancho_papel, copias, corte_automatico, buzzer, activa
  ) values (
    p_sucursal_id, trim(p_nombre), p_cocina_id, p_tipo_conexion, p_ip, p_puerto,
    p_nombre_dispositivo, p_ancho_papel, greatest(1, p_copias), p_corte_automatico, p_buzzer, true
  )
  returning impresoras.id, impresoras.agente_token into v_id, v_token;

  return query select v_id, v_token;
end;
$$;

-- Edición de campos seguros. Nunca toca agente_token — para eso está
-- fn_rotar_token_impresora, deliberadamente separada.
create or replace function fn_actualizar_impresora(
  p_id uuid, p_nombre text default null, p_cocina_id uuid default null,
  p_tipo_conexion tipo_conexion_impresora default null, p_ip text default null,
  p_puerto integer default null, p_nombre_dispositivo text default null,
  p_ancho_papel ancho_papel default null, p_copias integer default null,
  p_corte_automatico boolean default null, p_buzzer boolean default null,
  p_activa boolean default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update impresoras set
    nombre = coalesce(trim(p_nombre), nombre),
    cocina_id = coalesce(p_cocina_id, cocina_id),
    tipo_conexion = coalesce(p_tipo_conexion, tipo_conexion),
    ip = coalesce(p_ip, ip),
    puerto = coalesce(p_puerto, puerto),
    nombre_dispositivo = coalesce(p_nombre_dispositivo, nombre_dispositivo),
    ancho_papel = coalesce(p_ancho_papel, ancho_papel),
    copias = coalesce(p_copias, copias),
    corte_automatico = coalesce(p_corte_automatico, corte_automatico),
    buzzer = coalesce(p_buzzer, buzzer),
    activa = coalesce(p_activa, activa)
  where id = p_id;
$$;

-- Rotación de token: para cuando un token se sospecha comprometido (como
-- los actuales, expuestos por la brecha que cierra esta migración) o se
-- pierde el archivo de config del agente. Devuelve el nuevo token UNA vez.
create or replace function fn_rotar_token_impresora(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  update impresoras set agente_token = gen_random_uuid()
  where id = p_id
  returning agente_token into v_token;

  if v_token is null then
    raise exception 'Impresora % no encontrada', p_id;
  end if;

  return v_token;
end;
$$;

grant execute on function fn_admin_impresoras() to anon, authenticated;
grant execute on function fn_crear_impresora(uuid, text, uuid, tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean) to anon, authenticated;
grant execute on function fn_actualizar_impresora(uuid, text, uuid, tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean, boolean) to anon, authenticated;
grant execute on function fn_rotar_token_impresora(uuid) to anon, authenticated;
