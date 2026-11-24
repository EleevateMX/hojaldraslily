import type { VentaDiaria, ProductoVendido, Orden } from '@lily/types'
import type { ClienteLily } from '../client'

/** Ventas por día (vw_ventas_diarias), últimos N días. */
export async function ventasDiarias(
  sb: ClienteLily,
  diasAtras = 30,
  sucursalId?: string,
): Promise<VentaDiaria[]> {
  const desde = new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10)
  let q = sb.from('vw_ventas_diarias').select('*').gte('dia', desde).order('dia', { ascending: true })
  if (sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function productosMasVendidos(
  sb: ClienteLily,
  limite = 10,
): Promise<ProductoVendido[]> {
  const { data, error } = await sb.from('vw_productos_mas_vendidos').select('*').limit(limite)
  if (error) throw error
  return data
}

/** Órdenes pagadas recientes de una sucursal (para dashboard/admin). */
export async function ordenesRecientes(
  sb: ClienteLily,
  sucursalId: string,
  horas = 8,
): Promise<Orden[]> {
  const desde = new Date(Date.now() - horas * 3600000).toISOString()
  const { data, error } = await sb
    .from('ordenes')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('pagado', true)
    .neq('estado', 'cancelada')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

/**
 * Reporte gerencial con datos reales (una sola RPC arma todo el JSON). Las
 * fechas van como 'YYYY-MM-DD' en hora de Mérida. Devuelve el objeto tal cual
 * lo pinta Admin → Reporte gerencial (el tipo vive en la app).
 */
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export async function reporteGerencial(
  sb: ClienteLily,
  desde: string,
  hasta: string,
): Promise<unknown> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)('fn_reporte_gerencial', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return data
}

/**
 * Un cambio (cancelación o modificación) de una venta, para el registro de
 * Admin. El histórico que la caja solo enseñaba del turno abierto.
 */
export interface CambioRegistrado {
  tipo: 'cancelada' | 'modificada'
  cuando: string
  folio: number
  total: number
  metodo_pago: string | null
  canal: string
  motivo: string | null
  autorizo: string | null
  created_at: string
}

/**
 * El registro de cancelaciones y modificaciones por rango de fechas (gerencia).
 * El día del evento se decide en Mérida, igual que el inventario y el corte.
 */
export async function registroCambios(
  sb: ClienteLily,
  desde: string,
  hasta: string,
): Promise<CambioRegistrado[]> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)('fn_registro_cambios', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return (data as CambioRegistrado[] | null) ?? []
}
