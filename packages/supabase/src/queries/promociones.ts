import type { Promocion } from '@shake/types'
import type { ShakeClient } from '../client'

export type PromocionInsert = Omit<Promocion, 'id' | 'created_at'>

/** Promos que aplican a un cliente AHORA (segmentación + vigencia + throttle 15 días). */
export async function promosParaCliente(sb: ShakeClient, clienteId: string): Promise<Promocion[]> {
  const { data, error } = await sb.rpc('fn_promos_cliente', { p_cliente: clienteId })
  if (error) throw error
  return (data ?? []) as Promocion[]
}

/**
 * Calcula el descuento de una promo sobre el ticket.
 * - descuento_pct: valor (0-1) × subtotal
 * - descuento_monto: valor fijo (tope al subtotal)
 * - producto_gratis: precio del ítem elegible más caro (categoría opcional)
 */
export function descuentoPromo(
  promo: Promocion,
  items: { precio: number; categoria?: string | null }[],
): number {
  const subtotal = items.reduce((s, i) => s + i.precio, 0)
  if (promo.tipo === 'descuento_pct') return Math.round(subtotal * promo.valor * 100) / 100
  if (promo.tipo === 'descuento_monto') return Math.min(promo.valor, subtotal)
  // producto_gratis
  const eleg = promo.categoria_gratis
    ? items.filter((i) => i.categoria === promo.categoria_gratis)
    : items
  return eleg.length ? Math.max(...eleg.map((i) => i.precio)) : 0
}

/** Registra que una promo se aplicó a un cliente (throttle + reporte). */
export async function registrarAplicacionPromo(
  sb: ShakeClient,
  promocionId: string,
  clienteId: string,
  ordenId?: string,
): Promise<void> {
  const { error } = await sb
    .from('promocion_aplicaciones')
    .insert({ promocion_id: promocionId, cliente_id: clienteId, orden_id: ordenId ?? null })
  if (error) throw error
}

// ------------------------- admin CRUD -------------------------
export async function listarPromociones(sb: ShakeClient): Promise<Promocion[]> {
  const { data, error } = await sb.from('promociones').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function crearPromocion(sb: ShakeClient, p: PromocionInsert): Promise<Promocion> {
  const { data, error } = await sb.from('promociones').insert(p).select().single()
  if (error) throw error
  return data
}

export async function actualizarPromocion(
  sb: ShakeClient,
  id: string,
  cambios: Partial<PromocionInsert>,
): Promise<Promocion> {
  const { data, error } = await sb.from('promociones').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}
