// Edge Function: interredes-cancelar
//
// Cancelación del día (`void`) de un cobro con tarjeta de Banorte: el cliente
// pagó y la venta no se concreta (se arrepintió, se cobró de más, se cobró
// dos veces). Es lo que con Clip no hacía falta y con un banco sí: sin este
// gesto, deshacer un cobro es un trámite con Banorte.
//
// Solo gerencia (`fn_es_jefe`): deshacer dinero es decisión de quien
// responde por el corte. Lo que hace, en orden:
//
//   1. Lee el pago (tiene que ser de Banorte, aprobado, con su referencia y
//      su autorización guardadas en `proveedor_payload`).
//   2. Manda el `void` a la pinpad.
//   3. Si la red lo aprobó, marca el pago `cancelado` y la orden
//      `cancelada`, y guarda la respuesta de la anulación junto a la de la
//      venta. Si no, no toca nada y dice por qué.
//
// Lo que NO hace: devolver el pan al inventario ni sacar la venta del corte
// —eso lo decide gerencia mirando la orden cancelada en Admin—. Y no sirve
// para otro día: para eso está la devolución (`refund`), que todavía no
// tiene botón.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { InterredesSinCredenciales, anularInterredes, configInterredes, leerResultado } from '../_shared/interredes.ts'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })
const falla = (status: number, codigo: string, mensaje: string) => json(status, { ok: false, error: { codigo, mensaje } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const sbUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: esJefe } = await sbUsuario.rpc('fn_es_jefe')
  if (esJefe !== true) return falla(403, 'solo_gerencia', 'Cancelar un cobro con tarjeta es de gerencia.')

  let body: { pago_id?: string }
  try {
    body = await req.json()
  } catch {
    return falla(400, 'bad_request', 'JSON inválido')
  }
  if (!body.pago_id) return falla(400, 'bad_request', 'Falta pago_id')

  let cfg
  try {
    cfg = configInterredes()
  } catch (e) {
    if (e instanceof InterredesSinCredenciales) return falla(200, 'not_configured', e.message)
    throw e
  }

  const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: pago } = await sb
    .from('pagos')
    .select('id, orden_id, monto, estado, proveedor, proveedor_payload')
    .eq('id', body.pago_id)
    .maybeSingle()
  if (!pago) return falla(404, 'pago_no_encontrado', 'Ese pago no existe')
  if (pago.proveedor !== 'banorte') return falla(409, 'no_es_banorte', 'Ese pago no se cobró en la terminal de Banorte')
  if (pago.estado !== 'aprobado') return falla(409, 'estado_invalido', `El pago está ${pago.estado}, no aprobado`)

  const venta = leerResultado(pago.proveedor_payload)
  if (!venta.voucher.referencia || !venta.voucher.autorizacion) {
    return falla(409, 'sin_referencia', 'La respuesta guardada de la venta no trae referencia y autorización: hay que cancelarla desde la pinpad.')
  }

  const { data: orden } = await sb.from('ordenes').select('folio').eq('id', pago.orden_id).single()
  const controlNumber = `L${orden?.folio ?? 'X'}V${Date.now().toString(36).toUpperCase()}`.slice(0, 30)

  let r
  try {
    r = await anularInterredes(cfg, {
      controlNumber, monto: Number(pago.monto),
      referencia: venta.voucher.referencia, autorizacion: venta.voucher.autorizacion,
    })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error('interredes-cancelar:', pago.id, mensaje)
    return falla(502, 'interredes_error', mensaje)
  }

  if (!r.aprobado) {
    return json(200, { ok: false, error: { codigo: r.codigo ?? r.resultado, mensaje: `La red no aceptó la cancelación${r.texto ? `: ${r.texto}` : ''}.` }, resultado: r })
  }

  await sb.from('pagos').update({
    estado: 'cancelado',
    estado_transaccion: 'cancelled',
    proveedor_payload: { venta: pago.proveedor_payload, anulacion: r.crudo },
  }).eq('id', pago.id)
  await sb.from('ordenes').update({ estado: 'cancelada', updated_at: new Date().toISOString() }).eq('id', pago.orden_id)

  console.log('interredes-cancelar: anulada', { pago: pago.id, folio: orden?.folio, controlNumber })
  return json(200, { ok: true, pago_id: pago.id, orden_id: pago.orden_id, voucher: r.voucher })
})
