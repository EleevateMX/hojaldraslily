-- RPC de autodiagnóstico para el agente local (agente-impresion/src/diagnose.ts,
-- comando P8 pedido explícitamente: "no marcar impresión como validada solo
-- porque el agente compila"). Un token solo puede ver SU PROPIA fila —
-- mismo principio de aislamiento por sucursal que ya protege el reclamo de
-- trabajos (ver docs/pruebas-seguridad.md §2.4).
create or replace function fn_diagnostico_impresora(p_token uuid)
returns table (
  id uuid, sucursal_id uuid, sucursal_nombre text, nombre text,
  cocina_id uuid, cocina_nombre text, tipo_conexion tipo_conexion_impresora,
  ip text, puerto integer, nombre_dispositivo text, ancho_papel ancho_papel,
  copias integer, corte_automatico boolean, buzzer boolean, activa boolean,
  ultima_conexion timestamptz, ultima_impresion timestamptz
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.sucursal_id, s.nombre, i.nombre, i.cocina_id, c.nombre,
         i.tipo_conexion, i.ip, i.puerto, i.nombre_dispositivo, i.ancho_papel,
         i.copias, i.corte_automatico, i.buzzer, i.activa,
         i.ultima_conexion, i.ultima_impresion
  from impresoras i
  left join sucursales s on s.id = i.sucursal_id
  left join cocinas c on c.id = i.cocina_id
  where i.agente_token = p_token;
$$;

grant execute on function fn_diagnostico_impresora(uuid) to anon, authenticated;
