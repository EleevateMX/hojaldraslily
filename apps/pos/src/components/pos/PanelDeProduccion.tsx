import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  hornoEnVivo,
  relojDelHorno,
  listarExistenciasPorSabor,
  listarEncargos,
  mandarAProducir,
  minutosDeHora,
  MOLDES,
  type HornoEnVivo,
  type Molde,
  type ExistenciaPorSabor,
  type Encargo,
} from '@lily/supabase'
import { mensajeDeError, urlDeFoto, enMoldes, mxn } from '@lily/utils'
import { usePosStore } from '@/store/posStore'
import { sb } from '../../lib/sb'

/**
 * El puesto de mando de la caja.
 *
 * La caja no solo cobra: es donde está la dueña, y desde ahí tiene que ver
 * **las tres cosas que están pasando atrás** sin levantarse ni abrir otra
 * pantalla:
 *
 *   1. El HORNO   — qué se está horneando y a qué hora sale
 *   2. PRODUCCIÓN — qué están armando los panaderos y qué falta
 *   3. ENCARGOS   — quién pasa hoy y si su caja ya está lista
 *
 * Y lo que se decide con eso: qué queda de cada sabor, y mandar a hacer más.
 *
 * Es UN botón y UN cajón, no cinco ventanas. El botón dice de un vistazo lo
 * único urgente —lo que se pasó de su hora, o un encargo de hoy sin empacar—
 * y el detalle está a un toque.
 *
 * Se abre ENCIMA de la caja y no es una ruta aparte a propósito: navegar a
 * otra página con un ticket a medias es la forma más fácil de perder una
 * venta.
 *
 * ## Todo se cuenta en MOLDES Y CUARTOS
 *
 * Nadie pregunta «¿cuántos cuadros de guayaba quedan?». Preguntan «¿cuánta
 * guayaba queda?» y la respuesta es «dos moldes y tres cuartos». Un cuarto de
 * molde es el paquete más chico que sale de él —de 48 salen los de 12, de 24
 * los de 6— así que contar en cuartos es contar en paquetes vendibles.
 */

const REFRESCO_MS = 30000

