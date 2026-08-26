// Edge Function: clip-reembolsar
//
// Reembolsa (total o parcial) un pago ya cobrado en Clip (usado por
// ClipPaymentProvider.refundPayment). Mismo principio que las demás
// funciones de Clip: sin credenciales configuradas, responde
// not_configured explícito, nunca finge un reembolso que nunca ocurrió en
// Clip — un reembolso "fantasma" desincronizaría el estado real de dinero
// del negocio.
//
// TODO (cuando existan credenciales + documentación oficial de Clip):
// reemplazar el bloque "// TODO: llamar a la API real de Clip" con la
// llamada real. No se inventan aquí endpoints/campos de Clip que no se han
// confirmado — ver docs/integracion-clip.md.

import { corsHeaders } from '../_shared/cors.ts'

interface Body {
  proveedor_payment_id: string
  monto?: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const CLIP_API_KEY = Deno.env.get('CLIP_API_KEY')
  if (!CLIP_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'not_configured', mensaje: 'Clip no está configurado' } }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'bad_request', mensaje: 'JSON inválido' } }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  if (!body.proveedor_payment_id) {
    return new Response(JSON.stringify({ ok: false, error: { codigo: 'bad_request', mensaje: 'Falta proveedor_payment_id' } }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  // TODO: llamar a la API real de Clip aquí para reembolsar
  // body.proveedor_payment_id (total si body.monto es undefined, parcial
  // si viene). Cuando exista, esta función también debe actualizar
  // pagos.estado_transaccion a 'refunded_full'/'refunded_partial' vía
  // fn_confirmar_venta o una función equivalente — nunca actualizar la
  // orden directo desde aquí sin pasar por la máquina de estados.
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        codigo: 'not_implemented',
        mensaje: 'Credenciales presentes pero la integración real con la API de Clip aún no está escrita. Ver docs/integracion-clip.md.',
      },
    }),
    { status: 501, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
