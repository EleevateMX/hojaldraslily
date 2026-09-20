import type { ClienteLily } from '../client'

/**
 * El recibo digital que abre el QR de la pantalla de confirmación.
 *
 * Vivía dentro del módulo de lealtad, y con él se iba a ir cuando se quitó
 * Rewards. No tiene nada que ver con lealtad: es el ticket de una venta,
 * que en una panadería sirve igual —el cliente se lo lleva en el teléfono y
 * lo reenvía por WhatsApp sin cargar un papel que se moja.
 *
 * El uuid de la orden es la llave, y solo existen recibos de órdenes
 * **pagadas**: una orden a medias no tiene nada que enseñar.
 */

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que
// ordenes.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ClienteLily, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface ReciboItem {
  producto: string
  cantidad: number
  precio_unitario: number
  personalizacion: string | null
  es_extra: boolean
}

export interface ReciboPublico {
  folio: number
  fecha: string
  total: number
  metodo_pago: string | null
  nombre_cliente: string | null
  es_demo: boolean
  items: ReciboItem[] | null
}

export async function reciboPublico(
  sb: ClienteLily,
  ordenId: string,
): Promise<ReciboPublico | null> {
  return rpc<ReciboPublico | null>(sb, 'fn_recibo_publico', { p_orden_id: ordenId })
}
