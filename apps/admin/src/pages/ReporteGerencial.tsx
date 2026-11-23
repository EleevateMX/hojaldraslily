import { useState, type ReactNode } from 'react'
import { mxn } from '@lily/utils'
import { Panel, PageHeader, cx } from '../ui'

/**
 * PREVIA del reporte gerencial (no ruteado; no toca Dashboard.tsx).
 *
 * Responde preguntas de gerencia con comparativas: cuándo se vende más (mapa
 * de calor día×hora), qué día vende más, qué producto manda en cada día, y qué
 * subió/bajó contra el periodo anterior. Inspirado en los dashboards de Astryx
 * (scorecard, comparison, composition), en el stack y la marca de Lily.
 */

type Delta = { pct: number; buenoSiSube: boolean }
export type Kpi = { lbl: string; val: string; sub: string; delta?: Delta }
export type Insight = { tono: 'alza' | 'baja' | 'dato'; titulo: string; detalle: string }
export type CeldaCalor = { dia: number; hora: number; total: number }
export type DiaSemana = { dia: string; promedio: number; esPico?: boolean }
export type ProductoDia = { dia: string; producto: string; unidades: number }
export type Composicion = { etiqueta: string; pct: number; total: number }
export type Mover = { producto: string; pct: number }

export type ReporteData = {
  periodo: string
  kpis: Kpi[]
  insights: Insight[]
  horas: number[]
  dias: string[]
  calor: CeldaCalor[]
  porDiaSemana: DiaSemana[]
  productoPorDia: ProductoDia[]
  categorias: Composicion[]
  canales: Composicion[]
  subieron: Mover[]
  bajaron: Mover[]
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function DeltaPill({ d }: { d: Delta }) {
  const sube = d.pct > 0
  const plano = d.pct === 0
  const bueno = plano ? null : sube === d.buenoSiSube
  const flecha = plano ? '→' : sube ? '▲' : '▼'
  const tono = bueno === null ? 'bg-sa-cream-warm text-sa-green-ink/60'
    : bueno ? 'bg-sa-mint/40 text-sa-green-ink' : 'bg-sa-green/12 text-sa-green-deep'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono font-semibold ${tono}`}>
      <span aria-hidden>{flecha}</span>{sube ? '+' : ''}{d.pct.toFixed(1)}%
    </span>
  )
}

function Scorecard({ k }: { k: Kpi }) {
  return (
    <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
      <p className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{k.lbl}</p>
      <div className="mt-2 flex items-end justify-between gap-2 flex-wrap">
        <p className="text-3xl font-display text-sa-green-ink leading-none">{k.val}</p>
        {k.delta && <DeltaPill d={k.delta} />}
      </div>
      <p className="text-xs mt-3 text-sa-green-ink/60">{k.sub}</p>
    </div>
  )
}

const INSIGHT_ESTILO: Record<Insight['tono'], { punto: string; et: string }> = {
  alza: { punto: 'bg-sa-mint', et: 'text-sa-green-ink' },
  baja: { punto: 'bg-sa-green-deep', et: 'text-sa-green-deep' },
  dato: { punto: 'bg-sa-blueberry', et: 'text-sa-green-ink' },
}

function InsightCard({ i }: { i: Insight }) {
  const e = INSIGHT_ESTILO[i.tono]
  return (
    <div className="bg-white rounded-sa p-4 shadow-sa-sm border border-sa-green-ink/5">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${e.punto}`} />
        <span className="text-xs font-mono text-sa-green-ink/50 uppercase tracking-wide">
          {i.tono === 'alza' ? 'Al alza' : i.tono === 'baja' ? 'A la baja' : 'Dato'}
        </span>
      </div>
      <p className={`text-base font-display ${e.et}`}>{i.titulo}</p>
      <p className="text-xs text-sa-green-ink/60 mt-1">{i.detalle}</p>
    </div>
  )
}

