import { useState } from 'react'
import { mxn } from '@lily/utils'
import { Panel, PageHeader, cx } from '../ui'
import { DeltaPill, Scorecard, CalloutCard, Pastilla, type Kpi, type Callout } from './dashboardUi'

/**
 * Vista presentacional del Dashboard: recibe TODO por `data`, sin lógica de
 * datos. La alimentan dos lados — la pantalla real `Dashboard.tsx` (con las
 * consultas de Supabase) y el arnés `apps/admin/mirar/dashboard.html` (con
 * datos de una tienda de mediodía)—, así el diseño se mira sin backend y no se
 * desvía del real.
 *
 * El toggle de periodo (Hoy / 7 días / 30 días) cambia los KPIs y la gráfica;
 * los paneles de «ahora» (riel, cómo se cobró, horno, stock) no cambian.
 */

export type DiaVenta = { etiqueta: string; total: number; esHoy?: boolean }
export type Pago = { lbl: string; val: number; nota?: string }
export type TopProd = { nombre: string; vendido: number }
export type HornoItem = { sabor: string; estado: 'horno' | 'espera' | 'listo'; detalle: string }
export type StockBajo = { insumo: string; almacen: string; actual: string; minimo: string }

/** Un periodo del toggle, con sus KPIs y su gráfica ya calculados. */
export type Periodo = {
  id: string
  label: string
  kpis: Kpi[]
  barras: DiaVenta[]
  tituloBarras: string
  total: number
  delta?: number
  etiquetaTotal: string
}

export type DashboardData = {
  fecha: string
  sucursal: string
  periodos: Periodo[]
  pendientes: Callout[]
  pagos: Pago[]
  top: TopProd[]
  horno: HornoItem[]
  stockBajo: StockBajo[]
}

const HORNO_ESTADO: Record<HornoItem['estado'], { txt: string; cls: string }> = {
  horno: { txt: 'En el horno', cls: 'bg-sa-mango/20 text-sa-green-ink' },
  espera: { txt: 'Esperando', cls: 'bg-sa-blueberry/15 text-sa-blueberry' },
  listo: { txt: 'Listo', cls: 'bg-sa-mint/30 text-sa-green-ink' },
}

// Más de este número de insumos bajo mínimo no se listan enteros: se muestran
// los primeros y un «y N más», para que el panel no se vuelva una tira sin fin.
const TOPE_STOCK = 8

