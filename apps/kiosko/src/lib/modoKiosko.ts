import { obtenerConfiguracionKiosko } from '@shake/supabase'
import type { ShakeClient } from '@shake/supabase'
import type { ModoPagoKiosko } from '@shake/types'

/**
 * Resuelve el modo de pago efectivo del kiosko para esta sucursal.
 *
 * Fuente de verdad: `configuracion_kiosko` (Admin la edita). Si no hay
 * fila todavía, usa `VITE_KIOSKO_MODO_PAGO_DEFAULT` del .env como
 * arranque seguro (nunca "demo" por defecto — ver más abajo).
 *
 * Bloqueo de producción, en el CÓDIGO (no solo en la base): si este
 * build es de producción (`import.meta.env.PROD`, que Vite marca `true`
 * en cualquier `vite build`, incluido el deploy de Cloudflare Pages) y
 * el modo configurado es 'demo', se IGNORA esa configuración y se usa
 * 'pagar_en_caja' — el kiosko real nunca entra a modo demostración,
 * pase lo que pase en la base de datos.
 */
export async function resolverModoKiosko(sb: ShakeClient, sucursalId: string): Promise<ModoPagoKiosko> {
  const config = await obtenerConfiguracionKiosko(sb, sucursalId)
  const modoDefault = (import.meta.env.VITE_KIOSKO_MODO_PAGO_DEFAULT as ModoPagoKiosko | undefined) ?? 'pagar_en_caja'
  let modo: ModoPagoKiosko = config?.modo_pago ?? modoDefault

  if (modo === 'demo' && import.meta.env.PROD) {
    console.warn(
      '[kiosko] modo_pago="demo" configurado pero este es un build de producción — ' +
        'se ignora y se usa "pagar_en_caja". Revisa configuracion_kiosko en Admin.',
    )
    modo = 'pagar_en_caja'
  }

  return modo
}

export function esModoDemo(modo: ModoPagoKiosko): boolean {
  return modo === 'demo'
}
