import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarExistenciasPorSabor,
  listarPaquetesDelDia,
  registrarHorneada,
  mandarAProducir,
  type ExistenciaPorSabor,
  type PaqueteDelDia,
} from '@shake/supabase'
import { mensajeDeError, urlDeFoto } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Producción: cuánto se horneó y cuánto queda, en cuadros.
 *
 * La unidad del inventario es el **cuadro**, no el paquete, porque así se
 * hornea: sale un molde de 48 cuadros y de ahí se van cortando los paquetes
 * conforme se venden — cuatro de 12, dos de 24, uno de 48, o una mezcla. Por
 * eso pueden vender pan del día: no se comprometen a un tamaño hasta que
 * alguien lo pide.
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
            : `Se hornearon ${e.moldes_horneados} molde${e.moldes_horneados === 1 ? '' : 's'}` +
              ` (${e.cuadros_horneados} cuadros)` +
              (e.cuadros_mermados > 0 ? ` · se perdieron ${e.cuadros_mermados}` : '') +
              ` · se vendieron ${e.cuadros_vendidos}`}
        </p>
        {e.cuadros_apartados > 0 && (
          <p className="font-body text-xs text-sa-banana mt-1">
            {e.cuadros_apartados} cuadros apartados para encargos
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

      <div className="shrink-0 w-28 text-center">
        <p
          className={[
            'font-display leading-none',
            agotado ? 'text-3xl text-sa-strawberry' : 'text-4xl text-sa-green-ink',
          ].join(' ')}
        >
          {Math.max(0, e.cuadros_libres)}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
          {agotado ? 'se acabó' : 'cuadros libres'}
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

export default function Produccion() {
  const [sabores, setSabores] = useState<ExistenciaPorSabor[]>([])
  const [paquetes, setPaquetes] = useState<PaqueteDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Lo que se va a mandar a hacer: sabor -> moldes.
  const [pedido, setPedido] = useState<Record<string, number>>({})
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
      .map(([sabor, moldes]) => ({ sabor, moldes }))
    if (items.length === 0) return
    setMandando(true)
    try {
      await mandarAProducir(sb, items)
      const moldes = items.reduce((s, i) => s + i.moldes, 0)
      setAviso(
        `Mandados a hacer ${moldes} molde${moldes === 1 ? '' : 's'}. Ya salió en la pantalla del horno.`,
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
        subtitle={`Se hornea por molde (${cpm} cuadros) y se vende por paquete. Lo que se cobre en caja va bajando los cuadros solo.`}
      />

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
              Se pide por moldes de {cpm} cuadros. Los tamaños se cortan
              después, conforme se vendan.
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
                      quedan {Math.max(0, f.cuadros_libres)} cuadros
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

            <div className="flex items-center justify-between gap-4 pt-4">
              <p className="font-body text-sm text-sa-green-ink/70">
                {aMandar > 0
                  ? `${aMandar} molde${aMandar === 1 ? '' : 's'} · ${aMandar * cpm} cuadros`
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
        <div className={cx.panelChico}>
          <p className={cx.label}>Salieron del horno</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">
            {Math.round((cuadrosHorneados / cpm) * 10) / 10}
            <span className="text-base text-sa-green-ink/45"> moldes</span>
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Cuadros vendidos</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">{cuadrosVendidos}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Cuadros libres</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green mt-1">{cuadrosLibres}</p>
          {cuadrosApartados > 0 && (
            <p className="font-body text-xs text-sa-banana mt-1">
              {cuadrosApartados} apartados
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
