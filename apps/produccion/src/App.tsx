import { useCallback, useEffect, useState } from 'react'
import {
  listarOrdenesDeProduccion,
  armarMoldes,
  entrarConPin,
  empleadoDeLaSesion,
  salirDeSesion,
  type OrdenDeProduccion,
  type ItemDeProduccion,
  type EmpleadoSesion,
} from '@lily/supabase'
import { CandadoDeEstacion } from '@lily/ui'
import { mensajeDeError, urlDeFoto } from '@lily/utils'
import { sb } from './lib/sb'

/**
 * La pantalla de producción: la **P** del camino C → P → H → E.
 *
 * Va colgada donde trabajan los panaderos. Muestra lo que gerencia mandó a
 * hacer y deja marcar **cuántos moldes van armados**. Lo armado pasa a la
 * pantalla del Horno, que es quien los mete, los vigila y los saca.
 *
 * Ojo con lo que cambió: aquí ya **no** entra nada al inventario. Un molde
 * armado es masa, no es pan. Si se contara aquí, la caja podría vender una
 * hojaldra que sigue cruda. El inventario sube cuando el pan SALE del horno.
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

/** Un renglón: un sabor y cuántos moldes van armados de los que se pidieron. */
function Renglon({
  item,
  ocupado,
  onMarcar,
}: {
  item: ItemDeProduccion
  ocupado: boolean
  onMarcar: (armados: number) => void
}) {
  const foto = urlDeFoto(item.imagen_url, import.meta.env.BASE_URL)
  const falta = Math.max(0, item.moldes - item.armados)
  const listo = falta === 0
  // No se puede desarmar lo que ya se fue al horno o ya salió de él.
  const piso = item.enHorno + item.horneados

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
          <p className="font-display text-2xl leading-tight text-sa-green-ink">{item.sabor}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mt-1">
            moldes de {item.molde} cuadros
          </p>
          {(item.enHorno > 0 || item.horneados > 0) && (
            <p className="font-body text-xs text-sa-green-ink/55 mt-1">
              {item.enHorno > 0 && `${item.enHorno} en el horno`}
              {item.enHorno > 0 && item.horneados > 0 && ' · '}
              {item.horneados > 0 && `${item.horneados} ya salieron`}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-4xl leading-none text-sa-green-ink">
            {item.armados}
            <span className="text-2xl text-sa-green-ink/35"> / {item.moldes}</span>
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
            {listo ? 'todo armado' : `faltan ${falta} molde${falta === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {[1, 2].map((n) => (
          <button
            key={n}
            disabled={ocupado}
            onClick={() => onMarcar(item.armados + n)}
            className="flex-1 h-14 rounded-sa bg-sa-green text-sa-cream font-display text-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            +{n} molde{n === 1 ? '' : 's'}
          </button>
        ))}
        {/* "Ya está" evita tener que sumar a mano hasta llegar al numero
            pedido, que es lo que se hace 9 de cada 10 veces. */}
        <button
          disabled={ocupado || listo}
          onClick={() => onMarcar(item.moldes)}
          className="flex-[1.4] h-14 rounded-sa bg-sa-green-deep text-sa-cream font-display text-lg active:scale-95 transition-transform disabled:opacity-30"
        >
          Ya está
        </button>
        <button
          disabled={ocupado || item.armados <= piso}
          onClick={() => onMarcar(Math.max(piso, item.armados - 1))}
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
  onMarcar: (item: ItemDeProduccion, armados: number) => void
}) {
  const total = orden.items.reduce((s, i) => s + i.moldes, 0)
  const hecho = orden.items.reduce((s, i) => s + Math.min(i.armados, i.moldes), 0)
  const pct = total > 0 ? Math.round((hecho / total) * 100) : 0

  return (
    <section className="bg-sa-cream-soft rounded-sa-lg p-5 shadow-sa">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <p className="font-display text-2xl text-sa-green-ink">Orden #{orden.folio}</p>
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">
          {hecho} de {total} moldes
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

  async function marcar(item: ItemDeProduccion, moldes: number) {
    setOcupado(item.id)
    // Se pinta de una vez para que el boton responda al dedo; si la base lo
    // rechaza, el cargar() de abajo deja la pantalla como esta de verdad.
    setOrdenes((antes) =>
      antes.map((o) => ({
        ...o,
        items: o.items.map((i) => (i.id === item.id ? { ...i, armados: moldes } : i)),
      })),
    )
    try {
      await armarMoldes(sb, item.id, moldes)
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

  if (!empleado)
    return (
      <CandadoDeEstacion
        estacion="Producción"
        logo={`${import.meta.env.BASE_URL}logo-negativo.png`}
        onEntrar={async (pin) => {
          const r = await entrarConPin(sb, pin)
          if (!r.ok || !r.empleado) return r.error ?? 'PIN incorrecto'
          setEmpleado(r.empleado)
          return null
        }}
      />
    )

  const pendientes = ordenes.reduce(
    (s, o) => s + o.items.reduce((x, i) => x + Math.max(0, i.moldes - i.armados), 0),
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
            {pendientes > 0
              ? `Faltan ${pendientes} molde${pendientes === 1 ? '' : 's'} por hacer`
              : 'Todo al día'}
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
