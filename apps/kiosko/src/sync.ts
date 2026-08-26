// BroadcastChannel bridge: Kiosk → Cliente Display & KDS screens
// Works across browser tabs on the same origin (no server needed)

const DISPLAY_CH = 'hojaldraslily-display'
const KDS_CH     = 'hojaldraslily-kds'

function post(channel: string, data: unknown) {
  try {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(channel)
    ch.postMessage(data)
    ch.close()
  } catch { /* no-op in non-browser environments */ }
}

// ── Cliente Display events ─────────────────────────────────────────────────

export function displayItemAdded(item: {
  id: string; nombre: string; cantidad: number; precio: number
}, total: number, totalItems: number) {
  post(DISPLAY_CH, { type: 'item-added', item, total, totalItems })
}

export function displayItemRemoved(id: string, total: number, totalItems: number) {
  post(DISPLAY_CH, { type: 'item-removed', id, total, totalItems })
}

export function displayCartCleared() {
  post(DISPLAY_CH, { type: 'cart-cleared' })
}

export function displayOrderPaid(folio: string) {
  post(DISPLAY_CH, { type: 'order-paid', folio })
}

// ── KDS events ─────────────────────────────────────────────────────────────

export interface KdsItem {
  id: string
  nombre: string
  cantidad: number
  personalizacion?: string
}

export function kdsNewOrder(orden: {
  id: string
  folio: string
  canal: string
  created_at: string
  items: KdsItem[]
}) {
  post(KDS_CH, { type: 'new-order', orden })
}

export function subscribeKds(handler: (orden: {
  id: string; folio: string; canal: string; created_at: string; items: KdsItem[]
}) => void): () => void {
  try {
    if (typeof BroadcastChannel === 'undefined') return () => {}
    const ch = new BroadcastChannel(KDS_CH)
    ch.onmessage = (m) => {
      if (m.data?.type === 'new-order') handler(m.data.orden)
    }
    return () => { try { ch.close() } catch { /* el canal ya pudo haberse cerrado; no hay nada que hacer */ } }
  } catch {
    return () => {}
  }
}
