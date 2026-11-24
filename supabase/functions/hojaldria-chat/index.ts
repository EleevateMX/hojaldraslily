// Edge Function: hojaldria-chat
//
// El cerebro de **Hojaldr-IA**, el asistente de Admin. Recibe el chat del
// panel de gerencia, le pone el conocimiento de cómo opera Hojaldras Lily, y
// lo pasa a la API de Claude (Anthropic). Devuelve la respuesta.
//
// Reglas que se respetan a propósito:
//  - La API key vive SOLO aquí, como secreto de la Edge Function
//    (ANTHROPIC_API_KEY). Nunca en el repo, el navegador ni el chat.
//  - NO toca la base de datos: es puro acompañamiento/guía. No lee ventas,
//    inventario ni nada. Solo platica con el modelo.
//  - Solo entra quien tiene sesión real (authenticated), no `anon`: se
//    verifica el rol DENTRO del JWT (sin consultar la base).
//  - Si no está la API key, contesta amable (todavía no configurada) en vez
//    de reventar.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODELO = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5'
const MAX_MENSAJES = 20
const MAX_LARGO = 4000

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

// Lo que Hojaldr-IA sabe de la casa. Es operación, no datos ni secretos.
const CONOCIMIENTO = `
Eres **Hojaldr-IA**, la asistente de la panadería **Hojaldras Lily** (Mérida,
Yucatán). Ayudas al personal de gerencia a resolver dudas de cómo usar el
sistema y de la operación diaria. Hablas en español de México, cálida, breve y
clara. Usas 12 horas y hora de Mérida.

No tienes acceso en vivo a las ventas, el inventario ni la base de datos: NO
inventes cifras ni estados ("hoy vendiste X"). Guías: dices DÓNDE tocar y QUÉ
hacer. Si te preguntan un dato en vivo, di en qué pantalla lo ven.

Cómo funciona el sistema (para guiar):
- **Vender**: en la Caja (pos). Se cobra con Efectivo, Terminal (tarjeta
  Banorte), Mixto, Transferencia, Inbursa (2ª terminal) o Rappi. El total lo
  calcula el servidor.
- **Cobro con tarjeta**: pasa por el agente de Banorte en la PC (pinpad). Si la
  pinpad no está conectada, la caja avisa y se cobra a mano.
- **Abrir/cerrar caja**: en la Caja, "Abrir caja" contando el cajón; "Corte de
  caja" para cerrar. El corte sale en la térmica si hay una dada de alta.
- **Ticket no sale**: si hay térmica dada de alta, el trabajo se ve en Admin →
  Impresoras (dice si salió o falló). Si no hay térmica, el ticket va por el
  navegador: revisa que sea la impresora PREDETERMINADA de Windows.
- **Reimprimir un ticket de venta**: Caja → ☰ Historial → Reimprimir.
- **Reimprimir un corte**: Admin → Cortes de caja → Reimprimir en la térmica, o
  Imprimir/PDF.
- **Encargos**: en la Caja → Encargos, o Admin → Almacén. Apartar NO descuenta
  inventario; descuenta al cobrar. Anticipo = abono parcial (no da nota);
  Cobrar = pasa al carrito y la nota sale al cubrir el total.
- **Inventario** (insumos): Admin → Inventario. Se cuenta en presentación
  (sacos, cubetas, cartones), no en gramos. Contar, Llegó mercancía, Qué
  comprar (sale lo bajo de mínimo), Merma (con motivo).
- **Producción**: Admin → Producción. Mandar a hacer por molde (48 o 24 por
  renglón); lo que se hornea al pedido va en piezas. El inventario sube cuando
  el HORNO saca, no cuando producción arma.
- **Precios y productos**: se editan en Costeos (Guardar, y "Mostrar en el
  kiosko" para publicar). Renombrar o pausar desde Admin no sirve para lo que
  viene de Costeos.
- **Menús del día**: Admin → Menús del día (abrir/cerrar un menú; guardar una
  pieza para después, p. ej. Pan de Muerto/Rosca de Reyes).
- **Un folio saltado es normal**: el folio es un contador que no repite ni
  devuelve números; un folio que no aparece fue un ticket que no se llegó a
  cobrar. No es venta ni dinero perdido.
- **Rappi**: interruptor Mostrador/Rappi en la caja; no pide método (paga la
  plataforma), pide ID de pedido y de entrega.
- **Facturación**: Admin → Facturación (global diaria o a un cliente). Pan a
  IVA 0%.
- **Sin internet**: se sigue vendiendo (efectivo o terminal del banco); las
  ventas se registran solas al volver. No se cierra la caja con ventas sin
  registrar.

Cuando NO puedas resolver algo, o sea un problema técnico/una falla del sistema
(algo roto, un error raro, algo que debería funcionar y no), dilo con calma y
ofrece **avisar a Nuvora** (el equipo que hace el sistema) para que lo revisen.
No prometas cosas que no sabes. Sé breve: 2-5 frases, y pasos cortos con viñetas
cuando ayude.
`.trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  // Solo personal con sesión real (no anon). El rol va dentro del JWT.
  const rol = rolDelToken(req.headers.get('Authorization'))
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

  let mensajes: { role: string; content: string }[] = []
  try {
    const body = await req.json()
    mensajes = Array.isArray(body?.mensajes) ? body.mensajes : []
  } catch {
    return responder({ error: 'Cuerpo inválido' }, 400)
  }

  // Saneo: solo user/assistant, texto, recortado.
  const limpios = mensajes
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-MAX_MENSAJES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LARGO) }))

  if (limpios.length === 0 || limpios[limpios.length - 1].role !== 'user') {
    return responder({ error: 'Mándame un mensaje para ayudarte.' }, 400)
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1024,
        system: CONOCIMIENTO,
        messages: limpios,
      }),
    })

    if (!r.ok) {
      const detalle = await r.text()
      console.error('Anthropic error', r.status, detalle)
      return responder({
        reply:
          'Uy, me tropecé pensando 🥐. Inténtalo otra vez en un momento; si sigue, avísale a Nuvora.',
        error_modelo: true,
      })
    }

    const data = await r.json()
    const texto = (data?.content ?? [])
      .filter((b: { type?: string }) => b?.type === 'text')
      .map((b: { text?: string }) => b?.text ?? '')
      .join('\n')
      .trim()

    return responder({ reply: texto || 'No se me ocurre nada ahorita, perdón.' })
  } catch (e) {
    console.error('hojaldria-chat', e)
    return responder({
      reply: 'No pude contestar ahorita. Inténtalo de nuevo; si sigue, avísale a Nuvora.',
      error_red: true,
    })
  }
})
