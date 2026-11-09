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
 * La terminal por el AGENTE DLL de la PC (cola), que es el camino CERTIFICADO
 * de Banorte. La caja no llega a la pinpad; encola el cobro, el agente de la
 * tienda lo toma y cobra por el DLL, y el servidor registra la venta al
 * aprobar. La pantalla solo encola y sondea.
 *
 * Misma interfaz que `BanorteTerminal` (la de la API): la caja no sabe por cuál
 * de los dos cobra. La diferencia es que aquí la respuesta no es inmediata —el
 * cajero del otro lado tiene que poner la tarjeta—, así que `cobrar` sondea.
 */
export class BanorteDllTerminal implements TerminalDeCobro {
  readonly nombre = 'banorte-dll'
  private readonly sb: ClienteLily
  /** Cuánto se sondea antes de rendirse (la pinpad espera ~90 s la tarjeta). */
  private readonly maxEsperaMs = 120_000
  private readonly intervaloMs = 1_500

  constructor(sb: ClienteLily) {
    this.sb = sb
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await (this.sb.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(fn, args)
    if (error) throw new Error((error as { message?: string }).message ?? 'Error de red con el servidor de cobro.')
    return (data ?? []) as T[]
  }

  async cobrar(p: CobroDeOrden | CobroDeEncargo): Promise<ResultadoCobroTerminal> {
    // 1) Encolar. El servidor decide el importe y el número de control.
    let pedido
    try {
      const filas = await this.rpc<{ cobro_id: string | null; estado: string; monto: number; control_number: string; hay_terminal: boolean }>(
        'fn_terminal_cobro_pedir',
        'ordenId' in p
          ? { p_idempotency_key: p.idempotencyKey, p_orden_id: p.ordenId, p_efectivo: p.efectivo ?? 0, p_empleado_id: p.empleadoId ?? null }
          : { p_idempotency_key: p.idempotencyKey, p_encargo: p.encargo, p_empleado_id: p.empleadoId ?? null },
      )
      pedido = filas[0]
    } catch (e) {
      return { ok: false, estado: 'error', codigo: 'edge_function_error', mensaje: e instanceof Error ? e.message : 'No se pudo encolar el cobro.' }
    }
    if (!pedido || pedido.hay_terminal === false) {
      return {
        ok: false,
        estado: 'no_configurado',
        codigo: 'not_configured',
        mensaje: 'La terminal de Banorte todavía no está conectada al sistema: cobra en la pinpad a mano y confirma aquí.',
      }
    }
    const cobroId = pedido.cobro_id!

    // 2) Sondear hasta que el agente reporte. La pinpad del otro lado está
    //    mostrando el importe y esperando la tarjeta.
    const hasta = Date.now() + this.maxEsperaMs
    while (Date.now() < hasta) {
      await new Promise((r) => setTimeout(r, this.intervaloMs))
      let est
      try {
        const filas = await this.rpc<{
          estado: string; monto: number; folio: number | null; orden_id: string | null; pago_id: string | null
          voucher: VoucherTerminal | null; codigo: string | null; texto: string | null; detalle: string | null; modo: string | null
        }>('fn_terminal_cobro_estado', { p_cobro_id: cobroId })
        est = filas[0]
      } catch {
        continue // un parpadeo de red no cancela el cobro; se vuelve a preguntar
      }
      if (!est) continue
      if (est.estado === 'en_cola' || est.estado === 'reclamado') continue

      if (est.estado === 'aprobado') {
        return {
          ok: true, estado: 'aprobado',
          ordenId: est.orden_id ?? '', folio: est.folio ?? null, pagoId: est.pago_id ?? null,
          monto: Number(est.monto ?? 0), modo: est.modo ?? null, voucher: est.voucher ?? null,
        }
      }
      const estado = (est.estado === 'sin_respuesta' ? 'sin_respuesta' : est.estado === 'anulado' ? 'anulado' : est.estado === 'error' ? 'error' : 'rechazado') as Exclude<EstadoCobroTerminal, 'aprobado'>
      const mensaje =
        est.estado === 'sin_respuesta'
          ? 'La terminal no contestó y no se sabe si cobró. NO vuelvas a cobrar: revisa la pinpad y, si cobró, avisa a gerencia.'
          : est.estado === 'error'
          ? (est.detalle ?? 'La tarjeta se aprobó pero la venta no se registró; se anuló en la terminal. Vuelve a intentar.')
          : (est.texto ?? 'La tarjeta no se aprobó.')
      return { ok: false, estado, codigo: est.codigo ?? estado, mensaje, voucher: est.voucher }
    }

    // Se acabó la espera sin respuesta del agente.
    return {
      ok: false, estado: 'sin_respuesta', codigo: 'timeout',
      mensaje: 'La terminal no contestó a tiempo. Revisa que el agente de la PC esté corriendo y la pinpad encendida; si la tarjeta ya se cobró, búscala en el corte.',
    }
  }

  async cancelar(): Promise<{ ordenId: string; voucher: VoucherTerminal | null }> {
    // La anulación del DLL la hace el agente en la pinpad (la cola la dispara
    // sola cuando una venta no se registra). Un botón de «deshacer cobro» por
    // cola es otra pieza; hoy no hay pantalla que lo pida.
    throw new Error('Deshacer un cobro con el agente DLL todavía no tiene camino desde la caja.')
  }
}

/**
 * La terminal de la caja. Hoy es Banorte por el AGENTE DLL (lo que certificó la
 * casa). Si faltara el agente, la caja cae al cobro manual sola (el `pedir`
 * contesta `no_configurado`). El camino por API (`BanorteTerminal`) queda como
 * referencia por si se vuelve a él.
 */
export function obtenerTerminal(sb: ClienteLily, via: 'dll' | 'api' = 'dll'): TerminalDeCobro {
  return via === 'api' ? new BanorteTerminal(sb) : new BanorteDllTerminal(sb)
}
