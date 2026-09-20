import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  hornoEnVivo,
  relojDelHorno,
  listarExistenciasPorSabor,
  mandarAProducir,
  MOLDES,
  type HornoEnVivo,
  type Molde,
  type ExistenciaPorSabor,
} from '@lily/supabase'
import { mensajeDeError, urlDeFoto, enMoldes } from '@lily/utils'
import { usePosStore } from '@/store/posStore'
import { sb } from '../../lib/sb'

/**
 * La producción, vista y mandada desde la caja.
 *
 * La caja es el puesto de mando: ahí está la dueña. Desde ahí se ve lo que
 * queda, lo que está en el horno y se manda a hacer más, **sin salir de la
 * pantalla de venta**. Antes eso vivía repartido en tres lugares —la caja, la
 * página de Encargos y Admin— y quien atiende no va a navegar tres pantallas
 * con un cliente enfrente.
 *
 * Es UN botón en la cabecera y UN cajón, no tres ventanas. El botón dice de
 * un vistazo lo único urgente (cuántas tandas hay y si alguna se pasó de su
 * hora); todo lo demás está a un toque y se cierra tocando afuera.
 *
 * Se abre encima de la caja y no es una ruta aparte a propósito: navegar a
 * otra página con un ticket a medias es la forma más fácil de perder una
 * venta.
 *
 * ## Todo se cuenta en MOLDES Y CUARTOS
 *
 * Nadie pregunta «¿cuántos cuadros de guayaba quedan?». Preguntan «¿cuánta
 * guayaba queda?» y la respuesta es «dos moldes y tres cuartos». Un cuarto de
 * molde es exactamente el paquete más chico que sale de él —de 48 salen los
 * de 12, de 24 los de 6— así que contar en cuartos es contar en paquetes
 * vendibles, no en una fracción cualquiera. El cuadro exacto se queda abajo,
 * en chico, para quien necesite el número fino.
 */

const REFRESCO_MS = 30000

/** Lo que queda de un sabor, con su foto y contado en moldes. */
function Queda({ e, base }: { e: ExistenciaPorSabor; base: string }) {
  const foto = urlDeFoto(e.imagen_url, base)
  const libres = Math.max(0, e.cuadros_libres)
  const m = enMoldes(libres, e.cuadros_por_molde)
  const agotado = libres <= 0

  return (
    <div className="flex items-center gap-3 py-2 border-b border-sa-green-ink/5 last:border-0">
      {foto && <img src={foto} alt="" className="w-10 h-10 object-contain shrink-0" />}
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
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)
  const [sabores, setSabores] = useState<ExistenciaPorSabor[]>([])
  const [abierto, setAbierto] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Mandar a hacer, aquí mismo.
  const empleado = usePosStore((s) => s.empleado)
  const esGerencia = ['administrador', 'gerente'].includes(empleado?.rol ?? '')
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const [molde, setMolde] = useState<Molde>(48)
  const [mandando, setMandando] = useState(false)

  const base = import.meta.env.BASE_URL

  const cargar = useCallback(async () => {
    try {
      setDatos(await hornoEnVivo(sb))
    } catch {
      // Si el horno no contesta, el botón desaparece y ya. La caja tiene que
      // poder cobrar aunque esto falle: un error aquí no es su problema.
      setDatos(null)
    }
  }, [])

  const cargarSabores = useCallback(async () => {
    try {
      setSabores(await listarExistenciasPorSabor(sb))
    } catch {
      setSabores([])
    }
  }, [])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  // Las existencias solo se piden con el cajón abierto: son una consulta más
  // pesada y estando cerrado nadie las mira.
  useEffect(() => {
    if (!abierto) return
    void cargarSabores()
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [abierto, cargarSabores])

  const aMandar = useMemo(
    () => Object.values(pedido).reduce((s, n) => s + n, 0),
    [pedido],
  )

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
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

  const r = datos?.resumen
  const enHorno = r?.en_horno ?? 0
  const tarde = r?.tarde ?? 0

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
        Producción
        {enHorno > 0 && ` · ${enHorno} en horno`}
        {tarde > 0 && ` · ${tarde} se pasó`}
      </button>

      {abierto && (
        <>
          {/* Un velo para cerrar tocando fuera: en táctil no hay «clic
              afuera» que se sienta natural sin esto. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[26rem] max-h-[80vh] overflow-y-auto rounded-sa-lg bg-white shadow-sa-lg border border-sa-green-ink/10 text-left">
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

            {/* 1. EN EL HORNO — lo que contesta «¿a qué hora salen?» */}
            <section className="p-4">
              <p className="font-display text-lg text-sa-green-ink mb-2">En el horno</p>
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
                      className="flex items-center gap-3 py-2 border-b border-sa-green-ink/5 last:border-0"
                    >
                      {foto && <img src={foto} alt="" className="w-10 h-10 object-contain shrink-0" />}
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
            </section>

            {/* 2. LO QUE QUEDA — en moldes y cuartos, con su foto */}
            <section className="px-4 pb-4 border-t border-sa-green-ink/10 pt-4">
              <p className="font-display text-lg text-sa-green-ink mb-2">Lo que queda</p>
              {sabores.length === 0 ? (
                <p className="font-body text-sm text-sa-green-ink/50">
                  Todavía no se hornea nada hoy.
                </p>
              ) : (
                sabores.map((e) => <Queda key={e.sabor} e={e} base={base} />)
              )}
            </section>

            {/* 3. MANDAR A HACER — solo gerencia: un cajero no decide qué se
                hornea. Va al final porque es lo que menos veces se hace. */}
            {esGerencia && sabores.length > 0 && (
              <section className="px-4 pb-4 border-t border-sa-green-ink/10 pt-4 bg-sa-cream-soft/50">
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
                        onClick={() =>
                          setPedido((p) => ({ ...p, [e.sabor]: Math.max(0, n - 1) }))
                        }
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
