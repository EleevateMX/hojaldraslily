import type { VentaDiaria, ProductoVendido, Orden } from '@shake/types'
import type { ShakeClient } from '../client'

/** Ventas por día (vw_ventas_diarias), últimos N días. */
export async function ventasDiarias(
  sb: ShakeClient,
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
  sb: ShakeClient,
  limite = 10,
): Promise<ProductoVendido[]> {
  const { data, error } = await sb.from('vw_productos_mas_vendidos').select('*').limit(limite)
  if (error) throw error
  return data
}

/** Órdenes pagadas recientes de una sucursal (para dashboard/admin). */
export async function ordenesRecientes(
  sb: ShakeClient,
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
