// Edge Function: interredes-cobrar
//
// La caja manda el importe a la pinpad de Banorte y, si la tarjeta se
// aprueba, registra la venta por EL MISMO camino que una venta de mostrador
// (`fn_cobrar_orden`, `fn_cobrar_orden_mixto` o `fn_encargo_entregar_con_venta`).
// No hay un segundo camino del dinero: el servidor recalcula el total, el
// pago cae en el corte, el trigger descuenta inventario y manda comandas.
//
// Lo que NO se negocia:
//
//   * **El importe se decide aquí, no en la pantalla.** Con una orden ya
//     creada se lee `ordenes.total` (menos lo que va en efectivo). Para la
//     entrega de un encargo la orden la crea el servidor DESPUÉS de cobrar,
//     así que el importe viene de la caja —y la RPC lo valida contra su
//     propio cálculo: si no coincide, la venta se rechaza y **la tarjeta se
//     anula** en la misma llamada. Nunca queda un cobro sin venta.
//   * **Un doble toque no cobra dos veces.** El intento se escribe en
//     `terminal_intentos` ANTES de llamar a la pinpad, con la clave de
//     idempotencia; el segundo toque encuentra el primero y lo devuelve.
//   * **Sin respuesta no es «no cobró».** Si la llamada muere (red, 90 s), se
//     pregunta por el número de control antes de darla por fallada. Si
//     tampoco se sabe, el intento queda en `sin_respuesta` para cuadrarlo
//     contra el banco, y la caja lo dice tal cual.
//   * **Solo con sesión del personal.** La función exige el JWT de la caja y
//     pregunta `fn_es_staff()`; la llave publicable sola no cobra.
//   * **Sin secretos no se finge nada.** `not_configured` honesto, y la caja
//     cae al cobro manual de siempre.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  InterredesSinCredenciales,
  InterredesError,
  anularInterredes,
  configInterredes,
  ventaInterredes,
  verificarInterredes,
  type ResultadoTerminal,
} from '../_shared/interredes.ts'

interface Encargo {
  encargo_id: string
  sucursal_id: string
  almacen_id: string
  canal: string
  corte_id: string
  descuento?: number
  efectivo?: number
  /** Lo que va con tarjeta. La RPC lo valida contra su propio total. */
  tarjeta: number
  items: { producto_id: string; cantidad: number }[]
}

interface Body {
  idempotency_key: string
  empleado_id?: string | null
  /** Caso A: la orden ya existe (venta normal). */
  orden_id?: string
  /** Parte en efectivo de un pago mixto; 0 = todo con tarjeta. */
  efectivo?: number
  /** Caso B: entrega de encargo con venta (la orden la crea la RPC). */
  encargo?: Encargo
}

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

const falla = (status: number, estado: string, codigo: string, mensaje: string, extra: Record<string, unknown> = {}) =>
  json(status, { ok: false, estado, error: { codigo, mensaje }, ...extra })

const redondea = (n: number) => Math.round(n * 100) / 100
const esUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s)

/**
 * Número de control: ≤ 30 alfanuméricos, único por afiliación. Lleva el
 * folio (para cuadrar a ojo contra el banco) y el reloj en base 36 (para
 * que dos intentos de la misma orden no choquen).
 */
