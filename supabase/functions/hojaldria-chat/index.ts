// Edge Function: hojaldria-chat
//
// El cerebro de **Hojaldr-IA**, el asistente de Admin. Recibe el chat del
// panel de gerencia, le pone el conocimiento de cómo opera Hojaldras Lily, y
// lo pasa a la API de Claude (Anthropic). Devuelve la respuesta.
//
// Reglas que se respetan a propósito:
//  - La API key vive SOLO aquí, como secreto de la Edge Function
//    (ANTHROPIC_API_KEY). Nunca en el repo, el navegador ni el chat.
//  - SOLO LEE la base, y solo por un canal cerrado: las funciones
//    `fn_ia_*`, que son `select` puro y exigen `fn_es_staff()`. No hay forma
//    de que escriba, borre ni cambie nada.
//  - Entra con la MISMA sesión del usuario (su JWT), así que la base lo trata
//    como la gerencia que ya entró a Admin (RLS aplica).
//  - Solo entra quien tiene sesión real (authenticated), no `anon`.
//  - Si no está la API key, contesta amable (todavía no configurada).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODELO = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5'
const MAX_MENSAJES = 20
const MAX_LARGO = 4000
const MAX_VUELTAS = 4 // tope de idas y vueltas con herramientas

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

/** Lee el rol del JWT sin tocar la base: solo decodifica el payload. */
function rolDelToken(auth: string | null): string | null {
  try {
    const token = (auth ?? '').replace(/^Bearer\s+/i, '')
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json).role ?? null
  } catch {
    return null
  }
}

/** La fecha de hoy en Mérida (YYYY-MM-DD), para que "hoy" signifique hoy. */
function hoyMerida(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Merida' })
}

// Las herramientas de SOLO LECTURA que el modelo puede usar. Cada una mapea a
// una función `fn_ia_*` de la base (select puro, gated por fn_es_staff).
const HERRAMIENTAS = [
  {
    name: 'buscar_folio',
    description:
      'Busca un folio de venta y dice en qué quedó: pagado (con qué método), cancelado, modificado, o si no existe (un hueco que nunca se cobró, o un folio que aún no llega). Úsala siempre que pregunten por un folio concreto, p. ej. "¿dónde quedó el folio 1375?".',
    input_schema: {
      type: 'object',
      properties: { folio: { type: 'integer', description: 'El número de folio a buscar.' } },
      required: ['folio'],
    },
  },
  {
    name: 'resumen_del_dia',
    description:
      'Da el total vendido, el número de folios y el desglose por método de pago de un día (ventas pagadas, sin canceladas). Úsala para "¿cuánto se vendió el día X?".',
    input_schema: {
      type: 'object',
      properties: {
        fecha: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD, hora de Mérida. Si no la dicen, usa la fecha de hoy que está en el sistema.',
        },
      },
      required: ['fecha'],
    },
  },
]

// deno-lint-ignore no-explicit-any
type Sb = any

/** Corre la herramienta contra la base, con la sesión del usuario. */
async function correrHerramienta(sb: Sb, nombre: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    if (nombre === 'buscar_folio') {
      const folio = Number(input.folio)
      if (!Number.isFinite(folio)) return { error: 'Folio inválido.' }
      const { data, error } = await sb.rpc('fn_ia_buscar_folio', { p_folio: Math.trunc(folio) })
      return error ? { error: error.message } : data
    }
    if (nombre === 'resumen_del_dia') {
      const fecha = String(input.fecha ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida (usa YYYY-MM-DD).' }
      const { data, error } = await sb.rpc('fn_ia_resumen_dia', { p_fecha: fecha })
      return error ? { error: error.message } : data
    }
    return { error: `Herramienta desconocida: ${nombre}` }
  } catch (e) {
    return { error: `No se pudo consultar: ${e instanceof Error ? e.message : 'error'}` }
  }
}

