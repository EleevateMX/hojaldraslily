import type { CosteoProducto, Parametros } from '@shake/types'
import type { ShakeClient } from '../client'

/**
 * Costeo por producto calculado en la base (vw_costeo_producto).
 * Al cambiar el costo de un insumo, la vista refleja el recálculo
 * de todos los productos relacionados automáticamente.
 */
export async function listarCosteo(sb: ShakeClient): Promise<CosteoProducto[]> {
  const { data, error } = await sb.from('vw_costeo_producto').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function obtenerParametros(sb: ShakeClient): Promise<Parametros> {
  const { data, error } = await sb.from('parametros').select('*').eq('id', 'default').single()
  if (error) throw error
  return data
}

export async function actualizarParametros(
  sb: ShakeClient,
  cambios: Partial<Pick<Parametros, 'iva' | 'food_cost_meta' | 'merma_default' | 'mano_obra'>>,
): Promise<void> {
  const { error } = await sb.from('parametros').update(cambios).eq('id', 'default')
  if (error) throw error
}
