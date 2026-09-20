export * from './types'
export { ClipPaymentProvider } from './clipProvider'
export { MockPaymentProvider } from './mockProvider'

import type { ClienteLily } from '@lily/supabase'
import type { ModoPagoKiosko } from '@lily/types'
import type { PaymentProvider } from './types'
import { ClipPaymentProvider } from './clipProvider'
import { MockPaymentProvider } from './mockProvider'

/**
 * Única puerta de entrada que debe usar la UI del kiosko para obtener un
 * proveedor de pagos — nunca instancian `ClipPaymentProvider`/
 * `MockPaymentProvider` directamente. `modo='pagar_en_caja'` no necesita
 * proveedor (no se llama esta función en ese caso).
 */
export function obtenerPaymentProvider(modo: ModoPagoKiosko, sb: ClienteLily): PaymentProvider {
  if (modo === 'demo') {
    // MockPaymentProvider ya se bloquea solo en build de producción
    // (ver mockProvider.ts) — este chequeo es una segunda capa, no la única.
    return new MockPaymentProvider()
  }
  return new ClipPaymentProvider(sb)
}
