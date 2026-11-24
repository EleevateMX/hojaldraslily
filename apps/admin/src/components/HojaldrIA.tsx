import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/sb'

/**
 * Hojaldr-IA — la asistente de la casa, solo en Admin.
 *
 * Es una burbuja flotante que abre un chat. Platica con el personal de
 * gerencia, le ayuda a resolver dudas de cómo opera el sistema y, si no puede,
 * ofrece **avisar a Nuvora**.
 *
 * Reglas que respeta a propósito:
 *  - NO toca la base de datos. No lee ventas ni inventario: es guía, no datos.
 *    Todo el cerebro vive en la Edge Function `hojaldria-chat`, que es la única
 *    que conoce la llave de Anthropic (nunca el navegador).
 *  - Entra con la sesión que ya tiene Admin (el candado de PIN). La Edge
 *    Function exige `authenticated`, así que `anon` no la puede usar.
 *  - El contacto de Nuvora para el aviso vive en `.env`
 *    (VITE_NUVORA_WHATSAPP), no en el repo: es dato de la casa, no código.
 */

type Mensaje = { role: 'user' | 'assistant'; content: string }

const SALUDO =
  '¡Hola! Soy Hojaldr-IA 🥐 Te ayudo con dudas del sistema: cómo cobrar, un ticket que no sale, dónde está algo en Admin… Pregúntame lo que sea. Si no puedo, le aviso a Nuvora.'

/** Número de WhatsApp de Nuvora para el aviso (sin +, p. ej. 529991234567). */
const NUVORA_WA: string = (import.meta.env.VITE_NUVORA_WHATSAPP as string | undefined) ?? ''

function enlaceAviso(mensajes: Mensaje[]): string {
  const ultimaDuda = [...mensajes].reverse().find((m) => m.role === 'user')?.content ?? ''
  const texto = `Hola Nuvora, necesito apoyo con Hojaldras Lily.\n\nLo que pasa: ${ultimaDuda}`.slice(0, 1500)
  const base = NUVORA_WA ? `https://wa.me/${NUVORA_WA}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(texto)}`
}

/**
 * `abiertoInicial` y `mensajesIniciales` son solo para el arnés de `mirar/`:
 * dejan ver el panel abierto con una charla de ejemplo sin pegarle al
 * servidor. En la app van vacíos.
 */
export default function HojaldrIA({
  abiertoInicial = false,
  mensajesIniciales = [],
}: {
  abiertoInicial?: boolean
  mensajesIniciales?: Mensaje[]
} = {}) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [mensajes, setMensajes] = useState<Mensaje[]>(mensajesIniciales)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, pensando, abierto])

  async function enviar() {
    const limpio = texto.trim()
    if (!limpio || pensando) return
    const nuevos: Mensaje[] = [...mensajes, { role: 'user', content: limpio }]
    setMensajes(nuevos)
    setTexto('')
    setPensando(true)
    try {
      const { data, error } = await sb.functions.invoke('hojaldria-chat', {
        body: { mensajes: nuevos },
      })
      const reply =
        (data as { reply?: string } | null)?.reply ??
        (error
          ? 'No pude contestar ahorita. Inténtalo de nuevo; si sigue, avísale a Nuvora.'
          : 'No se me ocurre nada ahorita, perdón.')
      setMensajes((m) => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMensajes((m) => [
        ...m,
        { role: 'assistant', content: 'No pude contestar ahorita. Revisa tu internet e inténtalo de nuevo.' },
      ])
    } finally {
      setPensando(false)
    }
  }

  return (
    <>
      {/* Burbuja. Va arriba de la pastilla de "Salir" (bottom-3 right-3). */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Hojaldr-IA, la asistente"
        className="fixed bottom-16 right-3 z-[60] flex items-center gap-2 bg-sa-green hover:bg-sa-green-deep text-sa-cream rounded-full pl-3 pr-4 py-2.5 shadow-sa-sm transition-colors"
      >
        <span aria-hidden className="text-lg leading-none">🥐</span>
        <span className="font-display text-sm">Hojaldr-IA</span>
      </button>

      {abierto && (
        <div className="fixed bottom-28 right-3 z-[60] w-[min(92vw,22rem)] h-[min(70vh,34rem)] flex flex-col bg-sa-cream-paper rounded-sa-lg shadow-xl border border-sa-green-ink/10 overflow-hidden">
          {/* Cabecera */}
          <div className="flex items-center justify-between bg-sa-green text-sa-cream px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-lg leading-none">🥐</span>
              <div className="leading-tight">
                <p className="font-display text-sm">Hojaldr-IA</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-sa-cream/70">Asistente de la casa</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
              className="text-sa-cream/80 hover:text-sa-cream text-lg leading-none px-1"
            >
              ✕
            </button>
          </div>

          {/* Conversación */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            <Burbuja role="assistant">{SALUDO}</Burbuja>
            {mensajes.map((m, i) => (
              <Burbuja key={i} role={m.role}>
                {m.content}
              </Burbuja>
            ))}
            {pensando && (
              <Burbuja role="assistant">
                <span className="inline-flex gap-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse [animation-delay:150ms]">●</span>
                  <span className="animate-pulse [animation-delay:300ms]">●</span>
                </span>
              </Burbuja>
            )}
            <div ref={finRef} />
          </div>

          {/* Avisar a Nuvora */}
          <div className="px-3 pb-2 shrink-0">
            <a
              href={enlaceAviso(mensajes)}
              target="_blank"
              rel="noreferrer"
              className="block text-center font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60 hover:text-sa-green py-1"
            >
              ¿Sigue sin resolverse? Avísale a Nuvora →
            </a>
          </div>

          {/* Entrada */}
          <div className="flex items-end gap-2 border-t border-sa-green-ink/10 p-3 shrink-0 bg-white">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void enviar()
                }
              }}
              rows={1}
              placeholder="Escribe tu duda…"
              className="flex-1 resize-none max-h-24 px-3 py-2 border border-sa-green-ink/15 rounded-sa text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sa-green/40"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!texto.trim() || pensando}
              className="bg-sa-green hover:bg-sa-green-deep text-sa-cream px-4 py-2 rounded-sa font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-default shrink-0"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function Burbuja({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const esUsuario = role === 'user'
  return (
    <div className={`flex ${esUsuario ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-sa text-sm whitespace-pre-wrap leading-relaxed ${
          esUsuario ? 'bg-sa-green text-sa-cream' : 'bg-white text-sa-green-ink border border-sa-green-ink/10'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
