import { usePosStore, type LineaCarrito, type EncargoEnCarrito, type DescuentoManual } from '../store/posStore'
import type { CanalDeVenta } from '@lily/supabase'

/**
 * El ticket a medias sobrevive a una recarga.
 *
 * Es la otra mitad de `sesion.ts`: recuperar al cajero sirve de poco si la
 * tableta vuelve con el ticket vacío y hay que volver a tocar las seis cosas
 * que el cliente ya dijo. Se guarda lo que la pantalla necesita para pintar
 * —las líneas, el encargo que se está entregando, el descuento y el canal—;
 * el precio lo sigue poniendo el servidor al cobrar.
 *
 * Caduca a las dos horas: un ticket de anoche que reaparece en la mañana es
 * una venta fantasma esperando a que alguien le dé «Cobrar» sin mirar.
 */
const CLAVE = 'lily_pos_ticket_en_curso'
const CADUCA_MS = 2 * 60 * 60 * 1000

interface TicketGuardado {
  en: number
  items: LineaCarrito[]
  encargo: EncargoEnCarrito | null
  descuentoManual: DescuentoManual | null
  canal: CanalDeVenta
}

export function recuperarTicketEnCurso(ahora = Date.now()): boolean {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return false
    const t = JSON.parse(crudo) as TicketGuardado
    if (!t || !Array.isArray(t.items) || ahora - t.en > CADUCA_MS) {
      localStorage.removeItem(CLAVE)
      return false
    }
    if (t.items.length === 0 && !t.encargo) return false
    usePosStore.setState({
      items: t.items,
      encargo: t.encargo ?? null,
      descuentoManual: t.descuentoManual ?? null,
      canal: t.canal ?? 'pos',
    })
    return true
  } catch {
    return false
  }
}

/** Se arranca una vez; guarda en cada cambio y borra cuando el ticket queda vacío. */
export function guardarTicketEnCurso(): () => void {
  return usePosStore.subscribe((s, antes) => {
    if (
      s.items === antes.items &&
      s.encargo === antes.encargo &&
      s.descuentoManual === antes.descuentoManual &&
      s.canal === antes.canal
    ) return
    try {
      if (s.items.length === 0 && !s.encargo) {
        localStorage.removeItem(CLAVE)
        return
      }
      const t: TicketGuardado = {
        en: Date.now(), items: s.items, encargo: s.encargo, descuentoManual: s.descuentoManual, canal: s.canal,
      }
      localStorage.setItem(CLAVE, JSON.stringify(t))
    } catch {
      // Sin espacio o sin localStorage: la venta sigue, solo no se recuerda.
    }
  })
}
