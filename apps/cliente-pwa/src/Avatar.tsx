import { useRef, useState } from 'react'
import { guardarMiFoto, subirImagen } from '@shake/supabase'
import { sb } from './lib/sb'

/**
 * La cara del cliente.
 *
 * Google ya manda la foto en el token, asi que la tarjeta deja de verse
 * anonima sin que el cliente suba nada. Si no hay foto — porque entro con
 * una cuenta sin imagen, o porque la subida fallo — se pintan sus
 * iniciales sobre el verde de la marca, que se ve intencional; un icono
 * gris de "persona sin foto" se ve roto.
 */
export function Avatar({
  foto, nombre, tam = 40,
}: {
  foto: string | null
  nombre: string
  tam?: number
}) {
  const [rota, setRota] = useState(false)

  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '·'

  const estilo = { width: tam, height: tam }

  if (foto && !rota) {
    return (
      <img
        src={foto}
        alt=""
        style={estilo}
        onError={() => setRota(true)}
        className="shrink-0 rounded-full object-cover bg-sa-green ring-2 ring-sa-cream/20"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <span
      style={{ ...estilo, fontSize: Math.round(tam * 0.38) }}
      className="shrink-0 rounded-full bg-sa-green text-sa-cream ring-2 ring-sa-cream/20 flex items-center justify-center font-display leading-none"
      aria-hidden="true"
    >
      {iniciales}
    </span>
  )
}

/**
 * Cambiar la foto, desde la pestana Cuenta.
 *
 * Al subir una propia queda marcada como tal en la base, para que el
 * siguiente login de Google no le pise su eleccion. "Usar la de Google"
 * deshace eso.
 */
export function CambiarFoto({
  foto, nombre, propia, alCambiar,
}: {
  foto: string | null
  nombre: string
  propia: boolean
  alCambiar: () => void
}) {
  const archivo = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function subir(f: File) {
    setOcupado(true)
    setError(null)
    try {
      const url = await subirImagen(sb, 'avatares', f)
      await guardarMiFoto(sb, url)
      alCambiar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setOcupado(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  async function volverAGoogle() {
    setOcupado(true)
    setError(null)
    try {
      await guardarMiFoto(sb, null)
      alCambiar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <h2 className="font-display text-lg text-sa-green mb-3">Tu foto</h2>
      <div className="flex items-center gap-4">
        <Avatar foto={foto} nombre={nombre} tam={64} />
        <div className="min-w-0 flex-1 space-y-2">
          <button
            onClick={() => archivo.current?.click()}
            disabled={ocupado}
            className="w-full rounded-sa bg-sa-green text-sa-cream font-display text-base py-2.5 disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {ocupado ? 'Subiendo…' : 'Cambiar foto'}
          </button>
          {propia && (
            <button
              onClick={() => void volverAGoogle()}
              disabled={ocupado}
              className="w-full rounded-sa border border-sa-green-ink/15 font-mono text-xs uppercase tracking-wide py-2 disabled:opacity-40"
            >
              Usar la de Google
            </button>
          )}
        </div>
      </div>
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void subir(f)
        }}
      />
      {error && <p className="text-sa-strawberry text-xs mt-2 leading-snug">{error}</p>}
    </section>
  )
}
