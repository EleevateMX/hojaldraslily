import { useState, type ReactNode } from 'react'

/**
 * El candado de PIN de las pantallas del local.
 *
 * Lo comparten Producción, Horno y Empaque. Estaba copiado en cada app y solo
 * cambiaba el nombre de la estación; con la tercera pantalla eso ya eran tres
 * lugares donde arreglar el mismo teclado.
 *
 * Por qué hay candado y no una pantalla abierta: lo que se marca en estas
 * pantallas **mueve inventario**. Sacar del horno mete pan a las existencias
 * y entregar un encargo cobra dinero. Eso lo hace personal identificado, no
 * una pantalla anónima colgada en la pared.
 *
 * Diseño para pantalla táctil, de pie y con las manos ocupadas: teclas de
 * 80 px, sin campos de texto, sin menús, y el error se lee de lejos.
 */
export function CandadoDeEstacion({
  estacion,
  onEntrar,
  logo,
  subtitulo = 'Marque su PIN para empezar',
}: {
  /** El nombre que se lee arriba: «Horno», «Empaque», «Producción». */
  estacion: string
  /** Devuelve el error a mostrar, o null si entró. */
  onEntrar: (pin: string) => Promise<string | null>
  /** Ruta del logotipo. Sobre carmín pleno va el negativo (CLAUDE.md §2.5). */
  logo: string
  subtitulo?: ReactNode
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(valor: string) {
    if (valor.length < 4 || entrando) return
    setEntrando(true)
    setError(null)
    const fallo = await onEntrar(valor)
    setPin('')
    setError(fallo)
    setEntrando(false)
  }

  const tecla =
    'h-20 rounded-sa-lg bg-sa-cream/10 hover:bg-sa-cream/20 active:scale-95 font-display text-3xl transition-all'

  return (
    <div className="min-h-screen bg-sa-green-deep flex flex-col items-center justify-center p-6 text-sa-cream">
      <img src={logo} alt="Hojaldras Lily" className="w-[200px] h-auto mb-6 drop-shadow-2xl" />
      <p className="font-display text-3xl mb-1">{estacion}</p>
      <p className="font-body text-sa-cream/70 mb-8">{subtitulo}</p>

      <div className="font-mono text-4xl tracking-[0.4em] h-12 mb-6">{'•'.repeat(pin.length)}</div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} onClick={() => setPin((p) => (p + n).slice(0, 6))} className={tecla}>
            {n}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="h-20 rounded-sa-lg bg-sa-cream/5 font-mono text-sm uppercase tracking-wide active:scale-95"
        >
          Borrar
        </button>
        <button onClick={() => setPin((p) => (p + '0').slice(0, 6))} className={tecla}>
          0
        </button>
        <button
          onClick={() => void entrar(pin)}
          disabled={pin.length < 4 || entrando}
          className="h-20 rounded-sa-lg bg-sa-cream text-sa-green-deep font-display text-xl active:scale-95 disabled:opacity-40 transition-all"
        >
          Entrar
        </button>
      </div>

      {error && (
        <p className="mt-6 font-body text-sa-strawberry bg-sa-cream/10 rounded-sa px-4 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
