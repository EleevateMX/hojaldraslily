// Edge Function: interredes-probar
//
// ¿Contesta la API de Interredes desde donde la va a llamar la caja? Es la
// pregunta que no se puede contestar desde una PC cualquiera —el navegador
// de Windows acepta el certificado incompleto del servidor y Deno no—, así
// que se contesta desde aquí, que es el mismo sitio desde el que cobraría
// `interredes-cobrar` el día que exista.
//
// Hace dos intentos de `POST /login` y cuenta qué pasó con cada uno:
//
//   - `a_secas`: un `fetch()` normal. Hoy rebota por el certificado; si un
//     día pasa, es que TPV Solutions arregló su cadena y el pin sobra.
//   - `con_intermedio`: con el cliente de `_shared/interredes.ts`. Es el
//     camino que usaría el cobro.
//
// Con qué credenciales: las de los secrets (`INTERREDES_API_USER` /
// `INTERREDES_API_PASSWORD`) si están puestas; si no, unas falsas. Con las
// falsas, un 401 ya es la respuesta buena: quiere decir que la API está
// viva y leyó el JSON. Con las de verdad, `token: true` es «entramos».
//
// Nunca devuelve ni las credenciales ni el token: solo si hubo.

import { corsHeaders } from '../_shared/cors.ts'
import {
  INTERREDES_BASE,
  InterredesSinCredenciales,
  credencialesInterredes,
  loginInterredes,
  secretosQueFaltan,
} from '../_shared/interredes.ts'

interface Intento {
  ok: boolean
  http?: number
  token?: boolean
  mensaje?: string | null
  error?: string
}

async function aSecas(username: string, password: string): Promise<Intento> {
  try {
    const r = await fetch(`${INTERREDES_BASE}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const texto = (await r.text()).slice(0, 300)
    return { ok: true, http: r.status, token: texto.includes('"token"'), mensaje: texto }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

async function conIntermedio(username: string, password: string): Promise<Intento> {
  try {
    const r = await loginInterredes(username, password)
    return { ok: true, http: r.http, token: r.token !== null, mensaje: r.mensaje }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let username = 'prueba'
  let password = 'prueba'
  let credenciales: 'secrets' | 'falsas' = 'falsas'
  try {
    ;({ username, password } = credencialesInterredes())
    credenciales = 'secrets'
  } catch (e) {
    if (!(e instanceof InterredesSinCredenciales)) throw e
  }

  const [a_secas, con_intermedio] = await Promise.all([
    aSecas(username, password),
    conIntermedio(username, password),
  ])

  // Entrar no es cobrar: para la venta hacen falta además las credenciales
  // de Payworks, la serie de la pinpad, el grupo y el modo. Se dice cuáles
  // faltan, nunca sus valores.
  const faltan_para_cobrar = secretosQueFaltan()

  return new Response(
    JSON.stringify({
      base: INTERREDES_BASE, credenciales, a_secas, con_intermedio, faltan_para_cobrar, cuando: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
