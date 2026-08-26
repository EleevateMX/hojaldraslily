// Edge Function: clip-webhook
//
// Recibe las notificaciones de la API de PinPad de Clip. Estructura
// documentada del aviso: { id, origin, event_type } — SIN firma. Por eso
// este webhook se trata como un TIMBRE, nunca como la confirmación:
// con el id recibido se consulta a Clip con GET autenticado (server a
// server) y solo esa respuesta decide el estado del pago. Un webhook
// falsificado, cuando mucho, provoca una verificación de más.
//
// La venta se confirma únicamente vía fn_confirmar_venta (idempotente:
// los reenvíos de Clip — su comportamiento normal — no confirman doble).
//
// Nota de despliegue: esta función debe correr con verify_jwt DESACTIVADO
// (Clip no manda encabezados de Supabase). Como filtro extra, se acepta
// el aviso solo si trae la llave en la URL: ?llave=<CLIP_WEBHOOK_URL_KEY>
// (si el secret no está definido, se aceptan todos los avisos — el GET
// autenticado sigue siendo la única fuente de verdad).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sincronizarPagoClip } from '../_shared/pinpad.ts'

Deno.serve(async (req: Request) => {
  const llaveEsperada = Deno.env.get('CLIP_WEBHOOK_URL_KEY')
  if (llaveEsperada) {
    const llave = new URL(req.url).searchParams.get('llave')
    if (llave !== llaveEsperada) {
      return new Response('forbidden', { status: 403 })
    }
  }

  let evento: { id?: string; origin?: string; event_type?: string }
  try {
    evento = JSON.parse(await req.text())
  } catch {
    return new Response('invalid json', { status: 400 })
  }

  console.log('clip-webhook: aviso recibido', evento)
  if (!evento.id) return new Response('ok (sin id, ignorado)', { status: 200 })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // El id del aviso debería ser nuestro proveedor_payment_id; si no
  // coincide (Clip a veces notifica con el id del payment y no del
  // request), se busca también dentro del payload guardado.
  const { data: pago } = await sb
    .from('pagos')
    .select('id, orden_id, proveedor_payment_id, estado_transaccion')
    .eq('proveedor_payment_id', evento.id)
    .maybeSingle()

  if (!pago) {
    const { data: candidatos } = await sb
      .from('pagos')
      .select('id, orden_id, proveedor_payment_id, estado_transaccion')
      .eq('proveedor', 'clip')
      .in('estado_transaccion', ['created', 'pending', 'processing', 'unknown'])
      .order('created_at', { ascending: false })
      .limit(10)
    // Con pocos intentos vivos a la vez (una sucursal), sincronizarlos
    // todos es barato y resuelve el aviso venga con el id que venga.
    for (const c of candidatos ?? []) {
      try {
        await sincronizarPagoClip(sb, c)
      } catch (e) {
        console.error('clip-webhook: sync de candidato falló', c.id, e)
      }
    }
    return new Response('ok (sincronizados pendientes)', { status: 200 })
  }

  try {
    const estado = await sincronizarPagoClip(sb, pago)
    console.log('clip-webhook: pago sincronizado', { pago: pago.id, estado })
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('clip-webhook: error sincronizando', e)
    // 500 para que Clip reintente el aviso.
    return new Response('sync error', { status: 500 })
  }
})
