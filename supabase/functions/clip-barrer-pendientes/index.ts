// Edge Function: clip-barrer-pendientes
//
// Cierra los cobros que quedaron a medias.
//
// El camino feliz de un cobro tiene dos avisos: el webhook de Clip (que es
// solo un timbre — no viene firmado, así que la verdad siempre se pide con un
// GET autenticado) y el sondeo del kiosko durante 120 segundos. Si los dos
// fallan —se cayó la red del local, la cajera cerró la pantalla, el webhook
// nunca llegó— el pago se queda en `pending` PARA SIEMPRE.
//
// Y ese es el peor estado posible con dinero real: **el cliente pagó y el
// sistema no se enteró**. La venta no se confirma, no entra al corte, no
// descuenta inventario y no imprime comanda.
//
// `fn_reconciliar_pagos` no puede arreglarlo: es SQL y no puede llamar a la
// API de Clip. Esto sí. Busca los cobros que llevan rato en el aire y le
// pregunta a Clip por cada uno; `sincronizarPagoClip` se encarga del resto
// —actualiza el pago y, si Clip dice autorizado, confirma la venta.
//
// Corre solo cada minuto (pg_cron), pero también se puede llamar a mano.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from './_shared/cors.ts'
import { sincronizarPagoClip } from './_shared/pinpad.ts'

/**
 * Cuánto se le da al camino normal antes de meter mano.
 *
 * El kiosko sondea 120 segundos. Se espera un poco más para no pelearse con
 * él por el mismo cobro ni contarle a Clip la misma historia dos veces.
 */
const MINUTOS_DE_GRACIA = 3

/** Tope por corrida: si algo se acumuló, se drena de a poco y sin ahogar a Clip. */
const MAXIMO_POR_CORRIDA = 20

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta configuración del servidor.' }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const sb = createClient(url, servicio, { auth: { persistSession: false } })

  const corte = new Date(Date.now() - MINUTOS_DE_GRACIA * 60_000).toISOString()
  const { data: pendientes, error } = await sb
    .from('pagos')
    .select('id, orden_id, proveedor_payment_id, estado_transaccion')
    .eq('proveedor', 'clip')
    .in('estado_transaccion', ['created', 'pending', 'processing'])
    .not('proveedor_payment_id', 'is', null)
    .lt('created_at', corte)
    .order('created_at')
    .limit(MAXIMO_POR_CORRIDA)

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const resultados: { pago: string; antes: string; ahora: string }[] = []
  for (const pago of pendientes ?? []) {
    try {
      const ahora = await sincronizarPagoClip(sb, pago)
      if (ahora !== pago.estado_transaccion) {
        resultados.push({ pago: pago.id, antes: pago.estado_transaccion, ahora })
      }
    } catch (e) {
      // Un cobro que no se puede consultar no debe detener a los demás: el
      // siguiente barrido lo vuelve a intentar.
      console.error('clip-barrer-pendientes: fallo al sincronizar', pago.id, e)
    }
  }

  if (resultados.length > 0) {
    console.log('clip-barrer-pendientes: cerrados', resultados)
  }

  return new Response(
    JSON.stringify({ ok: true, revisados: pendientes?.length ?? 0, cambiaron: resultados }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
