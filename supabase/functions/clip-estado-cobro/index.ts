// Edge Function: clip-estado-cobro
//
// Consulta el estado REAL de un intento de pago contra la API de Clip y,
// si ya quedó aprobado, confirma la venta ahí mismo (fn_confirmar_venta
// es idempotente). Es el respaldo del webhook: aunque el webhook nunca
// llegara, el sondeo del kiosko termina la venta igual.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ClipSinCredenciales } from '../_shared/clip.ts'
import { sincronizarPagoClip } from '../_shared/pinpad.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })

  let body: { proveedor_payment_id?: string }
  try {
    body = await req.json()
  } catch {
    return responder({ estado: 'unknown', motivo: 'bad_request' }, 400)
  }
  if (!body.proveedor_payment_id) {
    return responder({ estado: 'unknown', motivo: 'falta proveedor_payment_id' }, 400)
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: pago } = await sb
    .from('pagos')
    .select('id, orden_id, proveedor_payment_id, estado_transaccion')
    .eq('proveedor_payment_id', body.proveedor_payment_id)
    .maybeSingle()

  if (!pago) return responder({ estado: 'unknown', motivo: 'pago_no_encontrado' })

  try {
    const estado = await sincronizarPagoClip(sb, pago)
    return responder({ estado })
  } catch (e) {
    if (e instanceof ClipSinCredenciales) {
      return responder({ estado: 'unknown', motivo: 'not_configured' })
    }
    console.error('clip-estado-cobro:', e)
    // El estado local es lo mejor que se sabe; el sondeo reintentará.
    return responder({ estado: pago.estado_transaccion, motivo: 'sync_error' })
  }
})