function conocimiento(): string {
  return `
Eres **Hojaldr-IA**, la asistente de la panadería **Hojaldras Lily** (Mérida,
Yucatán). Ayudas al personal de gerencia a resolver dudas de cómo usar el
sistema y de la operación diaria, y a consultar datos con tus herramientas.
Hablas en español de México, cálida, breve y clara. Usas 12 horas y hora de
Mérida. Hoy es ${hoyMerida()} (Mérida).

CONSULTAS DE DATOS: tienes herramientas de SOLO LECTURA. Úsalas en vez de
inventar; NUNCA te inventes un folio, un total ni una cifra.
- "¿dónde quedó el folio N?" → usa **buscar_folio**. Si contesta "hueco",
  explica con calma: es un folio que se empezó pero no se llegó a cobrar (o se
  revirtió); NO es una venta ni dinero perdido, solo un número que el contador
  no repite. Si "aun_no_existe", di que ese folio todavía no se emite.
- "¿cuánto se vendió el día X?" → usa **resumen_del_dia**.
Si te piden un dato en vivo para el que NO tienes herramienta (inventario de un
sabor, un encargo puntual, el corte abierto), NO lo inventes: di en qué pantalla
de Admin o de la Caja se ve.

Cómo funciona el sistema (para guiar):
- **Vender**: en la Caja (pos). Métodos: Efectivo, Terminal (tarjeta Banorte),
  Mixto, Transferencia, Inbursa (2ª terminal), Rappi. El total lo calcula el
  servidor.
- **Cobro con tarjeta**: pasa por el agente de Banorte en la PC (pinpad). Si la
  pinpad no está conectada, la caja avisa y se cobra a mano.
- **Abrir/cerrar caja**: en la Caja, "Abrir caja" contando el cajón; "Corte de
  caja" para cerrar. El corte sale en la térmica si hay una dada de alta.
- **Ticket no sale**: si hay térmica dada de alta, el trabajo se ve en Admin →
  Impresoras (dice si salió o falló). Si no hay térmica, el ticket va por el
  navegador: revisa que sea la impresora PREDETERMINADA de Windows.
- **Reimprimir un ticket**: Caja → ☰ Historial → Reimprimir. **Un corte**:
  Admin → Cortes de caja → Reimprimir en la térmica, o Imprimir/PDF.
- **Registro de cambios** (cancelaciones y modificaciones): Admin → Registro de
  cambios.
- **Encargos**: Caja → Encargos, o Admin → Almacén. Apartar NO descuenta
  inventario; descuenta al cobrar. Anticipo = abono parcial (no da nota);
  Cobrar = pasa al carrito y la nota sale al cubrir el total.
- **Inventario** (insumos): Admin → Inventario. Se cuenta en presentación
  (sacos, cubetas, cartones). Contar, Llegó mercancía, Qué comprar, Merma.
- **Producción**: Admin → Producción. El inventario sube cuando el HORNO saca,
  no cuando producción arma.
- **Precios y productos**: se editan en Costeos (Guardar, y "Mostrar en el
  kiosko" para publicar).
- **Rappi**: interruptor Mostrador/Rappi en la caja; no pide método (paga la
  plataforma), pide ID de pedido y de entrega.
- **Facturación**: Admin → Facturación (global diaria o a un cliente). Pan a
  IVA 0%.
- **Sin internet**: se sigue vendiendo (efectivo o terminal del banco); las
  ventas se registran solas al volver. No se cierra la caja con ventas sin
  registrar.

Cuando NO puedas resolver algo, o sea un problema técnico/una falla (algo roto,
un error raro), dilo con calma y ofrece **avisar a Nuvora** (el equipo que hace
el sistema). No prometas lo que no sabes. Sé breve: 2-5 frases, y pasos cortos
con viñetas cuando ayude.
`.trim()
}

// deno-lint-ignore no-explicit-any
type Bloque = any

async function anthropic(apiKey: string, mensajes: Bloque[]): Promise<Response> {
  return await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1024,
      system: conocimiento(),
      tools: HERRAMIENTAS,
      messages: mensajes,
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  // Solo personal con sesión real (no anon). El rol va dentro del JWT.
  const auth = req.headers.get('Authorization')
  const rol = rolDelToken(auth)
  if (rol !== 'authenticated') {
    return responder({ error: 'Solo el personal con sesión puede usar Hojaldr-IA.' }, 401)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return responder({
      reply:
        'Todavía no estoy conectada 🥐. Falta cargar mi llave (ANTHROPIC_API_KEY) en los secretos de Supabase. Avísale a Nuvora para encenderme.',
      sin_configurar: true,
    })
  }

  // Cliente que hereda la sesión del usuario: la base lo trata como la gerencia
  // que ya entró a Admin, y las fn_ia_* vuelven a verificar fn_es_staff().
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth ?? '' } }, auth: { persistSession: false } },
  )

  let entrantes: { role: string; content: string }[] = []
  try {
    const body = await req.json()
    entrantes = Array.isArray(body?.mensajes) ? body.mensajes : []
  } catch {
    return responder({ error: 'Cuerpo inválido' }, 400)
  }

  const mensajes: Bloque[] = entrantes
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-MAX_MENSAJES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LARGO) }))

  if (mensajes.length === 0 || mensajes[mensajes.length - 1].role !== 'user') {
    return responder({ error: 'Mándame un mensaje para ayudarte.' }, 400)
  }

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await anthropic(apiKey, mensajes)
      if (!r.ok) {
        const detalle = await r.text()
        console.error('Anthropic error', r.status, detalle)
        return responder({
          reply: 'Uy, me tropecé pensando 🥐. Inténtalo otra vez en un momento; si sigue, avísale a Nuvora.',
          error_modelo: true,
        })
      }
      const data = await r.json()
      const bloques: Bloque[] = data?.content ?? []

      if (data?.stop_reason === 'tool_use') {
        // El modelo pidió una o más consultas: córrelas y devuélvele el resultado.
        mensajes.push({ role: 'assistant', content: bloques })
        const resultados: Bloque[] = []
        for (const b of bloques) {
          if (b?.type !== 'tool_use') continue
          const salida = await correrHerramienta(sb, b.name, b.input ?? {})
          resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(salida) })
        }
        mensajes.push({ role: 'user', content: resultados })
        continue
      }

      // Respuesta final de texto.
      const texto = bloques
        .filter((b: { type?: string }) => b?.type === 'text')
        .map((b: { text?: string }) => b?.text ?? '')
        .join('\n')
        .trim()
      return responder({ reply: texto || 'No se me ocurre nada ahorita, perdón.' })
    }

    // Se acabaron las vueltas sin respuesta final.
    return responder({
      reply: 'Me enredé con la consulta 🥐. Intenta preguntármelo de otra forma; si sigue, avísale a Nuvora.',
    })
  } catch (e) {
    console.error('hojaldria-chat', e)
    return responder({
      reply: 'No pude contestar ahorita. Inténtalo de nuevo; si sigue, avísale a Nuvora.',
      error_red: true,
    })
  }
})
