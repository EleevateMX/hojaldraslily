import type { Impresora, TrabajoImpresion, Cocina, TipoConexionImpresora, AnchoPapel } from '@shake/types'
import type { ShakeClient } from '../client'

// El generador de tipos de Supabase no distingue "parámetro nullable" de
// "parámetro requerido" en los Args de RPC — para fn_crear_impresora/
// fn_actualizar_impresora (que sí aceptan null real en ip/cocina_id/
// nombre_dispositivo/puerto) se llama vía este cast, mismo patrón que
// empleados.ts/ordenes.ts/pagos.ts.
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Impresora sin `agente_token` — esa columna ya no es legible ni escribible
 * directo por anon/authenticated (ver pagos_maquina_estados_p9 y
 * impresion_seguridad_tokens_agente: el token es el único secreto que
 * prueba la identidad de una impresora física ante
 * fn_imprimir_reclamar_trabajos/confirmar/fallar/latido, así que nunca debe
 * viajar salvo el instante de creación o rotación explícita).
 */
export type ImpresoraAdmin = Omit<Impresora, 'agente_token'> & { conectada: boolean }

export interface ImpresoraInsertDatos {
  sucursal_id: string
  nombre: string
  cocina_id: string | null
  tipo_conexion: TipoConexionImpresora
  ip: string | null
  puerto: number | null
  nombre_dispositivo: string | null
  ancho_papel: AnchoPapel
  copias: number
  corte_automatico: boolean
  buzzer: boolean
}
export type ImpresoraUpdateDatos = Omit<ImpresoraInsertDatos, 'sucursal_id'>

/** Impresoras configuradas (todas — Admin decide cuáles mostrar activas/inactivas). Nunca incluye el token. */
export async function listarImpresoras(sb: ShakeClient): Promise<ImpresoraAdmin[]> {
  return (await rpc<ImpresoraAdmin[] | null>(sb, 'fn_admin_impresoras', {})) ?? []
}

/** Crea la impresora y devuelve su token UNA vez — cópialo a printers.config.json del agente local. */
export async function crearImpresora(sb: ShakeClient, datos: ImpresoraInsertDatos): Promise<{ id: string; agente_token: string }> {
  const filas = await rpc<{ id: string; agente_token: string }[]>(sb, 'fn_crear_impresora', {
    p_sucursal_id: datos.sucursal_id,
    p_nombre: datos.nombre,
    p_cocina_id: datos.cocina_id,
    p_tipo_conexion: datos.tipo_conexion,
    p_ip: datos.ip,
    p_puerto: datos.puerto,
    p_nombre_dispositivo: datos.nombre_dispositivo,
    p_ancho_papel: datos.ancho_papel,
    p_copias: datos.copias,
    p_corte_automatico: datos.corte_automatico,
    p_buzzer: datos.buzzer,
  })
  return filas[0]
}

/** Sobrescribe TODOS los campos del formulario (nunca parcial — usa activarImpresora() para el toggle). */
export async function actualizarImpresora(
  sb: ShakeClient,
  id: string,
  cambios: ImpresoraUpdateDatos,
): Promise<void> {
  await rpc(sb, 'fn_actualizar_impresora', {
    p_id: id,
    p_nombre: cambios.nombre,
    p_cocina_id: cambios.cocina_id,
    p_tipo_conexion: cambios.tipo_conexion,
    p_ip: cambios.ip,
    p_puerto: cambios.puerto,
    p_nombre_dispositivo: cambios.nombre_dispositivo,
    p_ancho_papel: cambios.ancho_papel,
    p_copias: cambios.copias,
    p_corte_automatico: cambios.corte_automatico,
    p_buzzer: cambios.buzzer,
  })
}

/** Activa/desactiva una impresora sin tocar el resto de su configuración. */
export async function activarImpresora(sb: ShakeClient, id: string, activa: boolean): Promise<void> {
  await rpc(sb, 'fn_activar_impresora', { p_id: id, p_activa: activa })
}

