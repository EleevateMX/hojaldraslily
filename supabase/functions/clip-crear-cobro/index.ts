// Edge Function: clip-crear-cobro
//
// Recibe { orden_id, monto, idempotency_key, sucursal_id, descripcion? }
// desde el kiosko (vía ClipPaymentProvider.createPayment, nunca directo)
// y empuja el cobro a la terminal física con la API de PinPad de Clip:
// el monto aparece solo en la Stand 2 y la cajera únicamente acerca la
// tarjeta del cliente.
//
// Principios que NO se negocian:
//   * El monto se recalcula desde la orden real — el del body es decorativo.
//   * Esta función NUNCA confirma la venta: deja el pago pendiente y la
//     confirmación llega por clip-webhook o clip-estado-cobro, ambos
//     verificando contra Clip con GET autenticado.
//   * Sin credenciales o sin número de serie configurado: not_configured
//     honesto, jamás una aprobación fingida.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { headersClip, ClipSinCredenciales } from '../_shared/clip.ts'
import { PINPAD_BASE, llamarPinpadClip } from '../_shared/pinpad.ts'

interface Body {
  orden_id: string
  monto: number
  idempotency_key: string
  sucursal_id: string
  descripcion?: string
}

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

const noConfigurado = (mensaje: string) =>
  json(200, { ok: false, error: { codigo: 'not_configured', mensaje } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let cabecerasClip: HeadersInit
  try {
    cabecerasClip = headersClip('authorization')
  } catch (e) {
    if (e instanceof ClipSinCredenciales) {
      return noConfigurado('Pago con terminal no disponible todavía. Usa Efectivo o Tarjeta manual.')
    }
    throw e
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: { codigo: 'bad_request', mensaje: 'JSON inválido' } })
  }
  if (!body.orden_id || !body.idempotency_key) {
    return json(400, { ok: false, error: { codigo: 'bad_request', mensaje: 'Faltan orden_id / idempotency_key' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // El monto NUNCA se confía del body — se recalcula desde la orden real.
  const { data: orden, error: errOrden } = await sb
    .from('ordenes')
    .select('id, folio, total, estado_pago_orden, sucursal_id, es_demo, nombre_cliente')
    .eq('id', body.orden_id)
    .single()

  if (errOrden || !orden) {
    return json(404, { ok: false, error: { codigo: 'orden_no_encontrada', mensaje: 'La orden no existe' } })
  }
  if (orden.es_demo) {
    return json(409, { ok: false, error: { codigo: 'orden_demo', mensaje: 'Una orden demo no se cobra en la terminal' } })
  }
  if (!['draft', 'pending_payment', 'payment_processing', 'payment_unknown'].includes(orden.estado_pago_orden)) {
    return json(409, {
      ok: false,
      error: { codigo: 'estado_invalido', mensaje: `La orden no admite cobro (estado=${orden.estado_pago_orden})` },
    })
  }

  // Terminal destino: configurada por sucursal (Admin) o, como respaldo,
  // en el secret CLIP_SERIAL_POS. Es el serial_number_pos de la API.
  const { data: config } = await sb
    .from('configuracion_kiosko')
    .select('clip_serial_pos')
    .eq('sucursal_id', orden.sucursal_id)
    .maybeSingle()
  const serial = config?.clip_serial_pos ?? Deno.env.get('CLIP_SERIAL_POS')
  if (!serial) {
    return noConfigurado('Falta registrar el número de serie de la terminal Clip (clip_serial_pos).')
  }

  // Idempotencia nuestra: si este mismo intento ya se mandó, se devuelve
  // tal cual — un doble clic no puede poner dos cobros en la terminal.
  const { data: previo } = await sb
    .from('pagos')
    .select('id, proveedor_payment_id, estado_transaccion')
    .eq('idempotency_key', body.idempotency_key)
    .maybeSingle()
  if (previo?.proveedor_payment_id) {
    return json(200, { ok: true, proveedor_payment_id: previo.proveedor_payment_id, estado: previo.estado_transaccion })
  }

  // Si la orden trae un intento vivo anterior (reintento con otra clave),
  // se cancela en Clip antes de crear el nuevo: dos solicitudes activas en
  // la misma terminal son una receta para cobrar la que no era.
  const { data: vivos } = await sb
    .from('pagos')
    .select('id, proveedor_payment_id')
    .eq('orden_id', orden.id)
    .eq('proveedor', 'clip')
    .in('estado_transaccion', ['created', 'pending', 'processing'])
  for (const v of vivos ?? []) {
    if (v.proveedor_payment_id) {
      // llamarPinpadClip y no fetch directo: el DELETE rechaza Basic en
      // `authorization` (403 del gateway), la cabecera correcta es x-api-key.
      await llamarPinpadClip(
        `${PINPAD_BASE}/payment/${encodeURIComponent(v.proveedor_payment_id)}`,
        'DELETE',
      ).catch(() => {})
    }
    await sb.from('pagos').update({ estado_transaccion: 'cancelled', estado: 'cancelado' }).eq('id', v.id)
  }

  // El registro del intento nace ANTES de llamar a Clip: si el proceso
  // muriera a media llamada, queda huella para reconciliar.
  const { data: pago, error: errPago } = await sb
    .from('pagos')
    .insert({
      orden_id: orden.id,
      metodo: 'clip',
      monto: orden.total,
      estado: 'pendiente',
      estado_transaccion: 'created',
      proveedor: 'clip',
      clip_terminal_id: serial,
      idempotency_key: body.idempotency_key,
      referencia: `folio-${orden.folio}`,
    })
    .select('id')
    .single()
  if (errPago || !pago) {
    return json(500, { ok: false, error: { codigo: 'db_error', mensaje: errPago?.message ?? 'No se pudo registrar el intento' } })
  }

  // La llamada real a la terminal. La llave en la URL del webhook es el
  // filtro de entrada de clip-webhook (que corre sin verify_jwt).
  const llaveWebhook = Deno.env.get('CLIP_WEBHOOK_URL_KEY')
  const urlWebhook = `${supabaseUrl}/functions/v1/clip-webhook${llaveWebhook ? `?llave=${encodeURIComponent(llaveWebhook)}` : ''}`
  // La referencia es lo que se ve en el panel de Clip y en el recibo, y es
  // por donde se cuadra una venta cuando algo no cuadra. Antes iba el UUID de
  // la orden: 36 caracteres que no le dicen nada a nadie. Ahora va el folio
  // —el mismo número que la cajera le canta al cliente y que sale impreso en
  // la comanda— y el nombre del pedido si lo hay.
  //
  // Nada empata por este texto: la verdad de un cobro siempre se consulta con
  // un GET autenticado contra el pinpad_request_id. Esto es para humanos.
  // Clip solo acepta letras, números y guiones en la referencia ("reference
  // must not contain special characters" — rechazó los espacios en la primera
  // venta real con este formato). Se normaliza: acentos fuera, todo lo que no
  // sea alfanumérico se vuelve guion.
  const nombre = (orden.nombre_cliente ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')       // é -> e, ñ -> n
    .replace(/[^A-Za-z0-9]+/g, '-')         // espacios y símbolos -> guion
    .replace(/^-+|-+$/g, '')
  const referencia = nombre ? `Folio-${orden.folio}-${nombre}` : `Folio-${orden.folio}`

  const payloadClip = {
    amount: Number(orden.total).toFixed(2),
    // Clip corta la referencia si es muy larga; un nombre kilométrico no debe
    // empujar al folio fuera de la pantalla, así que el folio va primero.
    reference: referencia.slice(0, 60),
    serial_number_pos: serial,
    webhook_url: urlWebhook,
    preferences: {
      // Flujo de mostrador: sin propinas ni meses, regresar solo al final.
      is_auto_return_enabled: true,
      is_tip_enabled: false,
      is_msi_enabled: false,
      is_mci_enabled: false,
      is_dcc_enabled: false,
      is_retry_enabled: true,
      is_share_enabled: false,
      is_auto_print_receipt_enabled: false,
      is_split_payment_enabled: false,
    },
  }

  let respClip: Response
  try {
    respClip = await fetch(`${PINPAD_BASE}/payment`, {
      method: 'POST',
      headers: cabecerasClip,
      body: JSON.stringify(payloadClip),
    })
  } catch (e) {
    // La llamada nunca llegó a Clip: el intento se cancela (created→unknown
    // no es una transición permitida y aquí no hay ambigüedad real).
    await sb.from('pagos').update({ estado_transaccion: 'cancelled', estado: 'cancelado', proveedor_error: String(e) }).eq('id', pago.id)
    return json(502, { ok: false, error: { codigo: 'clip_inalcanzable', mensaje: 'No se pudo contactar a Clip. Intenta de nuevo.' } })
  }

  const cuerpoClip = await respClip.json().catch(() => null)

  if (!respClip.ok) {
    const codigoClip = cuerpoClip?.code ?? `http_${respClip.status}`
    const mensaje =
      codigoClip === 'PINPAD_TERMINAL_TIMEOUT_EXCEPTION'
        ? 'La terminal no respondió. Revisa que la Stand 2 esté encendida, con internet y con la app PinPad abierta.'
        : respClip.status === 401
          ? 'Clip rechazó las credenciales. Revisa CLIP_API_KEY / CLIP_API_SECRET.'
          : `Clip respondió un error (${codigoClip}).`
    await sb
      .from('pagos')
      .update({ estado_transaccion: 'declined', estado: 'rechazado', proveedor_error: JSON.stringify(cuerpoClip ?? codigoClip) })
      .eq('id', pago.id)
    console.error('clip-crear-cobro: error de Clip', respClip.status, cuerpoClip)
    return json(502, { ok: false, error: { codigo: codigoClip, mensaje } })
  }

  const pinpadRequestId = cuerpoClip?.pinpad_request_id as string | undefined
  if (!pinpadRequestId) {
    await sb.from('pagos').update({ estado_transaccion: 'cancelled', estado: 'cancelado', proveedor_error: JSON.stringify(cuerpoClip) }).eq('id', pago.id)
    return json(502, { ok: false, error: { codigo: 'respuesta_inesperada', mensaje: 'Clip no devolvió el id de la solicitud.' } })
  }

  await sb
    .from('pagos')
    .update({ proveedor_payment_id: pinpadRequestId, estado_transaccion: 'pending', clip_payload: cuerpoClip })
    .eq('id', pago.id)
  // La máquina de estados de la orden exige pasar por pending_payment
  // antes de payment_processing cuando viene de draft.
  if (orden.estado_pago_orden === 'draft') {
    await sb.from('ordenes').update({ estado_pago_orden: 'pending_payment' }).eq('id', orden.id)
  }
  if (orden.estado_pago_orden !== 'payment_processing') {
    await sb.from('ordenes').update({ estado_pago_orden: 'payment_processing' }).eq('id', orden.id)
  }

  console.log('clip-crear-cobro: cobro en terminal', { orden: orden.folio, pinpadRequestId, serial })
  return json(200, { ok: true, proveedor_payment_id: pinpadRequestId, estado: 'pending' })
})
