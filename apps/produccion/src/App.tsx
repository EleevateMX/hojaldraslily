import { useCallback, useEffect, useState } from 'react'
import {
  listarOrdenesDeProduccion,
  avanzarProduccion,
  partirNombreDeVenta,
  entrarConPin,
  empleadoDeLaSesion,
  salirDeSesion,
  type OrdenDeProduccion,
  type ItemDeProduccion,
  type EmpleadoSesion,
} from '@shake/supabase'
import { mensajeDeError, urlDeFoto } from '@shake/utils'
import { sb } from './lib/sb'

/**
 * La pantalla de producción.
 *
 * Va colgada donde trabaja la gente que hornea. Muestra lo que gerencia mandó
 * a hacer y deja marcar cuánto va saliendo; **lo que se marca entra solo al
 * inventario**, sin que nadie lo capture otra vez en otro lado.
 *
 * Está pensada para usarse con las manos ocupadas y de lejos: números
 * grandes, botones grandes, y una sola pregunta por renglón — «¿cuántas
 * llevas?». Nada de menús ni de escribir.
 *
 * Entra con PIN y no suelta la sesión sola: marcar producción escribe en el
 * inventario, y eso lo hace personal identificado, no una pantalla anónima.
 * (Las estaciones de comandas todavía corren sin sesión; esa es la deuda que
 * queda anotada en CLAUDE.md.)
 */

const REFRESCO_MS = 20000