/** ¿Este encargo es de los que se entregan hoy (o ya se pasaron)? */
function esDeHoy(e: Encargo): boolean {
  if (!e.fecha_entrega) return true // "paso más tarde" es hoy
  const entrega = new Date(e.fecha_entrega + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return entrega.getTime() <= hoy.getTime()
}

function porHora(a: Encargo, b: Encargo): number {
  const ha = minutosDeHora(a.hora_entrega)
  const hb = minutosDeHora(b.hora_entrega)
  if (ha === hb) return a.created_at < b.created_at ? -1 : 1
  if (ha === null) return 1
  if (hb === null) return -1
  return ha - hb
}

/** Un bloque del cajón, con su título y su cuenta. */
function Bloque({
  titulo,
  cuenta,
  children,
  accion,
}: {
  titulo: string
  cuenta?: string
  children: React.ReactNode
  accion?: { texto: string; onClick: () => void }
}) {
  return (
    <section className="px-4 py-4 border-t border-sa-green-ink/10 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="font-display text-lg text-sa-green-ink">{titulo}</p>
        <div className="flex items-baseline gap-3 shrink-0">
          {cuenta && (
            <span className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
              {cuenta}
            </span>
          )}
          {accion && (
            <button
              onClick={accion.onClick}
              className="font-mono text-[11px] uppercase tracking-wide text-sa-green hover:brightness-110"
            >
              {accion.texto}
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Lo que queda de un sabor, con su foto y contado en moldes. */
function Queda({ e, base }: { e: ExistenciaPorSabor; base: string }) {
  const foto = urlDeFoto(e.imagen_url, base)
  const libres = Math.max(0, e.cuadros_libres)
  const m = enMoldes(libres, e.cuadros_por_molde)
  const agotado = libres <= 0

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0">
      {foto && <img src={foto} alt="" className="w-9 h-9 object-contain shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm text-sa-green-ink leading-tight truncate">{e.sabor}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
          {libres} cuadro{libres === 1 ? '' : 's'} · moldes de {e.cuadros_por_molde}
        </p>
      </div>
      <p
        className={[
          'font-display text-right shrink-0 leading-tight',
          agotado ? 'text-sm text-sa-strawberry' : 'text-lg text-sa-green-ink',
        ].join(' ')}
      >
        {agotado ? 'se acabó' : m.texto}
      </p>
    </div>
  )
}

export function PanelDeProduccion() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)
  const [sabores, setSabores] = useState<ExistenciaPorSabor[]>([])
  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [abierto, setAbierto] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const empleado = usePosStore((s) => s.empleado)
  const esGerencia = ['administrador', 'gerente'].includes(empleado?.rol ?? '')
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const [molde, setMolde] = useState<Molde>(48)
  const [mandando, setMandando] = useState(false)

  const base = import.meta.env.BASE_URL

  /**
   * Lo que se lee SIEMPRE, con el cajón cerrado: es lo que alimenta el botón.
   *
   * Las dos consultas van en paralelo y cada una se traga su propio error: si
   * el horno no contesta, los encargos igual se ven. La caja tiene que poder
   * cobrar aunque esto falle — un error aquí no es su problema.
   */
  const cargarResumen = useCallback(async () => {
    const [h, e] = await Promise.all([
      hornoEnVivo(sb).catch(() => null),
      listarEncargos(sb).catch(() => [] as Encargo[]),
    ])
    setDatos(h)
    setEncargos(e)
  }, [])

  /** Las existencias son más pesadas y solo se miran con el cajón abierto. */
  const cargarSabores = useCallback(async () => {
    setSabores(await listarExistenciasPorSabor(sb).catch(() => []))
  }, [])

  useEffect(() => {
    void cargarResumen()
    const t = setInterval(() => void cargarResumen(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargarResumen])

  useEffect(() => {
    if (!abierto) return
    void cargarSabores()
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [abierto, cargarSabores])

  const { deHoy, sinEmpacar, listos } = useMemo(() => {
    const hoy = encargos.filter(esDeHoy).sort(porHora)
    return {
      deHoy: hoy,
      sinEmpacar: hoy.filter((e) => !e.empacado_at),
      listos: hoy.filter((e) => e.empacado_at),
    }
  }, [encargos])

  const aMandar = useMemo(() => Object.values(pedido).reduce((s, n) => s + n, 0), [pedido])

  async function mandar() {
    const items = Object.entries(pedido)
      .filter(([, n]) => n > 0)
      .map(([sabor, moldes]) => ({ sabor, moldes, molde }))
    if (items.length === 0) return
    setMandando(true)
    try {
      await mandarAProducir(sb, items)
      setAviso(
        `Mandados a hacer ${aMandar} molde${aMandar === 1 ? '' : 's'} de ${molde}` +
          ` (${aMandar * molde} cuadros). Ya salió en la pantalla de Producción.`,
      )
      setPedido({})
      setError(null)
      await cargarResumen()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

  const r = datos?.resumen
  const enHorno = r?.en_horno ?? 0
  const tarde = r?.tarde ?? 0

  /**
   * Lo que dice el botón.
   *
   * Una sola cosa, la más urgente, y en el orden en que duele: el pan que se
   * está quemando primero, después un encargo de hoy que nadie ha empacado.
   * Si el botón dijera las tres cifras siempre, nadie leería ninguna.
   */
  const etiqueta = tarde > 0
    ? `${tarde} se pasó de su hora`
    : sinEmpacar.length > 0
      ? `${sinEmpacar.length} encargo${sinEmpacar.length === 1 ? '' : 's'} por empacar`
      : enHorno > 0
        ? `${enHorno} en el horno`
        : null

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className={[
          'font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border transition-colors',
          tarde > 0
            ? 'bg-sa-cream text-sa-green border-sa-cream animate-pulse'
            : 'bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 text-sa-cream border-sa-cream/20',
        ].join(' ')}
      >
        Producción{etiqueta ? ` · ${etiqueta}` : ''}
      </button>

      {abierto && (
        <>
          {/* Un velo para cerrar tocando fuera: en táctil no hay «clic
              afuera» que se sienta natural sin esto. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[28rem] max-h-[85vh] overflow-y-auto rounded-sa-lg bg-white shadow-sa-lg border border-sa-green-ink/10 text-left">
            {error && (
              <p className="font-body text-sm bg-sa-strawberry/15 border-l-4 border-sa-strawberry px-4 py-3">
                {error}
              </p>
            )}
            {aviso && (
              <div className="flex items-start gap-2 bg-sa-mint/15 border-l-4 border-sa-mint px-4 py-3">
                <p className="font-body text-sm flex-1">{aviso}</p>
                <button
                  onClick={() => setAviso(null)}
                  className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50"
                >
                  Cerrar
                </button>
              </div>
            )}

            {/* ── 1. EL HORNO ── «¿a qué hora salen?» */}
            <Bloque
              titulo="En el horno"
              cuenta={enHorno > 0 ? `${enHorno} molde${enHorno === 1 ? '' : 's'}` : undefined}
            >
              {!datos || datos.adentro.length === 0 ? (
                <p className="font-body text-sm text-sa-green-ink/50">
                  {/* «Nada en el horno» quiere decir cosas muy distintas. */}
                  {(r?.esperando ?? 0) > 0
                    ? `Nada adentro: hay ${r?.esperando} molde${r?.esperando === 1 ? '' : 's'} armado${r?.esperando === 1 ? '' : 's'} esperando turno.`
                    : (r?.sin_armar ?? 0) > 0
                      ? `Nada adentro: faltan ${r?.sin_armar} molde${r?.sin_armar === 1 ? '' : 's'} por armar en producción.`
                      : 'Nada horneándose ahorita.'}
                </p>
              ) : (
                datos.adentro.map((i) => {
                  const reloj = relojDelHorno(i.listo_en, ahora)
                  const foto = urlDeFoto(i.imagen_url, base)
                  return (
                    <div
                      key={i.item_id}
                      className="flex items-center gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0"
                    >
                      {foto && <img src={foto} alt="" className="w-9 h-9 object-contain shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-sa-green-ink leading-tight truncate">
                          {i.sabor}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                          {i.moldes} molde{i.moldes === 1 ? '' : 's'} de {i.molde}
                        </p>
                      </div>
                      <p
                        className={[
                          'font-mono text-sm shrink-0',
                          reloj.tarde ? 'text-sa-green font-semibold' : 'text-sa-green-ink/60',
                        ].join(' ')}
                      >
                        {reloj.texto}
                      </p>
                    </div>
                  )
                })
              )}
            </Bloque>

            {/* ── 2. PRODUCCIÓN ── qué están armando los panaderos */}
            {((r?.esperando ?? 0) > 0 || (r?.sin_armar ?? 0) > 0) && (
              <Bloque
                titulo="Producción"
                cuenta={`${(r?.esperando ?? 0) + (r?.sin_armar ?? 0)} moldes`}
              >
                {datos?.esperando.map((i) => (
                  <div
                    key={i.item_id}
                    className="flex items-center gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0"
                  >
                    <span className="font-display text-lg text-sa-green-ink w-8 shrink-0 tabular-nums">
                      {i.moldes}
                    </span>
                    <p className="font-body text-sm text-sa-green-ink flex-1 min-w-0 truncate">
                      {i.sabor}
                    </p>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-sa-banana shrink-0">
                      listo para entrar
                    </span>
                  </div>
                ))}
                {datos?.sin_armar.map((i) => (
                  <div
                    key={i.item_id}
                    className="flex items-center gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0"
                  >
                    <span className="font-display text-lg text-sa-green-ink/60 w-8 shrink-0 tabular-nums">
                      {i.moldes}
                    </span>
                    <p className="font-body text-sm text-sa-green-ink/70 flex-1 min-w-0 truncate">
                      {i.sabor}
                    </p>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 shrink-0">
                      lo están armando
                    </span>
                  </div>
                ))}
              </Bloque>
            )}

            {/* ── 3. ENCARGOS ── lo primero del negocio */}
            <Bloque
              titulo="Encargos de hoy"
              cuenta={deHoy.length > 0 ? `${listos.length} de ${deHoy.length} listos` : undefined}
              accion={{ texto: 'Abrir', onClick: () => { setAbierto(false); navigate('/encargos') } }}
            >
              {deHoy.length === 0 ? (
                <p className="font-body text-sm text-sa-green-ink/50">
                  Nadie pasa hoy por un encargo.
                </p>
              ) : (
                deHoy.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-sa-green-ink leading-tight truncate">
                        {e.cliente}
                        <span className="font-mono text-[10px] text-sa-green-ink/40"> #{e.folio}</span>
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                        {e.hora_entrega || 'sin hora'} · {e.piezas} pieza{e.piezas === 1 ? '' : 's'} ·{' '}
                        {mxn(e.total)}
                      </p>
                    </div>
                    {/* Lo que Empaque le contesta a la caja: si la caja ya
                        está hecha o el cliente va a tener que esperar. */}
                    <span
                      className={[
                        'shrink-0 font-mono text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5',
                        e.empacado_at
                          ? 'bg-sa-mint/25 text-sa-green-ink'
                          : 'bg-sa-banana/25 text-sa-green-ink',
                      ].join(' ')}
                    >
                      {e.empacado_at ? 'listo' : 'por empacar'}
                    </span>
                  </div>
                ))
              )}
            </Bloque>

            {/* ── 4. LO QUE QUEDA ── en moldes y cuartos */}
            <Bloque titulo="Lo que queda">
              {sabores.length === 0 ? (
                <p className="font-body text-sm text-sa-green-ink/50">
                  Todavía no se hornea nada hoy.
                </p>
              ) : (
                sabores.map((e) => <Queda key={e.sabor} e={e} base={base} />)
              )}
            </Bloque>

            {/* ── 5. MANDAR A HACER ── solo gerencia: un cajero no decide qué
                se hornea. Va al final porque es lo que menos veces se hace. */}
            {esGerencia && sabores.length > 0 && (
              <section className="px-4 py-4 border-t border-sa-green-ink/10 bg-sa-cream-soft/50">
                <p className="font-display text-lg text-sa-green-ink mb-1">Mandar a hacer</p>
                <p className="font-body text-xs text-sa-green-ink/55 mb-3">
                  Se pide en moldes. El tamaño de los paquetes se decide
                  después, conforme se vendan.
                </p>

                {sabores.map((e) => {
                  const n = pedido[e.sabor] ?? 0
                  const foto = urlDeFoto(e.imagen_url, base)
                  return (
                    <div key={e.sabor} className="flex items-center gap-2 py-1.5">
                      {foto && <img src={foto} alt="" className="w-8 h-8 object-contain shrink-0" />}
                      <p className="font-body text-sm text-sa-green-ink flex-1 min-w-0 truncate">
                        {e.sabor}
                      </p>
                      <button
                        onClick={() => setPedido((p) => ({ ...p, [e.sabor]: Math.max(0, n - 1) }))}
                        disabled={n === 0}
                        className="w-9 h-9 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25 shrink-0"
                        aria-label={`Quitar un molde de ${e.sabor}`}
                      >
                        −
                      </button>
                      <span className="font-mono text-sm w-10 text-center tabular-nums shrink-0">
                        {n > 0 ? n : '—'}
                      </span>
                      <button
                        onClick={() => setPedido((p) => ({ ...p, [e.sabor]: n + 1 }))}
                        className="w-9 h-9 rounded-full bg-sa-green text-sa-cream font-display shrink-0"
                        aria-label={`Agregar un molde de ${e.sabor}`}
                      >
                        +
                      </button>
                    </div>
                  )
                })}

                {/* El molde va junto al total, que es lo último que se mira
                    antes de mandar: primero se decide QUÉ y cuánto, y con eso
                    enfrente, en qué molde entra. */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-sa-green-ink/10">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/55">
                    Molde
                  </span>
                  {MOLDES.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMolde(m)}
                      aria-pressed={molde === m}
                      className={[
                        'font-display text-sm px-3 py-1.5 rounded-full border transition-colors',
                        molde === m
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'border-sa-green-ink/15 text-sa-green-ink/60',
                      ].join(' ')}
                    >
                      {m}
                    </button>
                  ))}
                  <span className="font-mono text-[11px] text-sa-green-ink/50 ml-auto">
                    {aMandar > 0 ? `${aMandar} × ${molde} = ${aMandar * molde} cuadros` : ''}
                  </span>
                </div>

                <button
                  onClick={() => void mandar()}
                  disabled={mandando || aMandar === 0}
                  className="w-full mt-3 h-12 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40 active:scale-95 transition-all"
                >
                  {mandando ? 'Mandando…' : 'Mandar a producción'}
                </button>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
