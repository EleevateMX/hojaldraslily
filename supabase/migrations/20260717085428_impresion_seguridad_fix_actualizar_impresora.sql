-- Corrección inmediata: fn_actualizar_impresora usaba coalesce(p_x, x) para
-- TODOS los campos, incluyendo ip/nombre_dispositivo/cocina_id — que sí
-- necesitan poder pasar a NULL de verdad (ej. Admin cambia una impresora de
-- "red" a "usb" y el formulario manda ip=null intencionalmente). Con
-- coalesce, ese NULL se interpretaba como "no tocar" y el ip viejo se
-- quedaba pegado. Se separa en dos funciones con semántica clara:
--   - fn_actualizar_impresora: SIEMPRE sobrescribe con lo que mande el
--     formulario completo (como ya hacía guardar() en Impresoras.tsx).
--   - fn_activar_impresora: toggle de un solo campo (activa), para el botón
--     Activar/Desactivar que sí es una actualización parcial real.

drop function if exists fn_actualizar_impresora(uuid, text, uuid, tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean, boolean);

create or replace function fn_actualizar_impresora(
  p_id uuid, p_nombre text, p_cocina_id uuid,
  p_tipo_conexion tipo_conexion_impresora, p_ip text, p_puerto integer,
  p_nombre_dispositivo text, p_ancho_papel ancho_papel, p_copias integer,
  p_corte_automatico boolean, p_buzzer boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update impresoras set
    nombre = p_nombre,
    cocina_id = p_cocina_id,
    tipo_conexion = p_tipo_conexion,
    ip = p_ip,
    puerto = p_puerto,
    nombre_dispositivo = p_nombre_dispositivo,
    ancho_papel = p_ancho_papel,
    copias = p_copias,
    corte_automatico = p_corte_automatico,
    buzzer = p_buzzer
  where id = p_id;
$$;

create or replace function fn_activar_impresora(p_id uuid, p_activa boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update impresoras set activa = p_activa where id = p_id;
$$;

grant execute on function fn_actualizar_impresora(uuid, text, uuid, tipo_conexion_impresora, text, integer, text, ancho_papel, integer, boolean, boolean) to anon, authenticated;
grant execute on function fn_activar_impresora(uuid, boolean) to anon, authenticated;