/** Rota el token de una impresora (sospecha de compromiso, o se perdió printers.config.json). Devuelve el nuevo token UNA vez. */
export async function rotarTokenImpresora(sb: ShakeClient, id: string): Promise<string> {
  return rpc<string>(sb, 'fn_rotar_token_impresora', { p_id: id })
}

/** Estaciones disponibles para asignar impresora (mismo catálogo que Cocina/Barra). */
export async function listarCocinasParaImpresoras(sb: ShakeClient): Promise<Cocina[]> {
  const { data, error } = await sb.from('cocinas').select('*').order('nombre')
  if (error) throw error
  return data
}

/** Trabajos de impresión de UN pedido de cocina (para el indicador en KDS). */
export async function trabajosDePedido(sb: ShakeClient, pedidoId: string): Promise<TrabajoImpresion[]> {
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at')
  if (error) throw error
  return data
}

/**
 * Trabajos de impresión de varios pedidos a la vez (para pintar el
 * indicador de estado en toda la grilla del KDS sin hacer N consultas).
 */
export async function trabajosDeVariosPedidos(
  sb: ShakeClient,
  pedidoIds: string[],
): Promise<Record<string, TrabajoImpresion>> {
  if (pedidoIds.length === 0) return {}
  const { data, error } = await sb
    .from('trabajos_impresion')
    .select('*')
    .in('pedido_id', pedidoIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  // El primero por pedido (created_at desc) es el más reciente — refleja
  // reimpresiones si las hubo.
  const porPedido: Record<string, TrabajoImpresion> = {}
  for (const t of data) {
    if (t.pedido_id && !porPedido[t.pedido_id]) porPedido[t.pedido_id] = t
  }
  return porPedido
}

export interface FiltroTrabajosImpresion {
  estado?: TrabajoImpresion['estado'][]
  printerId?: string
  limite?: number
}

/** Cola de impresión completa (Admin), con filtros opcionales. */
export async function listarTrabajosImpresion(
  sb: ShakeClient,
  filtro: FiltroTrabajosImpresion = {},
): Promise<TrabajoImpresion[]> {
  let query = sb.from('trabajos_impresion').select('*').order('created_at', { ascending: false })
  if (filtro.estado && filtro.estado.length > 0) query = query.in('estado', filtro.estado)
  if (filtro.printerId) query = query.eq('printer_id', filtro.printerId)
  query = query.limit(filtro.limite ?? 100)
  const { data, error } = await query
  if (error) throw error
  return data
}

/** Reimprime un trabajo (crea una copia auditada, no reencola el original). */
export async function reimprimirTrabajo(
  sb: ShakeClient,
  trabajoId: string,
  opts: { empleadoId?: string; motivo?: string; printerId?: string } = {},
): Promise<TrabajoImpresion> {
  const { data, error } = await sb.rpc('fn_imprimir_reimprimir', {
    p_trabajo_id: trabajoId,
    p_empleado_id: opts.empleadoId,
    p_motivo: opts.motivo,
    p_printer_id: opts.printerId,
  })
  if (error) throw error
  return data
}

/** Suscripción realtime a la cola de impresión (para Admin/KDS). Devuelve el "desuscribirse". */
export function suscribirTrabajosImpresion(sb: ShakeClient, onCambio: () => void): () => void {
  // Misma resiliencia que suscribirPedidosCocina: si el canal muere en
  // silencio, se vuelve a suscribir solo en vez de dejar el indicador de
  // impresión congelado.
  let canal: ReturnType<ShakeClient['channel']> | null = null
  let apagado = false
  let reintento: ReturnType<typeof setTimeout> | null = null

  const conectar = () => {
    if (apagado) return
    canal = sb
      .channel('trabajos-impresion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos_impresion' }, onCambio)
      .subscribe((estado) => {
        if (apagado) return
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          if (canal) void sb.removeChannel(canal)
          canal = null
          if (reintento) clearTimeout(reintento)
          reintento = setTimeout(conectar, 5000)
        }
      })
  }
  conectar()

  return () => {
    apagado = true
    if (reintento) clearTimeout(reintento)
    if (canal) void sb.removeChannel(canal)
  }
}
