import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarOrdenesDeProduccion,
  listarEncargos,
  suscribirProduccion,
  armarMoldes,
  apuntarMasas,
  entrarConPin,
  empleadoDeLaSesion,
  salirDeSesion,
  vigilarSesion,
  type OrdenDeProduccion,
  type ItemDeProduccion,
  type EmpleadoSesion,
  type Encargo,
} from '@lily/supabase'
import { CandadoDeEstacion } from '@lily/ui'
import { mensajeDeError, crearPaciencia } from '@lily/utils'
import { Tarjeta, EncargosPorHora, ordenesPorDia } from './vista'
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

/**
 * Cada 10 segundos.
 *
 * Lo pidió la casa así —«al sacarlo del horno se actualiza como a los 10s»— y
 * es el ritmo del mostrador: quien saca una charola grita «ya salió la
 * guayaba» y el cajero mira su pantalla ahí mismo. Con medio minuto, la caja
 * sigue diciendo que no hay pan mientras el pan está en la mesa, y el cajero
 * deja de creerle a la pantalla — que es el daño que no se arregla subiendo
 * el número después.
 */
const REFRESCO_MS = 10000

export default function App() {
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  const [revisando, setRevisando] = useState(true)
  const [ordenes, setOrdenes] = useState<OrdenDeProduccion[]>([])
  // Los encargos de hoy, para decir «¿qué hay que tener antes de las 12?».
  // Se tragan su propio error: la mesa tiene que poder marcar moldes aunque
  // esa consulta falle.
  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setEmpleado(await empleadoDeLaSesion(sb))
      setRevisando(false)
    })()
  }, [])

  // Una relectura que falla al volver del bloqueo (el WiFi reconectando, el
  // token renovándose en ese instante) no se pinta: se vuelve a intentar a
  // los 10 s. Solo se enseña el error cuando lleva un rato sin una buena.
  const paciencia = useRef(crearPaciencia())
  const cargar = useCallback(async (conSpinner = false) => {
    if (conSpinner) setCargando(true)
    try {
      const [o, e] = await Promise.all([
        listarOrdenesDeProduccion(sb),
        listarEncargos(sb).catch(() => [] as Encargo[]),
      ])
      setOrdenes(o)
      setEncargos(e)
      setError(null)
      paciencia.current.bien()
    } catch (e) {
      if (paciencia.current.seAcabo()) setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  // Al desbloquear la tableta: renovar el token, releer, y si la sesión ya no
  // está, volver al PIN.
  useEffect(
    () => vigilarSesion(sb, { alVolver: () => void cargar(), alSalir: () => setEmpleado(null) }),
    [cargar],
  )

  useEffect(() => {
    if (!empleado) return
    void cargar(true)
    // Se relee sola: gerencia manda a hacer desde su teléfono y esto tiene que
    // aparecer aquí sin que nadie vaya a recargar la pantalla. En vivo cuando
    // algo cambia, y cada 10 s por si el canal se cae.
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    const off = suscribirProduccion(sb, () => void cargar())
    return () => {
      clearInterval(t)
      off()
    }
  }, [empleado, cargar])

  async function apuntar(item: ItemDeProduccion, masas: number | null) {
    setOcupado(item.id)
    setOrdenes((antes) =>
      antes.map((o) => ({
        ...o,
        items: o.items.map((i) => (i.id === item.id ? { ...i, masas } : i)),
      })),
    )
    try {
      await apuntarMasas(sb, item.id, masas)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      await cargar()
      setOcupado(null)
    }
  }

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

  const dias = ordenesPorDia(ordenes)
  const vencidos = dias.filter((d) => d.vencido).reduce((s, d) => s + d.faltan, 0)
  const deHoy = dias.filter((d) => d.hoy).reduce((s, d) => s + d.faltan, 0)
  const pendientes = dias.reduce((s, d) => s + d.faltan, 0)

  // Un solo titular, y el más urgente: lo que se quedó de días pasados duele
  // antes que lo de hoy, y lo de hoy antes que lo del sábado. Si dijera las
  // tres cifras a la vez, de lejos no se leería ninguna.
  const titular =
    vencidos > 0
      ? `Se quedaron ${vencidos} de antes`
      : deHoy > 0
        ? `Faltan ${deHoy} por hacer hoy`
        : pendientes > 0
          ? `Hoy nada · ${pendientes} para después`
          : 'Todo al día'

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
          <h1 className="font-display text-4xl leading-none mt-1">{titular}</h1>
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

        {/* Lo encargado para hoy, por hora: es lo que decide qué se arma
            primero. Va antes de las órdenes porque una orden sin hora se
            puede hacer cuando sea; un encargo de las 12 no. */}
        {!cargando && <EncargosPorHora encargos={encargos} />}

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
          dias.map((d) => (
            <section key={d.fecha} className="space-y-5">
              {/* El separador del día. Lo que se quedó de antes va en carmín
                  profundo, que es el color de la alarma de la casa: el acento
                  rosa se ve despintado a un metro (§4). */}
              <div className="flex items-baseline gap-3 pt-1">
                <h2
                  className={[
                    'font-display text-2xl',
                    d.vencido ? 'text-sa-green-deep' : d.hoy ? 'text-sa-green-ink' : 'text-sa-green-ink/55',
                  ].join(' ')}
                >
                  {d.titulo}
                </h2>
                <div className="h-px flex-1 bg-sa-green-ink/10" />
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/45">
                  {d.faltan > 0 ? `faltan ${d.faltan}` : 'listo'}
                </p>
              </div>
              {d.ordenes.map((o) => (
                <Tarjeta
                  key={o.id}
                  orden={o}
                  ocupado={ocupado}
                  onMarcar={marcar}
                  onApuntarMasas={apuntar}
                />
              ))}
            </section>
          ))
        )}
      </main>
    </div>
  )
}