function Candado({ onEntra }: { onEntra: (e: EmpleadoSesion) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(valor: string) {
    if (valor.length < 4 || entrando) return
    setEntrando(true)
    setError(null)
    const r = await entrarConPin(sb, valor)
    setPin('')
    if (!r.ok || !r.empleado) setError(r.error ?? 'PIN incorrecto')
    else onEntra(r.empleado)
    setEntrando(false)
  }

  return (
    <div className="min-h-screen bg-sa-green-deep flex flex-col items-center justify-center p-6 text-sa-cream">
      <img
        src={`${import.meta.env.BASE_URL}logo-negativo.png`}
        alt="Hojaldras Lily"
        className="w-[200px] h-auto mb-6 drop-shadow-2xl"
      />
      <p className="font-display text-3xl mb-1">Producción</p>
      <p className="font-body text-sa-cream/70 mb-8">Marque su PIN para empezar</p>

      <div className="font-mono text-4xl tracking-[0.4em] h-12 mb-6">
        {'•'.repeat(pin.length)}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button
            key={n}
            onClick={() => setPin((p) => (p + n).slice(0, 6))}
            className="h-20 rounded-sa-lg bg-sa-cream/10 hover:bg-sa-cream/20 active:scale-95 font-display text-3xl transition-all"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="h-20 rounded-sa-lg bg-sa-cream/5 font-mono text-sm uppercase tracking-wide active:scale-95"
        >
          Borrar
        </button>
        <button
          onClick={() => setPin((p) => (p + '0').slice(0, 6))}
          className="h-20 rounded-sa-lg bg-sa-cream/10 hover:bg-sa-cream/20 active:scale-95 font-display text-3xl transition-all"
        >
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

/** Un renglón: un sabor y cuántas llevan hechas de las que se pidieron. */
function Renglon({
  item,
  ocupado,
  onMarcar,
}: {
  item: ItemDeProduccion
  ocupado: boolean
  onMarcar: (hechas: number) => void
}) {
  const { sabor, medida } = partirNombreDeVenta(item.producto)
  const foto = urlDeFoto(item.imagen_url, import.meta.env.BASE_URL)
  const falta = Math.max(0, item.cantidad_pedida - item.cantidad_hecha)
  const listo = falta === 0

  return (
    <div
      className={[
        'rounded-sa-lg border-2 p-5 transition-colors',
        listo ? 'bg-sa-mint/10 border-sa-mint/50' : 'bg-white border-sa-green-ink/10',
      ].join(' ')}
    >
      <div className="flex items-center gap-4">
        {foto && <img src={foto} alt="" className="w-16 h-16 object-contain shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-tight text-sa-green-ink">{sabor}</p>
          {medida && (
            <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mt-1">
              {medida}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-4xl leading-none text-sa-green-ink">
            {item.cantidad_hecha}
            <span className="text-2xl text-sa-green-ink/35"> / {item.cantidad_pedida}</span>
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
            {listo ? '¡listo!' : `faltan ${falta}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {[1, 5, 10].map((n) => (
          <button
            key={n}
            disabled={ocupado}
            onClick={() => onMarcar(item.cantidad_hecha + n)}
            className="flex-1 h-14 rounded-sa bg-sa-green text-sa-cream font-display text-xl active:scale-95 transition-transform disabled:opacity-50"
          >
            +{n}
          </button>
        ))}
        {/* "Ya está" evita tener que sumar a mano hasta llegar al numero
            pedido, que es lo que se hace 9 de cada 10 veces. */}
        <button
          disabled={ocupado || listo}
          onClick={() => onMarcar(item.cantidad_pedida)}
          className="flex-[1.4] h-14 rounded-sa bg-sa-green-deep text-sa-cream font-display text-lg active:scale-95 transition-transform disabled:opacity-30"
        >
          Ya está
        </button>
        <button
          disabled={ocupado || item.cantidad_hecha === 0}
          onClick={() => onMarcar(Math.max(0, item.cantidad_hecha - 1))}
          className="w-14 h-14 rounded-sa border-2 border-sa-green-ink/15 text-sa-green-ink/60 font-display text-2xl active:scale-95 transition-transform disabled:opacity-25"
          title="Me pasé, quitar uno"
        >
          −
        </button>
      </div>
    </div>
  )
}

function Tarjeta({
  orden,
  ocupado,
  onMarcar,
}: {
  orden: OrdenDeProduccion
  ocupado: string | null
  onMarcar: (item: ItemDeProduccion, hechas: number) => void
}) {
  const total = orden.items.reduce((s, i) => s + i.cantidad_pedida, 0)
  const hecho = orden.items.reduce((s, i) => s + Math.min(i.cantidad_hecha, i.cantidad_pedida), 0)
  const pct = total > 0 ? Math.round((hecho / total) * 100) : 0

  return (
    <section className="bg-sa-cream-soft rounded-sa-lg p-5 shadow-sa">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <p className="font-display text-2xl text-sa-green-ink">Orden #{orden.folio}</p>
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">
          {hecho} de {total}
        </p>
      </div>
      {orden.nota && (
        <p className="font-body text-sm text-sa-green-ink/70 mb-2">{orden.nota}</p>
      )}

      {/* Una barra, no un porcentaje suelto: de lejos se ve cuanto falta. */}
      <div className="h-2 rounded-full bg-sa-green-ink/10 overflow-hidden mb-4">
        <div className="h-full bg-sa-green transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="space-y-3">
        {orden.items.map((i) => (
          <Renglon
            key={i.id}
            item={i}
            ocupado={ocupado === i.id}
            onMarcar={(h) => onMarcar(i, h)}
          />
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  const [revisando, setRevisando] = useState(true)
  const [ordenes, setOrdenes] = useState<OrdenDeProduccion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setEmpleado(await empleadoDeLaSesion(sb))
      setRevisando(false)
    })()
  }, [])

  const cargar = useCallback(async (conSpinner = false) => {
    if (conSpinner) setCargando(true)
    try {
      setOrdenes(await listarOrdenesDeProduccion(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (!empleado) return
    void cargar(true)
    // Se relee sola: gerencia manda a hacer desde su teléfono y esto tiene que
    // aparecer aquí sin que nadie vaya a recargar la pantalla.
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [empleado, cargar])

  async function marcar(item: ItemDeProduccion, hechas: number) {
    setOcupado(item.id)
    // Se pinta de una vez para que el boton responda al dedo; si la base lo
    // rechaza, el cargar() de abajo deja la pantalla como esta de verdad.
    setOrdenes((antes) =>
      antes.map((o) => ({
        ...o,
        items: o.items.map((i) => (i.id === item.id ? { ...i, cantidad_hecha: hechas } : i)),
      })),
    )
    try {
      await avanzarProduccion(sb, item.id, hechas)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      await cargar()
      setOcupado(null)
    }
  }

  if (revisando) {
    return (
      <div className="min-h-screen grid place-items-center bg-sa-cream-paper">
        <p className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/50">
          Un momento…
        </p>
      </div>
    )
  }

  if (!empleado) return <Candado onEntra={setEmpleado} />

  const pendientes = ordenes.reduce(
    (s, o) => s + o.items.reduce((x, i) => x + Math.max(0, i.cantidad_pedida - i.cantidad_hecha), 0),
    0,
  )

  return (
    <div className="min-h-screen bg-sa-cream-paper text-sa-green-ink">
      <header className="bg-sa-green-deep text-sa-cream px-6 py-5 flex items-center gap-5">
        <img
          src={`${import.meta.env.BASE_URL}logo-negativo.png`}
          alt="Hojaldras Lily"
          className="h-16 w-auto"
        />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">
            Producción
          </p>
          <h1 className="font-display text-4xl leading-none mt-1">
            {pendientes > 0 ? `Faltan ${pendientes} por hacer` : 'Todo al día'}
          </h1>
        </div>
        <button
          onClick={() => void salirDeSesion(sb).then(() => setEmpleado(null))}
          className="shrink-0 font-mono text-xs uppercase tracking-wide bg-sa-cream/10 hover:bg-sa-cream/20 rounded-full px-4 py-2 transition-colors"
        >
          {empleado.nombre} · Salir
        </button>
      </header>

      <main className="p-6 space-y-5 max-w-5xl mx-auto">
        {error && (
          <p className="font-body bg-sa-strawberry/15 border-l-4 border-sa-strawberry rounded-sa px-4 py-3">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/45 text-center py-16">
            Cargando…
          </p>
        ) : ordenes.length === 0 ? (
          <div className="text-center py-20">
            <img
              src={`${import.meta.env.BASE_URL}hojaldra.png`}
              alt=""
              className="h-32 mx-auto opacity-70 mb-5"
            />
            <p className="font-display text-3xl">No hay nada pendiente</p>
            <p className="font-body text-sa-green-ink/60 mt-2 max-w-sm mx-auto">
              Cuando gerencia mande a hacer algo, aparece aquí solo. No hace
              falta recargar.
            </p>
          </div>
        ) : (
          ordenes.map((o) => (
            <Tarjeta key={o.id} orden={o} ocupado={ocupado} onMarcar={marcar} />
          ))
        )}
      </main>
    </div>
  )
}
