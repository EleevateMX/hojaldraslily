import type { ShakeClient } from '../client'

export interface Empleado {
  id: string
  nombre: string
  rol: string
  sucursal_id: string | null
}

export interface EmpleadoAdmin extends Empleado {
  rol_id: string
  activo: boolean
  tiene_pin: boolean
}

export interface Rol {
  id: string
  slug: string
  nombre: string
}

// rpc no está en los tipos generados; se castea el nombre.
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Valida el PIN del cajero contra `empleados.pin_hash` vía el RPC
 * `fn_login_cajero` (SECURITY DEFINER; los hashes nunca salen a la app).
 */
export async function loginCajero(sb: ShakeClient, pin: string): Promise<Empleado | null> {
  const data = await rpc<Empleado[] | null>(sb, 'fn_login_cajero', { p_pin: pin })
  return data && data.length > 0 ? data[0] : null
}

/** Empleados activos (nombre + rol) para el selector del login. */
export async function listarEmpleadosActivos(sb: ShakeClient, sucursalId?: string): Promise<Empleado[]> {
  return (await rpc<Empleado[] | null>(sb, 'fn_empleados_activos', { p_sucursal: sucursalId ?? null })) ?? []
}

/** Roles disponibles (para el selector de alta/edición). */
export async function listarRoles(sb: ShakeClient): Promise<Rol[]> {
  return (await rpc<Rol[] | null>(sb, 'fn_roles', {})) ?? []
}

/** Lista de empleados para administración (incluye inactivos, sin hashes). */
export async function listarEmpleadosAdmin(sb: ShakeClient): Promise<EmpleadoAdmin[]> {
  return (await rpc<EmpleadoAdmin[] | null>(sb, 'fn_admin_empleados', {})) ?? []
}

/** Alta de empleado. `pin` opcional (si viene, se hashea en el servidor). */
export async function crearEmpleado(
  sb: ShakeClient,
  datos: { nombre: string; rol_id: string; pin?: string; sucursal_id?: string | null },
): Promise<string> {
  return rpc<string>(sb, 'fn_crear_empleado', {
    p_nombre: datos.nombre,
    p_rol_id: datos.rol_id,
    p_pin: datos.pin ?? null,
    p_sucursal: datos.sucursal_id ?? null,
  })
}

/** Edición. Campos opcionales; el PIN sólo cambia si se envía uno nuevo. */
export async function actualizarEmpleado(
  sb: ShakeClient,
  id: string,
  cambios: { nombre?: string; rol_id?: string; activo?: boolean; pin?: string },
): Promise<void> {
  await rpc<null>(sb, 'fn_actualizar_empleado', {
    p_id: id,
    p_nombre: cambios.nombre ?? null,
    p_rol_id: cambios.rol_id ?? null,
    p_activo: cambios.activo ?? null,
    p_pin: cambios.pin ?? null,
  })
}