export default function DashboardVista({ data }: { data: DashboardData }) {
  const [pi, setPi] = useState(0)
  const periodo = data.periodos[Math.min(pi, data.periodos.length - 1)] ?? data.periodos[0]

  const maxDia = Math.max(1, ...periodo.barras.map((d) => d.total))
  const maxTop = Math.max(1, ...data.top.map((t) => t.vendido))
  // Con muchas barras (30 días) no caben las etiquetas de cada una.
  const compacto = periodo.barras.length > 10
  const stockMostrado = data.stockBajo.slice(0, TOPE_STOCK)
  const stockRestante = data.stockBajo.length - stockMostrado.length

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={<>Resumen del día · <span className="font-mono text-sa-green-ink/80">{data.fecha}</span></>}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-full bg-white border border-sa-green-ink/10 p-1 shadow-sa-sm">
              {data.periodos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPi(i)}
                  aria-pressed={i === pi}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${i === pi ? 'bg-sa-green text-sa-cream' : 'text-sa-green-ink/60 hover:text-sa-green-ink'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white border border-sa-green-ink/10 rounded-full px-4 py-2 shadow-sa-sm">
              <span className="w-2 h-2 rounded-full bg-sa-mint" />
              <span className="text-sm font-medium text-sa-green-ink">Sucursal: {data.sucursal}</span>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {periodo.kpis.map((k) => <Scorecard key={k.lbl} k={k} />)}
      </div>

      <div className="bg-white rounded-sa p-6 shadow-sa-sm border border-sa-green-ink/5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className={cx.h3}>Qué hay que atender hoy</h3>
          <span className="text-xs font-mono text-sa-green-ink/50 uppercase tracking-wide">{data.pendientes.length} {data.pendientes.length === 1 ? 'cosa' : 'cosas'}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.pendientes.map((c) => <CalloutCard key={c.titulo} c={c} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Panel title={periodo.tituloBarras}>
            <div className="flex items-end gap-2 h-44 pt-6">
              {periodo.barras.map((d, i) => (
                <div key={`${d.etiqueta}-${i}`} className="flex-1 flex flex-col items-center gap-2 h-full min-w-0">
                  {!compacto && <span className="text-[11px] font-mono text-sa-green-ink/70 tabular-nums">{Math.round(d.total / 1000)}k</span>}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={`w-full min-h-[3px] rounded-t-lg transition-all ${d.esHoy ? 'bg-sa-green' : 'bg-sa-green/35'}`}
                      style={{ height: `${Math.round((d.total / maxDia) * 100)}%` }}
                      title={mxn(d.total)}
                    />
                  </div>
                  {!compacto && <span className={`text-xs font-mono capitalize ${d.esHoy ? 'text-sa-green-ink font-semibold' : 'text-sa-green-ink/60'}`}>{d.etiqueta}</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-sa-green-ink/5 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-sa-green-ink/60">{periodo.etiquetaTotal}</span>
              <span className="flex items-center gap-2">
                <b className="font-mono text-lg text-sa-green-ink">{mxn(periodo.total)}</b>
                {periodo.delta != null && <DeltaPill d={{ pct: periodo.delta, buenoSiSube: true }} />}
                {periodo.delta != null && <span className="text-xs text-sa-green-ink/50">vs periodo anterior</span>}
              </span>
            </div>
          </Panel>

          <Panel title="Cómo se cobró hoy">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {data.pagos.map((p) => (
                <div key={p.lbl} className="flex flex-col gap-1 bg-sa-cream-soft/60 border border-sa-green-ink/5 rounded-sa px-4 py-3">
                  <span className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{p.lbl}</span>
                  <b className="font-mono text-lg text-sa-green-ink">{mxn(p.val)}</b>
                  {p.nota && <span className="text-[11px] text-sa-green-ink/50">{p.nota}</span>}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="En el horno ahora">
            {data.horno.length === 0 ? (
              <p className={`text-sm ${cx.muted} py-2`}>No hay nada en el horno ahora.</p>
            ) : (
              <div className="space-y-2">
                {data.horno.map((h) => (
                  <div key={h.sabor} className="flex items-center justify-between gap-2 py-2 border-b border-sa-green-ink/5 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-sa-green-ink truncate">{h.sabor}</p>
                      <p className="text-xs text-sa-green-ink/50">{h.detalle}</p>
                    </div>
                    <Pastilla cls={HORNO_ESTADO[h.estado].cls}>{HORNO_ESTADO[h.estado].txt}</Pastilla>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Más vendidos">
            {data.top.length === 0 ? (
              <p className={`text-sm ${cx.muted} py-2`}>Sin ventas aún.</p>
            ) : (
              <ol className="space-y-3">
                {data.top.map((p, i) => (
                  <li key={p.nombre}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-sa-green text-sa-cream font-mono text-[11px] font-bold shrink-0">{i + 1}</span>
                        <span className="text-sm text-sa-green-ink truncate">{p.nombre}</span>
                      </div>
                      <span className="text-sm font-mono font-semibold text-sa-green-ink shrink-0">{p.vendido}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sa-cream-soft overflow-hidden">
                      <div className="h-full bg-sa-green/60 rounded-full" style={{ width: `${Math.round((p.vendido / maxTop) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Stock bajo mínimo">
            {data.stockBajo.length === 0 ? (
              <div className="text-center py-6 text-sa-green-ink/70 font-medium">Todo por encima del mínimo ✓</div>
            ) : (
              <div className="space-y-2">
                {stockMostrado.map((s) => (
                  <div key={s.insumo} className="flex items-center justify-between px-3 py-2.5 rounded-sa bg-sa-green/8 border border-sa-green-deep/25">
                    <div className="min-w-0">
                      <p className="text-sm text-sa-green-ink truncate">{s.insumo}</p>
                      <p className="text-xs text-sa-green-ink/50">{s.almacen}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-mono font-semibold text-sa-green-deep">{s.actual}</p>
                      <p className="text-xs font-mono text-sa-green-ink/50">mín {s.minimo}</p>
                    </div>
                  </div>
                ))}
                {stockRestante > 0 && (
                  <p className="text-xs text-sa-green-ink/60 text-center pt-1">y {stockRestante} insumo{stockRestante === 1 ? '' : 's'} más. Revísalos en <b>Inventario</b>.</p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
