import type { ReactNode } from 'react'
import { mxn } from '@lily/utils'
import { Panel, PageHeader, cx } from '../ui'

/**
 * PREVIA del dashboard mejorado (no está ruteada; no reemplaza a Dashboard.tsx).
 * Solo presentación: recibe todo por `data`, para mirarse con datos de una
 * tienda de mediodía en `apps/admin/mirar/dashboard.html`.
 *
 * Inspirada en los patrones de dashboard de Astryx (scorecards con delta +
 * color semáforo, riel de «qué hay que atender», comparación contra el periodo
 * anterior), pero armada en el stack y la marca de Lily.
 *
 * Reglas de color de la casa: lo que ALARMA va en carmín profundo
 * (`sa-green-deep`), nunca en salmón (`sa-strawberry` es un acento, se ve
 * despintado de lejos).
 */

type Delta = { pct: number; buenoSiSube: boolean }
export type Kpi = { lbl: string; val: string; sub: string; delta?: Delta }
export type Callout = {
  tono: 'urgente' | 'aviso' | 'ok'
  titulo: string
  detalle: string
}
export type DiaVenta = { etiqueta: string; total: number; esHoy?: boolean }
export type Pago = { lbl: string; val: number; nota?: string }
export type TopProd = { nombre: string; vendido: number }
export type HornoItem = { sabor: string; estado: 'horno' | 'espera' | 'listo'; detalle: string }
export type StockBajo = { insumo: string; almacen: string; actual: string; minimo: string }

export type DashboardData = {
  fecha: string
  sucursal: string
  kpis: Kpi[]
  pendientes: Callout[]
  semana: DiaVenta[]
  totalSemana: number
  deltaSemana: number
  pagos: Pago[]
  top: TopProd[]
  horno: HornoItem[]
  stockBajo: StockBajo[]
}

// ── Piezas chicas ───────────────────────────────────────────────────────────

/** Delta vs el periodo anterior: flecha + % en pastilla, color por si es bueno. */
function DeltaPill({ d }: { d: Delta }) {
  const sube = d.pct > 0
  const plano = d.pct === 0
  const bueno = plano ? null : sube === d.buenoSiSube
  const flecha = plano ? '→' : sube ? '▲' : '▼'
  const tono =
    bueno === null
      ? 'bg-sa-cream-warm text-sa-green-ink/60'
      : bueno
        ? 'bg-sa-mint/40 text-sa-green-ink'
        : 'bg-sa-green/12 text-sa-green-deep'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono font-semibold ${tono}`}>
      <span aria-hidden>{flecha}</span>
      {sube ? '+' : ''}{d.pct.toFixed(1)}%
    </span>
  )
}

/** Scorecard: etiqueta, cifra grande y el cambio vs ayer. */
function Scorecard({ k }: { k: Kpi }) {
  return (
    <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
      <p className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{k.lbl}</p>
      <div className="mt-2 flex items-end justify-between gap-2 flex-wrap">
        <p className="text-4xl font-display text-sa-green-ink leading-none">{k.val}</p>
        {k.delta && <DeltaPill d={k.delta} />}
      </div>
      <p className="text-xs mt-3 text-sa-green-ink/60">{k.sub}</p>
    </div>
  )
}

const CALLOUT_ESTILO: Record<Callout['tono'], { caja: string; punto: string; etiqueta: string }> = {
  // Urgente = carmín profundo (la regla de la casa). Aviso = dorado/banana.
  urgente: { caja: 'bg-sa-green/8 border-sa-green-deep/30', punto: 'bg-sa-green-deep', etiqueta: 'text-sa-green-deep' },
  aviso: { caja: 'bg-sa-banana/15 border-sa-banana/50', punto: 'bg-sa-mango', etiqueta: 'text-sa-green-ink' },
  ok: { caja: 'bg-sa-mint/15 border-sa-mint/40', punto: 'bg-sa-mint', etiqueta: 'text-sa-green-ink' },
}

/** Una tarjeta del riel «qué hay que atender hoy». */
function CalloutCard({ c }: { c: Callout }) {
  const e = CALLOUT_ESTILO[c.tono]
  return (
    <div className={`rounded-sa border px-4 py-3 ${e.caja}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${e.punto}`} />
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${e.etiqueta}`}>{c.titulo}</p>
          <p className="text-xs text-sa-green-ink/60 mt-0.5">{c.detalle}</p>
        </div>
      </div>
    </div>
  )
}