function numeroDeControl(folio: number | string | null): string {
  const f = String(folio ?? 'E').replace(/[^A-Za-z0-9]/g, '')
  return `L${f}T${Date.now().toString(36).toUpperCase()}`.slice(0, 30)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // --- Quién llama: solo el personal con sesión ---
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const auth = req.headers.get('Authorization') ?? ''
  const sbUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: esStaff } = await sbUsuario.rpc('fn_es_staff')
  if (esStaff !== true) return falla(403, 'error', 'sin_sesion', 'Solo el personal con sesión puede cobrar en la terminal.')

  // --- Qué se pide ---
  let body: Body
  try {
    body = await req.json()
  } catch {
    return falla(400, 'error', 'bad_request', 'JSON inválido')
  }
  if (!esUuid(body.idempotency_key)) return falla(400, 'error', 'bad_request', 'Falta idempotency_key')
  if (!body.orden_id && !body.encargo) return falla(400, 'error', 'bad_request', 'Falta orden_id o encargo')
  if (body.orden_id && !esUuid(body.orden_id)) return falla(400, 'error', 'bad_request', 'orden_id inválido')
  const efectivo = redondea(Number(body.orden_id ? body.efectivo ?? 0 : body.encargo?.efectivo ?? 0))
  if (!(efectivo >= 0)) return falla(400, 'error', 'bad_request', 'efectivo inválido')

  // --- Los secretos ---
  let cfg
  try {
    cfg = configInterredes()
  } catch (e) {
    if (e instanceof InterredesSinCredenciales) {
      return json(200, {
        ok: false,
        estado: 'no_configurado',
        error: { codigo: 'not_configured', mensaje: `La terminal de Banorte no está configurada: ${e.message}` },
        faltan: e.faltan,
      })
    }
    throw e
  }

  const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // --- Idempotencia: ¿ya se intentó con esta clave? ---
  const { data: previo } = await sb
    .from('terminal_intentos')
    .select('estado, resultado, pago_id, orden_id, monto, detalle')
    .eq('idempotency_key', body.idempotency_key)
    .maybeSingle()
  if (previo) {
    if (previo.estado === 'aprobado' && previo.pago_id) {
      const { data: orden } = await sb.from('ordenes').select('id, folio').eq('id', previo.orden_id).single()
      return json(200, {
        ok: true,
        estado: 'aprobado',
        repetido: true,
        orden_id: orden?.id ?? previo.orden_id,
        folio: orden?.folio ?? null,
        pago_id: previo.pago_id,
        monto: Number(previo.monto),
        voucher: (previo.resultado as ResultadoTerminal | null)?.voucher ?? null,
      })
    }
    if (previo.estado === 'procesando') {
      return falla(409, 'en_proceso', 'en_proceso', 'Ese cobro todavía está en la terminal. Espera a que conteste.')
    }
    return falla(409, previo.estado, 'intento_terminado', previo.detalle ?? `Ese intento ya terminó (${previo.estado}). Vuelve a cobrar con un intento nuevo.`)
  }

  // --- Cuánto va a la tarjeta ---
  let tarjeta: number
  let folio: number | null = null
  let ordenId: string | null = null
  let total: number | null = null
  if (body.orden_id) {
    const { data: orden, error } = await sb
      .from('ordenes')
      .select('id, folio, total, estado_pago_orden, es_demo')
      .eq('id', body.orden_id)
      .single()
    if (error || !orden) return falla(404, 'error', 'orden_no_encontrada', 'La orden no existe')
    if (orden.es_demo) return falla(409, 'error', 'orden_demo', 'Una orden demo no se cobra en la terminal')
    if (!['draft', 'pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown'].includes(orden.estado_pago_orden)) {
      return falla(409, 'error', 'estado_invalido', `La orden no admite cobro (estado=${orden.estado_pago_orden})`)
    }
    total = Number(orden.total)
    tarjeta = redondea(total - efectivo)
    folio = orden.folio
    ordenId = orden.id
    if (!(tarjeta > 0) || efectivo >= total) {
      return falla(400, 'error', 'monto_invalido', 'Lo que va con tarjeta tiene que ser mayor que cero.')
    }
  } else {
    const e = body.encargo!
    if (!esUuid(e.encargo_id) || !Array.isArray(e.items)) return falla(400, 'error', 'bad_request', 'encargo incompleto')
    tarjeta = redondea(Number(e.tarjeta))
    if (!(tarjeta > 0)) return falla(400, 'error', 'monto_invalido', 'Lo que va con tarjeta tiene que ser mayor que cero.')
  }

  // --- El intento nace ANTES de llamar: es la huella y la idempotencia ---
  const controlNumber = numeroDeControl(folio)
  const { error: errIntento } = await sb.from('terminal_intentos').insert({
    idempotency_key: body.idempotency_key,
    orden_id: ordenId,
    encargo_id: body.encargo?.encargo_id ?? null,
    empleado_id: esUuid(body.empleado_id) ? body.empleado_id : null,
    control_number: controlNumber,
    monto: tarjeta,
    estado: 'procesando',
  })
  if (errIntento) {
    // La clave única: alguien ganó la carrera con la misma clave.
    return falla(409, 'en_proceso', 'en_proceso', 'Ese cobro ya se mandó a la terminal.')
  }
  const cerrarIntento = (estado: string, extra: Record<string, unknown> = {}) =>
    sb.from('terminal_intentos').update({ estado, updated_at: new Date().toISOString(), ...extra }).eq('idempotency_key', body.idempotency_key)

  // --- La pinpad ---
  let r: ResultadoTerminal
  try {
    r = await ventaInterredes(cfg, { controlNumber, monto: tarjeta })
  } catch (e) {
    // Tres cosas distintas: la API dijo que no (InterredesError, con su
    // `detail`), no se pudo entrar, o la llamada murió a medias. En las dos
    // últimas la pinpad PUDO haber cobrado: se pregunta antes de rendirse.
    const mensaje = e instanceof Error ? e.message : String(e)
    if (e instanceof InterredesError && e.http !== 408 && e.http !== 504) {
      await cerrarIntento('error', { detalle: mensaje, resultado: e.cuerpo })
      console.error('interredes-cobrar: la API rechazó la venta', controlNumber, mensaje)
      return falla(502, 'error', 'interredes_error', mensaje)
    }
    let verificado: ResultadoTerminal | null = null
    try {
      verificado = await verificarInterredes(cfg, { controlNumber })
    } catch {
      /* tampoco contestó */
    }
    if (!verificado) {
      await cerrarIntento('sin_respuesta', { detalle: mensaje })
      console.error('interredes-cobrar: sin respuesta', controlNumber, mensaje)
      return falla(502, 'sin_respuesta', 'sin_respuesta',
        'La terminal no contestó y no se pudo saber si cobró. NO vuelvas a cobrar hasta revisar en la pinpad ' +
          `si la operación ${controlNumber} salió aprobada; si salió, avisa a gerencia para registrarla.`,
        { control_number: controlNumber })
    }
    r = verificado
  }

  if (!r.aprobado) {
    const estado = r.resultado === 'T' ? 'sin_respuesta' : 'rechazado'
    await cerrarIntento(estado, { resultado: r, detalle: r.texto })
    const mensaje =
      r.resultado === 'T'
        ? 'La terminal no respondió a tiempo. Revisa la pinpad y vuelve a intentar.'
        : `La tarjeta no se aprobó${r.texto ? `: ${r.texto}` : ''}${r.codigo ? ` (${r.codigo})` : ''}.`
    return json(200, { ok: false, estado, error: { codigo: r.codigo ?? r.resultado, mensaje }, voucher: r.voucher })
  }

  // --- Aprobada: la venta entra por el camino de siempre ---
  const referencia = r.voucher.autorizacion ?? r.voucher.referencia ?? controlNumber
  const autorizadoPor = esUuid(body.empleado_id) ? body.empleado_id : null
  let pagoId: string | null = null
  try {
    if (ordenId) {
      const rpc = efectivo > 0
        ? sb.rpc('fn_cobrar_orden_mixto', {
            p_orden_id: ordenId, p_efectivo: efectivo, p_tarjeta: tarjeta, p_metodo_tarjeta: 'tarjeta',
            p_referencia: referencia, p_autorizado_por: autorizadoPor, p_idempotency_key: body.idempotency_key,
          })
        : sb.rpc('fn_cobrar_orden', {
            p_orden_id: ordenId, p_metodo: 'tarjeta', p_monto: total,
            p_referencia: referencia, p_autorizado_por: autorizadoPor, p_idempotency_key: body.idempotency_key,
          })
      const { data: pago, error } = await rpc
      if (error) throw new Error(error.message)
      pagoId = (pago as { id?: string } | null)?.id ?? null
    } else {
      const e = body.encargo!
      const { data, error } = await sb.rpc('fn_encargo_entregar_con_venta', {
        p_encargo_id: e.encargo_id, p_sucursal_id: e.sucursal_id, p_almacen_id: e.almacen_id, p_canal: e.canal,
        p_items: e.items, p_corte_id: e.corte_id, p_empleado_id: autorizadoPor ?? undefined,
        p_descuento: e.descuento ?? 0, p_efectivo: efectivo, p_tarjeta: tarjeta,
        p_referencia: referencia, p_idempotency_key: body.idempotency_key,
      })
      if (error) throw new Error(error.message)
      const v = data as { orden_id: string; folio: number } | null
      ordenId = v?.orden_id ?? null
      folio = v?.folio ?? null
      if (ordenId) {
        const { data: pago } = await sb.from('pagos').select('id').eq('orden_id', ordenId).eq('estado', 'aprobado').maybeSingle()
        pagoId = pago?.id ?? null
      }
    }
  } catch (e) {
    // La tarjeta ya se cobró y la venta no entró. No se deja así: se anula
    // en la pinpad en esta misma llamada. Si la anulación también falla, el
    // intento queda en `error` con las dos cosas escritas, para que
    // gerencia lo resuelva con el banco en vez de descubrirlo en el corte.
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('interredes-cobrar: la venta no entró con la tarjeta ya aprobada', controlNumber, motivo)
    let anulada = false
    let detalleAnulacion = ''
    try {
      if (r.voucher.referencia && r.voucher.autorizacion) {
        const a = await anularInterredes(cfg, {
          controlNumber: numeroDeControl(folio), monto: tarjeta,
          referencia: r.voucher.referencia, autorizacion: r.voucher.autorizacion,
        })
        anulada = a.aprobado
        detalleAnulacion = a.texto ?? a.resultado
      } else {
        detalleAnulacion = 'la respuesta no trajo referencia/autorización para anular'
      }
    } catch (e2) {
      detalleAnulacion = e2 instanceof Error ? e2.message : String(e2)
    }
    await cerrarIntento(anulada ? 'anulado' : 'error', {
      resultado: r, detalle: `La venta no se registró (${motivo}). Anulación: ${anulada ? 'aprobada' : 'NO: ' + detalleAnulacion}`,
    })
    return falla(500, anulada ? 'anulado' : 'error', 'venta_no_registrada',
      anulada
        ? `La tarjeta se aprobó pero la venta no se pudo registrar (${motivo}), así que el cobro se ANULÓ en la terminal. Vuelve a intentar.`
        : `La tarjeta se aprobó, la venta no se pudo registrar (${motivo}) y la anulación tampoco entró (${detalleAnulacion}). ` +
          `Avisa a gerencia: hay un cobro de ${tarjeta} en la terminal (control ${controlNumber}) sin venta.`,
      { voucher: r.voucher, control_number: controlNumber })
  }

  // --- Lo de la terminal, en el pago (crudo) y en el intento ---
  if (pagoId) {
    await sb.from('pagos').update({
      proveedor: 'banorte',
      proveedor_payment_id: r.voucher.referencia,
      proveedor_payload: r.crudo as Record<string, unknown>,
    }).eq('id', pagoId)
  }
  await cerrarIntento('aprobado', { resultado: r, pago_id: pagoId, orden_id: ordenId })

  console.log('interredes-cobrar: aprobada', { folio, controlNumber, monto: tarjeta, modo: cfg.modo })
  return json(200, {
    ok: true,
    estado: 'aprobado',
    orden_id: ordenId,
    folio,
    pago_id: pagoId,
    monto: tarjeta,
    modo: cfg.modo,
    voucher: { ...r.voucher, controlNumber: r.voucher.controlNumber ?? controlNumber },
  })
})
