import { FunctionsHttpError } from '@supabase/supabase-js'
import type { ClienteLily } from '@lily/supabase'

/**
 * La terminal bancaria de la caja, vista desde la pantalla.
 *
 * Es distinta de `PaymentProvider` a propósito. Aquella interfaz nació para
 * el kiosko con Clip: se crea un intento, la pantalla sondea y un webhook
 * confirma. La pinpad de Banorte (Interredes Remotas) no funciona así: la
 * llamada **se queda esperando** hasta que la tarjeta se aprueba o se
 * rechaza, y la venta la registra el servidor en esa misma llamada. Una sola
 * pregunta, una sola respuesta.
 *
 * La pantalla NUNCA habla con la API del banco: llama a la Edge Function
 * `interredes-cobrar`, que es donde viven los secretos y donde se decide el
 * importe. Lo que aquí se traduce es la respuesta, para que la caja no tenga
 * que conocer la forma del JSON.
 */

/** Lo que el papel imprime de una venta con tarjeta (Anexo VII del manual). */
export interface VoucherTerminal {
  afiliacion?: string | null
  controlNumber?: string | null
  autorizacion?: string | null
  referencia?: string | null
  terminalId?: string | null
  marca?: string | null
  tipo?: string | null
  banco?: string | null
  pan?: string | null
  entrada?: string | null
  pin?: string | null
  aid?: string | null
  aplicacion?: string | null
  tvr?: string | null
  tsi?: string | null
}

/** Venta normal: la orden ya existe y el servidor lee su total. */
export interface CobroDeOrden {
  ordenId: string
  /** Parte en efectivo (mixto). 0 o nada = todo con tarjeta. */
  efectivo?: number
  idempotencyKey: string
  empleadoId?: string | null
}

/** Entrega de encargo con venta: la orden la crea el servidor al cobrar. */
export interface CobroDeEncargo {
  encargo: {
    encargo_id: string
    sucursal_id: string
    almacen_id: string
    canal: string
    corte_id: string
    descuento?: number
    efectivo?: number
    tarjeta: number
    items: { producto_id: string; cantidad: number }[]
  }
  idempotencyKey: string
  empleadoId?: string | null
}

export type EstadoCobroTerminal =
  | 'aprobado'
  | 'no_configurado'
  | 'rechazado'
  | 'sin_respuesta'
  | 'anulado'
  | 'en_proceso'
  | 'error'

export type ResultadoCobroTerminal =
  | {
      ok: true
      estado: 'aprobado'
      ordenId: string
      folio: number | null
      pagoId: string | null
      monto: number
      /** PRD cobra de verdad; AUT/DEC/RND son simulación. Para avisarlo en pantalla. */
      modo: string | null
      voucher: VoucherTerminal | null
      /** La misma clave ya se había cobrado: se devolvió lo de entonces. */
      repetido?: boolean
    }
  | {
      ok: false
      estado: Exclude<EstadoCobroTerminal, 'aprobado'>
      codigo: string
      mensaje: string
      voucher?: VoucherTerminal | null
      /** Lo que hay que buscar en la pinpad cuando no se supo si cobró. */
      controlNumber?: string | null
    }

export interface TerminalDeCobro {
  readonly nombre: string
  cobrar(p: CobroDeOrden | CobroDeEncargo): Promise<ResultadoCobroTerminal>
  /** Cancelación del día. Solo gerencia; truena si no se pudo. */
  cancelar(pagoId: string): Promise<{ ordenId: string; voucher: VoucherTerminal | null }>
}

/** La forma del JSON de `interredes-cobrar`. */
interface RespuestaCobrar {
  ok: boolean
  estado?: string
  orden_id?: string | null
  folio?: number | null
  pago_id?: string | null
  monto?: number
  modo?: string
  voucher?: VoucherTerminal | null
  repetido?: boolean
  control_number?: string | null
  error?: { codigo: string; mensaje: string }
}

/**
 * Saca el cuerpo aunque la función haya contestado 4xx/5xx: supabase-js lo
 * convierte en `FunctionsHttpError` y deja el JSON en `context`. Sin esto,
 * un 409 «ese cobro ya está en la terminal» se leería como «error de red».
 */
async function cuerpoDe(data: unknown, error: unknown): Promise<RespuestaCobrar | null> {
  if (!error) return (data ?? null) as RespuestaCobrar | null
  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as RespuestaCobrar
    } catch {
      return null
    }
  }
  return null
}

export class BanorteTerminal implements TerminalDeCobro {
  readonly nombre = 'banorte'
  private readonly sb: ClienteLily

  constructor(sb: ClienteLily) {
    this.sb = sb
  }

  async cobrar(p: CobroDeOrden | CobroDeEncargo): Promise<ResultadoCobroTerminal> {
    const body =
      'ordenId' in p
        ? { orden_id: p.ordenId, efectivo: p.efectivo ?? 0, idempotency_key: p.idempotencyKey, empleado_id: p.empleadoId ?? null }
        : { encargo: p.encargo, idempotency_key: p.idempotencyKey, empleado_id: p.empleadoId ?? null }

    const { data, error } = await this.sb.functions.invoke('interredes-cobrar', { body })
    const r = await cuerpoDe(data, error)

    if (!r) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo hablar con el servidor de cobro.'
      return { ok: false, estado: 'error', codigo: 'edge_function_error', mensaje }
    }
    if (r.ok && r.orden_id) {
      return {
        ok: true,
        estado: 'aprobado',
        ordenId: r.orden_id,
        folio: r.folio ?? null,
        pagoId: r.pago_id ?? null,
        monto: Number(r.monto ?? 0),
        modo: r.modo ?? null,
        voucher: r.voucher ?? null,
        repetido: r.repetido,
      }
    }
    const estado = (r.estado ?? 'error') as EstadoCobroTerminal
    return {
      ok: false,
      estado: estado === 'aprobado' ? 'error' : estado,
      codigo: r.error?.codigo ?? 'unknown',
      mensaje: r.error?.mensaje ?? 'La terminal no pudo cobrar.',
      voucher: r.voucher ?? null,
      controlNumber: r.control_number ?? null,
    }
  }

  async cancelar(pagoId: string): Promise<{ ordenId: string; voucher: VoucherTerminal | null }> {
    const { data, error } = await this.sb.functions.invoke('interredes-cancelar', { body: { pago_id: pagoId } })
    const r = (await cuerpoDe(data, error)) as (RespuestaCobrar & { orden_id?: string }) | null
    if (!r) throw new Error(error instanceof Error ? error.message : 'No se pudo hablar con el servidor.')
    if (!r.ok || !r.orden_id) throw new Error(r.error?.mensaje ?? 'La red no aceptó la cancelación.')
    return { ordenId: r.orden_id, voucher: r.voucher ?? null }
  }
}

/**
 * La terminal de la caja. Hoy es Banorte y punto: la casa lo decidió el
 * 20/10/26. Si un día hay que elegir por sucursal, se elige aquí y la caja
 * no se entera.
 */
export function obtenerTerminal(sb: ClienteLily): TerminalDeCobro {
  return new BanorteTerminal(sb)
}