/** Celda del mapa de calor: carmín con alfa según intensidad. */
function celdaColor(v: number, max: number): { backgroundColor: string; color: string } {
  const a = max <= 0 ? 0 : Math.max(0.05, v / max)
  return { backgroundColor: `rgba(216,27,74,${a.toFixed(3)})`, color: a > 0.55 ? 'var(--sa-cream)' : 'var(--sa-green-ink)' }
}

function etiquetaHora(h: number): string {
  const am = h < 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${am ? 'a' : 'p'}`
}

function Barra({ valor, max, resaltar }: { valor: number; max: number; resaltar?: boolean }) {
  return (
    <div className="flex-1 w-full flex items-end">
      <div className={`w-full min-h-[3px] rounded-t-lg transition-all ${resaltar ? 'bg-sa-green' : 'bg-sa-green/35'}`}
        style={{ height: `${Math.round((valor / max) * 100)}%` }} />
    </div>
  )
}

function ComposicionBarra({ filas }: { filas: Composicion[] }) {
  const paleta = ['bg-sa-green', 'bg-sa-mango', 'bg-sa-blueberry', 'bg-sa-mint', 'bg-sa-strawberry', 'bg-sa-banana']
  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden bg-sa-cream-soft">
        {filas.map((f, i) => (
          <div key={f.etiqueta} className={paleta[i % paleta.length]} style={{ width: `${f.pct}%` }} title={`${f.etiqueta} ${f.pct}%`} />
        ))}
      </div>
      <div className="space-y-1.5">
        {filas.map((f, i) => (
          <div key={f.etiqueta} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${paleta[i % paleta.length]}`} />
              <span className="text-sa-green-ink truncate">{f.etiqueta}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-sa-green-ink/60 text-xs">{mxn(f.total)}</span>
              <b className="font-mono text-sa-green-ink tabular-nums w-10 text-right">{f.pct}%</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Seccion({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className={cx.h3}>{title}</h3>
        {hint && <span className="text-xs font-mono text-sa-green-ink/50 uppercase tracking-wide">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

const PERIODOS = ['Esta semana', 'Este mes', '90 días']

export default function ReporteGerencial({
  data,
  periodoActivo,
  onCambiarPeriodo,
}: {
  data: ReporteData
  /** Periodo seleccionado, cuando lo controla el contenedor (para refetch). */
  periodoActivo?: number
  onCambiarPeriodo?: (i: number) => void
}) {
  const [piLocal, setPiLocal] = useState(periodoActivo ?? 1)
  const pi = periodoActivo ?? piLocal
  const setPi = onCambiarPeriodo ?? setPiLocal
  const maxCalor = Math.max(1, ...data.calor.map((c) => c.total))
  const maxDia = Math.max(1, ...data.porDiaSemana.map((d) => d.promedio))
  const maxProd = Math.max(1, ...data.productoPorDia.map((p) => p.unidades))
  const celda = (dia: number, hora: number) => data.calor.find((c) => c.dia === dia && c.hora === hora)?.total ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporte gerencial"
        subtitle={<>{PERIODOS[pi]} · <span className="font-mono text-sa-green-ink/80">{data.periodo}</span></>}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-full bg-white border border-sa-green-ink/10 p-1 shadow-sa-sm">
              {PERIODOS.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPi(i)}
                  aria-pressed={i === pi}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${i === pi ? 'bg-sa-green text-sa-cream' : 'text-sa-green-ink/60 hover:text-sa-green-ink'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button type="button" className={cx.btnSec} onClick={() => window.print()}>Exportar PDF</button>
          </div>
        }
      />

      {/* Titulares gerenciales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.insights.map((i) => <InsightCard key={i.titulo} i={i} />)}
      </div>

      {/* KPIs del mes vs mes pasado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.kpis.map((k) => <Scorecard key={k.lbl} k={k} />)}
      </div>

      {/* Mapa de calor: cuándo se vende más */}
      <Panel title="¿Cuándo se vende más?">
        <p className="text-sm text-sa-green-ink/60 -mt-2 mb-4">Ventas por día de la semana y hora. Más carmín = más ventas.</p>
        <div className="overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: '3px' }}>
            <thead>
              <tr>
                <th />
                {data.horas.map((h) => (
                  <th key={h} className="text-[10px] font-mono text-sa-green-ink/50 font-normal pb-1">{etiquetaHora(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.dias.map((diaNombre, d) => (
                <tr key={diaNombre}>
                  <td className="pr-2 text-xs font-mono text-sa-green-ink/70 capitalize whitespace-nowrap">{diaNombre}</td>
                  {data.horas.map((h) => {
                    const v = celda(d, h)
                    const esPico = v === maxCalor
                    return (
                      <td key={h}>
                        <div
                          className={`w-7 h-7 rounded flex items-center justify-center text-[9px] font-mono tabular-nums ${esPico ? 'ring-2 ring-sa-green-deep' : ''}`}
                          style={celdaColor(v, maxCalor)}
                          title={`${diaNombre} ${etiquetaHora(h)} · ${mxn(v)}`}
                        >
                          {v >= maxCalor * 0.5 ? Math.round(v / 1000) : ''}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-sa-green-ink/50 mt-3">El cuadro con borde es el pico (el número es miles de pesos).</p>
      </Panel>

      {/* Día de la semana + producto por día */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Ventas por día de la semana">
            <p className="text-sm text-sa-green-ink/60 -mt-2 mb-4">Promedio del periodo. El sábado es tu mejor día.</p>
            <div className="flex items-end gap-3 h-40">
              {data.porDiaSemana.map((d) => (
                <div key={d.dia} className="flex-1 flex flex-col items-center gap-2 h-full">
                  <span className="text-[11px] font-mono text-sa-green-ink/70 tabular-nums">{Math.round(d.promedio / 1000)}k</span>
                  <Barra valor={d.promedio} max={maxDia} resaltar={d.esPico} />
                  <span className={`text-xs font-mono capitalize ${d.esPico ? 'text-sa-green-ink font-semibold' : 'text-sa-green-ink/60'}`}>{d.dia}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Producto estrella por día">
            <p className="text-sm text-sa-green-ink/60 -mt-2 mb-4">Lo más vendido en cada día de la semana.</p>
            <div className="space-y-2">
              {data.productoPorDia.map((p) => (
                <div key={p.dia} className="flex items-center gap-3">
                  <span className="w-10 text-xs font-mono text-sa-green-ink/70 capitalize shrink-0">{p.dia}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm text-sa-green-ink truncate">{p.producto}</span>
                      <span className="text-sm font-mono font-semibold text-sa-green-ink shrink-0">{p.unidades}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sa-cream-soft overflow-hidden">
                      <div className="h-full bg-sa-green/60 rounded-full" style={{ width: `${Math.round((p.unidades / maxProd) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Composición por categoría">
            <ComposicionBarra filas={data.categorias} />
          </Panel>

          <Panel title="Por canal">
            <ComposicionBarra filas={data.canales} />
          </Panel>

          <Panel title="Este mes vs el pasado">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-mono text-sa-green-ink/50 uppercase tracking-wide mb-2">Lo que más subió</p>
                <div className="space-y-1.5">
                  {data.subieron.map((m) => (
                    <div key={m.producto} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-sa-green-ink truncate">{m.producto}</span>
                      <DeltaPill d={{ pct: m.pct, buenoSiSube: true }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-2 border-t border-sa-green-ink/5">
                <p className="text-xs font-mono text-sa-green-ink/50 uppercase tracking-wide mb-2">Lo que más bajó</p>
                <div className="space-y-1.5">
                  {data.bajaron.map((m) => (
                    <div key={m.producto} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-sa-green-ink truncate">{m.producto}</span>
                      <DeltaPill d={{ pct: m.pct, buenoSiSube: true }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
