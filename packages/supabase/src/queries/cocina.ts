import type { PedidoCocina, CocinaItem, EstadoCocina } from '@shake/types'
import type { ShakeClient } from '../client'

export interface CocinaItemConProducto extends CocinaItem {
  productos: {
    nombre: string
    onzas: number | null
    /**
     * Se pide con `*` y `nombre_singular` va opcional a propósito: así la
     * pantalla no se cae si el código llega a producción antes que la
     * migración que crea esa columna.
     */
    categorias: { nombre: string; nombre_singular?: string | null } | null
  } | null
}

/**
 * Cómo se nombra un item en la pantalla de cocina.
 *
 * En barra se confundían de bebida: "Lemon Twist" es Hydration, "Lemon
 * Glow" es Collagen y "Lemon Lime" es Amino — con muchas en cola, el sabor
 * solo no alcanza. Cuando la categoría tiene nombre en singular se antepone
 * ("Hydration Drink - Lemon Twist"); si no lo tiene, el nombre va solo,
 * porque un shake no necesita que le digan "Shake -".
 *
 * Vive en el paquete y no en cada app: las dos pantallas de cocina son
 * copias literales una de la otra y duplicar esto garantiza que un día
 * digan cosas distintas.
 */
export function etiquetaItem(item: CocinaItemConProducto): string {
  const nombre = item.productos?.nombre
  if (!nombre) return '—'
  const familia = item.productos?.categorias?.nombre_singular?.trim()
  if (!familia) return nombre
  // Si el producto ya se llama como su familia, no se dice dos veces.
  if (nombre.toLowerCase().startsWith(familia.toLowerCase())) return nombre
  return `${familia} - ${nombre}`
}

export interface PedidoConItems extends PedidoCocina {
  cocina_items: CocinaItemConProducto[]
  ordenes: { folio: number; canal: string; nombre_cliente: string | null } | null
}

/** Pedidos activos de una estación ('alimentos' | 'bebidas'). */
export async function listarPedidosCocina(
  sb: ShakeClient,
  cocinaSlug: string,
): Promise<PedidoConItems[]> {
  const { data: cocina, error: cocinaError } = await sb
    .from('cocinas')
    .select('id')
    .eq('slug', cocinaSlug)
    .single()
  if (cocinaError) throw cocinaError

  const { data, error } = await sb
    .from('pedidos_cocina')
    .select('*, cocina_items(*, productos(nombre, onzas, categorias(*))), ordenes(folio, canal, nombre_cliente)')
    .eq('cocina_id', cocina.id)
    .in('estado', ['pendiente', 'en_preparacion', 'listo'])
    .order('created_at')
  if (error) throw error
  return data as PedidoConItems[]
}

/** Pedidos activos de TODAS las estaciones (cliente-display). */
export async function listarPedidosActivos(sb: ShakeClient): Promise<PedidoConItems[]> {
  const { data, error } = await sb
    .from('pedidos_cocina')
    .select('*, cocina_items(*, productos(nombre, onzas, categorias(*))), ordenes(folio, canal, nombre_cliente)')
    .in('estado', ['pendiente', 'en_preparacion', 'listo'])
    .order('created_at')
  if (error) throw error
  return data as PedidoConItems[]
}

export async function cambiarEstadoPedido(
  sb: ShakeClient,
  pedidoId: string,
  estado: EstadoCocina,
): Promise<void> {
  const { error } = await sb.from('pedidos_cocina').update({ estado }).eq('id', pedidoId)
  if (error) throw error
}

/**
 * Suscripción realtime a los pedidos de una estación.
 * Devuelve la función para desuscribirse.
 */
export function suscribirPedidosCocina(
  sb: ShakeClient,
  onCambio: () => void,
): () => void {
  // El canal en vivo puede morir en silencio (la red parpadea, el socket
  // caduca) y el navegador no avisa a nadie. Si pasa, aquí se vuelve a
  // suscribir solo: una pantalla de cocina congelada es una comanda que
  // nadie prepara mientras el cliente espera en barra.
  let canal: ReturnType<ShakeClient['channel']> | null = null
  let apagado = false
  let reintento: ReturnType<typeof setTimeout> | null = null

  const conectar = () => {
    if (apagado) return
    canal = sb
      .channel('pedidos-cocina')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_cocina' }, onCambio)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cocina_items' }, onCambio)
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
