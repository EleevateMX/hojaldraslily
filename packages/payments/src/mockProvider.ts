import type { EstadoTransaccionPago } from '@shake/types'
import type {
  PaymentProvider,
  CrearPagoParams,
  CrearPagoResultado,
  EstadoPagoResultado,
  WebhookEvento,
} from './types'

/**
 * Proveedor simulado — SOLO para modo demo/desarrollo/pruebas. Aprueba
 * pagos al instante sin tocar ningún proveedor real.
 *
 * Bloqueo en producción: el constructor revisa `import.meta.env.PROD`
 * (Vite lo marca `true` en cualquier `vite build`, incluidos los
 * despliegues de Cloudflare Pages) y lanza si es true. No hay forma de
 * instanciar este proveedor desde un bundle de producción — el error
 * ocurre en tiempo de ejecución, no solo "por convención".
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly nombre = 'mock'
  private contador = 0

  constructor() {
    const esProduccion =
      typeof import.meta !== 'undefined' &&
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.PROD === true
    if (esProduccion) {
      throw new Error(
        'MockPaymentProvider no puede usarse en un build de producción. ' +
          'Esto es un bloqueo de código, no una advertencia — revisa por qué se está ' +
          'instanciando aquí; el modo demo del kiosko debe usar ClipPaymentProvider o ' +
          'estar deshabilitado (ver docs/modo-pagar-en-caja.md).',
      )
    }
  }

  async createPayment(params: CrearPagoParams): Promise<CrearPagoResultado> {
    this.contador += 1
    const id = `mock_${Date.now()}_${this.contador}`
    return {
      ok: true,
      proveedorPaymentId: id,
      estado: 'authorized',
      raw: { simulado: true, ordenId: params.ordenId, monto: params.monto },
    }
  }

  async getPaymentStatus(proveedorPaymentId: string): Promise<EstadoPagoResultado> {
    return { estado: 'authorized', raw: { simulado: true, proveedorPaymentId } }
  }

  async cancelPayment(): Promise<void> {
    // no-op: simulado
  }

  async refundPayment(): Promise<void> {
    // no-op: simulado
  }

  async verifyWebhook(): Promise<WebhookEvento | null> {
    return null // el mock no recibe webhooks reales
  }

  normalizePaymentStatus(estadoProveedor: string): EstadoTransaccionPago {
    return (estadoProveedor as EstadoTransaccionPago) ?? 'unknown'
  }
}
