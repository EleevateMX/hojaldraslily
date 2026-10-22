// Edge Function: interredes-llave
//
// Carga de llaves de la pinpad de Banorte (`/transaction/key`). Es lo
// primero que se hace con una pinpad recién vinculada a la afiliación y una
// de las cuatro operaciones que el laboratorio de Payworks pide ver para
// certificar (llave, verificación, venta con chip, venta contactless). No
// mueve dinero, pero sí toca la pinpad, así que es de gerencia.
//
// Devuelve la respuesta cruda además de la leída: en la certificación hay
// que apuntar número de control, referencia, fecha y hora de cada
// operación, y el crudo es lo que se copia en la matriz.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { InterredesSinCredenciales, cargarLlaveInterredes, configInterredes } from '../_shared/interredes.ts'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sbUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: esJefe } = await sbUsuario.rpc('fn_es_jefe')
  if (esJefe !== true) return json(403, { ok: false, error: { codigo: 'solo_gerencia', mensaje: 'La carga de llaves es de gerencia.' } })

  let cfg
  try {
    cfg = configInterredes()
  } catch (e) {
    if (e instanceof InterredesSinCredenciales) {
      return json(200, { ok: false, error: { codigo: 'not_configured', mensaje: e.message }, faltan: e.faltan })
    }
    throw e
  }

  const controlNumber = `LLAVE${Date.now().toString(36).toUpperCase()}`.slice(0, 30)
  try {
    const r = await cargarLlaveInterredes(cfg, { controlNumber })
    console.log('interredes-llave:', { controlNumber, resultado: r.resultado, modo: cfg.modo })
    return json(200, { ok: r.aprobado, control_number: controlNumber, modo: cfg.modo, resultado: r, cuando: new Date().toISOString() })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error('interredes-llave:', controlNumber, mensaje)
    return json(502, { ok: false, control_number: controlNumber, error: { codigo: 'interredes_error', mensaje } })
  }
})
