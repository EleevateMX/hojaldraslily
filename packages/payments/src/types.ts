import type { EstadoTransaccionPago } from '@shake/types'

/**
 * Abstracción de proveedor de pagos. El kiosko/POS NUNCA hablan
 * directamente con Clip (ni con ningún otro proveedor) — siempre pasan
 * por esta interfaz. Cambiar de proveedor, o agregar uno nuevo, no debe
 * requerir tocar ninguna vista.
 */
export interface CrearPagoParams {
  ordenId: string
  monto: number
  /** Clave de idempotencia del INTENTO de pago — un reintento con la
   * misma clave nunca debe crear un segundo cobro en el proveedor. */
  idempotencyKey: string
  sucursalId: string
  descripcion?: string
}

export interface CrearPagoResultado {
  /** true si el proveedor aceptó iniciar el cobro. false si no se pudo
   * siquiera intentar (ej. credenciales no configuradas) — en ese caso
   * `error` trae el motivo y la UI debe mostrar "Pago temporalmente no
   * disponible", nunca simular una aprobación. */
  ok: boolean
  proveedorPaymentId: string | null
  estado: EstadoTransaccionPago
  /** URL de checkout o dato de QR, si el proveedor los da. */
  checkoutUrl?: string
  qrData?: string
  error?: { codigo: string; mensaje: string }
  raw?: unknown
}

export interface EstadoPagoResultado {
  estado: EstadoTransaccionPago
  raw?: unknown
}

export interface WebhookEvento {
  proveedorPaymentId: string
  estado: EstadoTransaccionPago
  eventoId: string
  raw: unknown
}

export interface PaymentProvider {
  readonly nombre: string
  createPayment(params: CrearPagoParams): Promise<CrearPagoResultado>
  getPaymentStatus(proveedorPaymentId: string): Promise<EstadoPagoResultado>
  cancelPayment(proveedorPaymentId: string): Promise<void>
  refundPayment(proveedorPaymentId: string, monto?: number): Promise<void>
  /** Valida la firma del webhook y lo normaliza. Devuelve null si la
   * firma no es válida — el llamante debe rechazar el request (401/403),
   * nunca procesar un webhook sin firma verificada. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvento | null>
  normalizePaymentStatus(estadoProveedor: string): EstadoTransaccionPago
}