const HORNO_ESTADO: Record<HornoItem['estado'], { txt: string; cls: string }> = {
  horno: { txt: 'En el horno', cls: 'bg-sa-mango/20 text-sa-green-ink' },
  espera: { txt: 'Esperando', cls: 'bg-sa-blueberry/15 text-sa-blueberry' },
  listo: { txt: 'Listo', cls: 'bg-sa-mint/30 text-sa-green-ink' },
}

function Pastilla({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{children}</span>
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function DashboardPreview({ data }: { data: DashboardData }) {
  const maxDia = Math.max(1, ...data.semana.map((d) => d.total))
  const maxTop = Math.max(1, ...data.top.map((t) => t.vendido))

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={<>Resumen del día · <span className="font-mono text-sa-green-ink/80">{data.fecha}</span></>}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            {/* Toggle de periodo (visual en la previa) */}
            <div className="inline-flex rounded-full bg-white border border-sa-green-ink/10 p-1 shadow-sa-sm">
              {['Hoy', '7 días', '30 días'].map((p, i) => (
                <span
                  key={p}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${i === 0 ? 'bg-sa-green text-sa-cream' : 'text-sa-green-ink/60'}`}
                >
                  {p}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white border border-sa-green-ink/10 rounded-full px-4 py-2 shadow-sa-sm">
              <span className="w-2 h-2 rounded-full bg-sa-mint" />
              <span className="text-sm font-medium text-sa-green-ink">Sucursal: {data.sucursal}</span>
            </div>
          </div>
        }
      />

      {/* KPIs con delta vs ayer */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {data.kpis.map((k) => <Scorecard key={k.lbl} k={k} />)}
      </div>

      {/* Riel «qué hay que atender hoy» — lo nuevo más útil */}
      <div className="bg-white rounded-sa p-6 shadow-sa-sm border border-sa-green-ink/5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className={cx.h3}>Qué hay que atender hoy</h3>
          <span className="text-xs font-mono text-sa-green-ink/50 uppercase tracking-wide">{data.pendientes.length} cosas</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.pendientes.map((c) => <CalloutCard key={c.titulo} c={c} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna ancha */}
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Ventas últimos 7 días">
            <div className="flex items-end gap-3 h-44 pt-6">
              {data.semana.map((d) => (
                <div key={d.etiqueta} className="flex-1 flex flex-col items-center gap-2 h-full">
                  <span className="text-[11px] font-mono text-sa-green-ink/70 tabular-nums">{Math.round(d.total / 1000)}k</span>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={`w-full min-h-[3px] rounded-t-lg transition-all ${d.esHoy ? 'bg-sa-green' : 'bg-sa-green/35'}`}
                      style={{ height: `${Math.round((d.total / maxDia) * 100)}%` }}
                      title={mxn(d.total)}
                    />
                  </div>
                  <span className={`text-xs font-mono capitalize ${d.esHoy ? 'text-sa-green-ink font-semibold' : 'text-sa-green-ink/60'}`}>{d.etiqueta}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-sa-green-ink/5 flex items-center justify-between">
              <span className="text-sm text-sa-green-ink/60">Total 7 días</span>
              <span className="flex items-center gap-2">
                <b className="font-mono text-lg text-sa-green-ink">{mxn(data.totalSemana)}</b>
                <DeltaPill d={{ pct: data.deltaSemana, buenoSiSube: true }} />
                <span className="text-xs text-sa-green-ink/50">vs semana pasada</span>
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

        {/* Columna angosta */}
        <div className="space-y-6">
          <Panel title="En el horno ahora">
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
          </Panel>

          <Panel title="Más vendidos">
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
          </Panel>

          <Panel title="Stock bajo mínimo">
            {data.stockBajo.length === 0 ? (
              <div className="text-center py-6 text-sa-green-ink/70 font-medium">Todo por encima del mínimo ✓</div>
            ) : (
              <div className="space-y-2">
                {data.stockBajo.map((s) => (
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
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
