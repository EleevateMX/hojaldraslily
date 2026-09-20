import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarExistenciasPorSabor,
  MOLDES,
  type Molde,
  listarPaquetesDelDia,
  registrarHorneada,
  mandarAProducir,
  hornoEnVivo,
  relojDelHorno,
  type ExistenciaPorSabor,
  type PaqueteDelDia,
  type HornoEnVivo,
} from '@lily/supabase'
import { mensajeDeError, urlDeFoto, enMoldes } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Producción: cuánto se horneó y cuánto queda, en cuadros.
 *
 * La unidad del inventario es el **cuadro**, no el paquete, porque así se
 * hornea: sale un molde —de 48 o de 24 cuadros— y de ahí se van cortando los
 * paquetes conforme se venden: cuatro de 12, dos de 24, uno de 48, o una
 * mezcla. Por eso pueden vender pan del día: no se comprometen a un tamaño
 * hasta que alguien lo pide.
 *
 * Contarlo por paquete obligaba a decidir en el horno algo que se decide en
 * el mostrador, y hacía que «quedan 3 chicas» y «quedan 6 minis» parecieran
 * existencias distintas cuando son **el mismo pan**.
 */

function Fila({
  e,
  paquetes,
  base,
  ocupado,
  onHornear,
  onMerma,
}: {
  e: ExistenciaPorSabor
  paquetes: PaqueteDelDia[]
  base: string
  ocupado: boolean
  onHornear: (moldes: number) => void
  onMerma: () => void
}) {
  const foto = urlDeFoto(e.imagen_url, base)
  const agotado = e.cuadros_libres <= 0 && e.cuadros_horneados > 0
  const sinHornear = e.cuadros_horneados === 0
  // Contra el molde con el que se horneó este sabor. Si se contara todo
  // contra 48, un sabor hecho en moldes de 24 saldría a la mitad de moldes de
  // los que de verdad se metieron al horno.
  const libres = enMoldes(Math.max(0, e.cuadros_libres), e.cuadros_por_molde)

  return (
    <div
      className={[
        'flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-sa border p-4 transition-colors',
        agotado ? 'bg-sa-strawberry/10 border-sa-strawberry/40' : 'bg-white border-sa-green-ink/10',
      ].join(' ')}
    >
      {foto && <img src={foto} alt="" className="w-14 h-14 shrink-0 object-contain" draggable={false} />}

      <div className="min-w-0 flex-1 basis-0 min-w-[11rem]">
        <p className="font-display text-lg leading-tight text-sa-green-ink">{e.sabor}</p>
        <p className="font-body text-xs text-sa-green-ink/55 mt-1">
          {sinHornear
            ? 'Todavía no se hornea nada hoy'
            : `Se hornearon ${e.moldes_horneados} molde${e.moldes_horneados === 1 ? '' : 's'} de ${e.cuadros_por_molde}` +
              (e.cuadros_mermados > 0
                ? ` · se perdieron ${enMoldes(e.cuadros_mermados, e.cuadros_por_molde).texto}`
                : '') +
              ` · se vendieron ${enMoldes(e.cuadros_vendidos, e.cuadros_por_molde).texto}`}
        </p>
        {e.cuadros_apartados > 0 && (
          <p className="font-body text-xs text-sa-banana mt-1">
            {enMoldes(e.cuadros_apartados, e.cuadros_por_molde).texto} apartado
            {e.cuadros_apartados === 1 ? '' : 's'} para encargos
          </p>
        )}
        {/* De cuántas formas se puede cortar lo que queda. Es el MISMO pan
            contado distinto: vender una chica baja también las minis. */}
        {paquetes.length > 0 && e.cuadros_libres > 0 && (
          <p className="font-mono text-[11px] text-sa-green-ink/60 mt-1.5">
            alcanza para{' '}
            {paquetes
              .map((p) => `${p.paquetes_posibles} de ${p.cuadros}`)
              .join(' · o · ')}
          </p>
        )}
      </div>

      {/* En MOLDES Y CUARTOS, que es como cuenta la casa. «1,423 cuadros» no
          le dice nada a nadie; «29 moldes y ½» sí. El cuadro exacto se queda
          abajo, en chico, para quien necesite el número fino. */}
      <div className="shrink-0 w-32 text-center">
        <p
          className={[
            'font-display leading-none',
            agotado ? 'text-2xl text-sa-strawberry' : 'text-3xl text-sa-green-ink',
          ].join(' ')}
        >
          {agotado ? 'se acabó' : libres.texto}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
          {agotado
            ? 'no queda nada'
            : `libres · ${Math.max(0, e.cuadros_libres)} cuadro${e.cuadros_libres === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-end">
        {[1, 2].map((m) => (
          <button
            key={m}
            disabled={ocupado}
            onClick={() => onHornear(m)}
            className="h-12 px-4 rounded-full bg-sa-green text-sa-cream font-display text-sm flex items-center justify-center shadow-sa-sm active:scale-95 transition-transform disabled:opacity-50"
            aria-label={`Agregar ${m} molde de ${e.sabor}`}
          >
            +{m} molde{m === 1 ? '' : 's'}
          </button>
        ))}
        <button
          disabled={ocupado || e.cuadros_libres <= 0}
          onClick={onMerma}
          className="w-12 h-12 rounded-full border border-sa-green-ink/15 text-sa-green-ink/70 font-display text-xl flex items-center justify-center hover:bg-sa-cream-soft active:scale-95 transition-all disabled:opacity-30"
          title="Se perdió un cuadro (se quemó, se cayó)"
          aria-label={`Restar una merma de ${e.sabor}`}
        >
          −
        </button>
      </div>
    </div>
  )
}

/**
 * Lo que está pasando en el horno ahora mismo, para gerencia.
 *
 * Gerencia manda a hacer desde el teléfono y la pregunta que sigue es «¿y
 * cómo va?». Sin esto hay que llamar a la tienda. Es la misma consulta
 * (`fn_horno_en_vivo`) que leen la pantalla del Horno y la Caja: si cada una
 * calculara lo suyo, terminarían diciendo cosas distintas del mismo horno.
 *
 * Si no hay nada en ninguna de las tres pilas no se pinta: una franja que
 * siempre dice «0» deja de mirarse.
 */
function ElHorno() {
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)

  useEffect(() => {
    const traer = () => void hornoEnVivo(sb).then(setDatos).catch(() => {})
    traer()
    // Cada minuto, no cada segundo: nadie hornea con esa precisión y un
    // contador corriendo solo distrae.
    const t = setInterval(traer, 60000)
    return () => clearInterval(t)
  }, [])

  const r = datos?.resumen
  if (!r || r.en_horno + r.esperando + r.sin_armar === 0) return null

  return (
    <div className={cx.panel}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-xl text-sa-green-ink">El horno, ahora</p>
        <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
          {r.en_horno} dentro · {r.esperando} esperando · {r.sin_armar} sin armar
        </p>
      </div>

      {datos.adentro.length > 0 ? (
        <div className="mt-3 space-y-2">
          {datos.adentro.map((h) => {
            const f = relojDelHorno(h.listo_en, new Date(datos.ahora))
            return (
              <div key={h.item_id} className="flex items-center gap-3">
                <span className="font-display text-xl text-sa-green-ink w-12 shrink-0 tabular-nums">
                  {h.moldes}
                </span>
                <span className="font-body text-sm text-sa-green-ink flex-1 min-w-0">
                  {h.sabor}
                  <span className="text-sa-green-ink/45"> · moldes de {h.molde}</span>
                </span>
                <span
                  className={[
                    'shrink-0 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-sa-green-ink',
                    f.tarde ? 'bg-sa-strawberry/25' : 'bg-sa-mint/20',
                  ].join(' ')}
                >
                  {f.texto}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="font-body text-sm text-sa-green-ink/60 mt-2">
          {/* "Nada en el horno" significa cosas muy distintas segun por que. */}
          El horno está vacío
          {r.esperando > 0
            ? `: hay ${r.esperando} molde${r.esperando === 1 ? '' : 's'} armado${r.esperando === 1 ? '' : 's'} esperando turno.`
            : r.sin_armar > 0
              ? `: faltan ${r.sin_armar} molde${r.sin_armar === 1 ? '' : 's'} por armar en producción.`
              : '.'}
        </p>
      )}
    </div>
  )
}

export default function Produccion() {
  const [sabores, setSabores] = useState<ExistenciaPorSabor[]>([])
  const [paquetes, setPaquetes] = useState<PaqueteDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Lo que se va a mandar a hacer: sabor -> moldes.
  const [pedido, setPedido] = useState<Record<string, number>>({})
  // Con qué molde se va a hornear esta tanda: 48 o 24. Es UNA decisión por
  // envío y no por sabor, porque así se decide en la práctica — se prende el
  // horno con los moldes que se van a usar, no uno de cada tamaño a la vez.
  const [molde, setMolde] = useState<Molde>(48)
  const [abrirPedido, setAbrirPedido] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const base = import.meta.env.BASE_URL

  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true)
    try {
      const [s, p] = await Promise.all([
        listarExistenciasPorSabor(sb),
        listarPaquetesDelDia(sb),
      ])
      setSabores(s)
      setPaquetes(p)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function hornear(e: ExistenciaPorSabor, moldes: number) {
    setOcupado(e.sabor)
    try {
      await registrarHorneada(sb, e.sabor, moldes * e.cuadros_por_molde, 'horneado')
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function merma(e: ExistenciaPorSabor) {
    setOcupado(e.sabor)
    try {
      await registrarHorneada(sb, e.sabor, 1, 'merma')
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function mandar() {
    const items = Object.entries(pedido)
      .filter(([, n]) => n > 0)
      .map(([sabor, moldes]) => ({ sabor, moldes, molde }))
    if (items.length === 0) return
    setMandando(true)
    try {
      await mandarAProducir(sb, items)
      const moldes = items.reduce((s, i) => s + i.moldes, 0)
      setAviso(
        `Mandados a hacer ${moldes} molde${moldes === 1 ? '' : 's'} de ${molde} ` +
          `(${moldes * molde} cuadros). Ya salió en la pantalla de Producción.`,
      )
      setPedido({})
      setAbrirPedido(false)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

  const porSabor = useMemo(() => {
    const m = new Map<string, PaqueteDelDia[]>()
    paquetes.forEach((p) => {
      const l = m.get(p.sabor) ?? []
      l.push(p)
      m.set(p.sabor, l)
    })
    return m
  }, [paquetes])

  const porCategoria = useMemo(() => {
    const m = new Map<string, ExistenciaPorSabor[]>()
    sabores.forEach((f) => {
      const l = m.get(f.categoria) ?? []
      l.push(f)
      m.set(f.categoria, l)
    })
    return [...m.entries()]
  }, [sabores])

  const cuadrosHorneados = sabores.reduce((s, f) => s + f.cuadros_horneados, 0)
  const cuadrosLibres = sabores.reduce((s, f) => s + Math.max(0, f.cuadros_libres), 0)
  const cuadrosVendidos = sabores.reduce((s, f) => s + f.cuadros_vendidos, 0)
  const cuadrosApartados = sabores.reduce((s, f) => s + f.cuadros_apartados, 0)
  const cpm = sabores[0]?.cuadros_por_molde ?? 48
  const agotados = sabores.filter((f) => f.cuadros_horneados > 0 && f.cuadros_libres <= 0)
  const aMandar = Object.values(pedido).reduce((s, n) => s + n, 0)

  if (cargando) return <Loading>Cargando la producción de hoy…</Loading>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción de hoy"
        subtitle="Se hornea por moldes de 48 o de 24 y se vende por paquete. Cada sabor se cuenta con SU molde; los tres totales de abajo, en moldes de 48, que es el de la casa."
      />

      <ElHorno />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && (
        <div className="rounded-sa bg-sa-mint/10 border-l-4 border-sa-mint px-5 py-4 flex items-start gap-3">
          <p className="font-body text-sm text-sa-green-ink flex-1">{aviso}</p>
          <button
            onClick={() => setAviso(null)}
            className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50"
          >
            Cerrar
          </button>
        </div>
      )}

      <div className={cx.panel}>
        <button
          onClick={() => setAbrirPedido((v) => !v)}
          className="w-full flex items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="font-display text-xl text-sa-green-ink">Mandar a producir</p>
            <p className="font-body text-sm text-sa-green-ink/60 mt-0.5">
              Se pide por moldes, eligiendo abajo si son de 48 o de 24. Los
              tamaños se cortan después, conforme se vendan.
            </p>
          </div>
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green shrink-0">
            {abrirPedido ? 'Cerrar' : 'Abrir'}
          </span>
        </button>

        {abrirPedido && (
          <div className="mt-5 space-y-2">
            {sabores.map((f) => {
              const n = pedido[f.sabor] ?? 0
              const foto = urlDeFoto(f.imagen_url, base)
              return (
                <div
                  key={f.sabor}
                  className="flex items-center gap-3 py-2 border-b border-sa-green-ink/5 last:border-0"
                >
                  {foto && <img src={foto} alt="" className="w-9 h-9 object-contain shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm text-sa-green-ink leading-tight">{f.sabor}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                      quedan {enMoldes(Math.max(0, f.cuadros_libres), f.cuadros_por_molde).texto}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPedido((p) => ({ ...p, [f.sabor]: Math.max(0, n - 1) }))}
                      disabled={n === 0}
                      className="w-9 h-9 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
                      aria-label={`Quitar un molde de ${f.sabor}`}
                    >
                      −
                    </button>
                    <span className="font-mono text-base w-14 text-center tabular-nums">
                      {n > 0 ? `${n} m` : '—'}
                    </span>
                    <button
                      onClick={() => setPedido((p) => ({ ...p, [f.sabor]: n + 1 }))}
                      className="w-9 h-9 rounded-full bg-sa-green text-sa-cream font-display"
                      aria-label={`Agregar un molde de ${f.sabor}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}

            {/* El molde. Va abajo, junto al total, porque es lo último que
                se decide: primero se elige qué sabores y cuántos, y ya con eso
                enfrente se decide en qué molde entran. */}
            <div className="flex items-center gap-3 pt-4 flex-wrap">
              <span className={cx.label}>Molde</span>
              {MOLDES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMolde(m)}
                  aria-pressed={molde === m}
                  className={
                    molde === m
                      ? 'px-5 py-3 rounded-sa bg-sa-green text-sa-cream font-display text-lg'
                      : 'px-5 py-3 rounded-sa border border-sa-green-ink/15 text-sa-green-ink font-display text-lg hover:bg-sa-cream-soft'
                  }
                >
                  {m} cuadros
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-4 pt-4">
              <p className="font-body text-sm text-sa-green-ink/70">
                {aMandar > 0
                  ? `${aMandar} molde${aMandar === 1 ? '' : 's'} de ${molde} · ${aMandar * molde} cuadros`
                  : 'Todavía no ha puesto nada'}
              </p>
              <button
                onClick={() => void mandar()}
                disabled={aMandar === 0 || mandando}
                className={cx.btnPrimary}
              >
                {mandando ? 'Mandando…' : 'Mandar a producir'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {/* En CUADROS, igual que sus dos vecinos. Decia "N moldes" dividiendo
            entre un solo tamano de molde, y con moldes de 48 y de 24 mezclados
            en el mismo dia ese numero no es de nada: 96 cuadros son dos moldes
            de 48 o cuatro de 24. El cuadro si es la misma unidad siempre. */}
        <div className={cx.panelChico}>
          <p className={cx.label}>Horneado</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">
            {enMoldes(cuadrosHorneados, 48).texto}
          </p>
          <p className="font-body text-[11px] text-sa-green-ink/45 mt-0.5">
            {cuadrosHorneados} cuadros
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Vendido</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">
            {enMoldes(cuadrosVendidos, 48).texto}
          </p>
          <p className="font-body text-[11px] text-sa-green-ink/45 mt-0.5">
            {cuadrosVendidos} cuadros
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Libre</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green mt-1">
            {enMoldes(cuadrosLibres, 48).texto}
          </p>
          <p className="font-body text-[11px] text-sa-green-ink/45 mt-0.5">
            {cuadrosLibres} cuadros
          </p>
          {cuadrosApartados > 0 && (
            <p className="font-body text-xs text-sa-banana mt-1">
              {enMoldes(cuadrosApartados, 48).texto} apartado
              {cuadrosApartados === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      {agotados.length > 0 && (
        <div className="rounded-sa bg-sa-strawberry/10 border-l-4 border-sa-strawberry px-5 py-4">
          <p className="font-display text-lg text-sa-green-ink">
            Se acabó {agotados.length === 1 ? 'este sabor' : `${agotados.length} sabores`}
          </p>
          <p className="font-body text-sm text-sa-green-ink/70 mt-1">
            {agotados.map((a) => a.sabor).join(' · ')}
          </p>
        </div>
      )}

      {porCategoria.map(([categoria, lista]) => (
        <div key={categoria} className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-sa-green pt-2">
            {categoria}
          </p>
          {lista.map((e) => (
            <Fila
              key={e.sabor}
              e={e}
              paquetes={porSabor.get(e.sabor) ?? []}
              base={base}
              ocupado={ocupado === e.sabor}
              onHornear={(m) => void hornear(e, m)}
              onMerma={() => void merma(e)}
            />
          ))}
        </div>
      ))}

      <p className={`font-body text-sm ${cx.muted}`}>
        Solo aparecen los menús que hoy están abiertos. Para abrir o cerrar un
        menú completo, vaya a <b>Menús del día</b>.
      </p>
    </div>
  )
}
