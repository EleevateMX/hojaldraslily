import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { ventasDiarias, productosMasVendidos, stockPorAlmacen } from '@shake/supabase'
import type { VentaDiaria, ProductoVendido, StockAlmacen } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { Panel, PageHeader, Loading, ErrorMsg, cx } from '../ui'

const HOY = new Date().toISOString().slice(0, 10)

export default function Dashboard() {
  const [dias, setDias] = useState<VentaDiaria[]>([])
  const [top, setTop] = useState<ProductoVendido[]>([])
  const [stock, setStock] = useState<StockAlmacen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([ventasDiarias(sb, 7), productosMasVendidos(sb, 6), stockPorAlmacen(sb)])
      .then(([d, t, s]) => {
        setDias(d)
        setTop(t)
        setStock(s)
        setError(null)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <Loading>Cargando panel…</Loading>

  const hoy = dias.find((d) => d.dia === HOY)
  const totalHoy = hoy?.total_ventas ?? 0
  const ordHoy = hoy?.num_ordenes ?? 0
  const ticket = hoy?.ticket_promedio ?? 0
  const semana = dias.reduce((a, d) => a + (d.total_ventas ?? 0), 0)
  const maxDia = Math.max(1, ...dias.map((d) => d.total_ventas ?? 0))
  const bajos = stock.filter((s) => s.bajo_minimo)

  const kpis = [
    { lbl: 'Ventas de hoy', val: mxn(totalHoy), sub: `${ordHoy} ${ordHoy === 1 ? 'orden' : 'órdenes'}`, accent: 'text-sa-banana' },
    { lbl: 'Ticket promedio', val: mxn(ticket), sub: 'hoy', accent: 'text-sa-blueberry' },
    { lbl: 'Ventas 7 días', val: mxn(semana), sub: 'acumulado', accent: 'text-sa-green' },
    { lbl: 'Alertas de stock', val: String(bajos.length), sub: 'bajo mínimo', accent: bajos.length ? 'text-sa-strawberry' : 'text-sa-mint' },
  ]

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={<>Resumen del día · <span className="font-mono text-sa-green-ink/80">{HOY}</span></>}
        action={
          <div className="flex items-center gap-2 bg-white border border-sa-green-ink/10 rounded-full px-4 py-2 shadow-sa-sm">
            <span className="w-2 h-2 rounded-full bg-sa-mint" />
            <span className="text-sm font-medium text-sa-green-ink">Sucursal: Principal</span>
          </div>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* KPIs del día */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((k) => (
          <div
            key={k.lbl}
            className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5 transition-all hover:shadow-sa hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{k.lbl}</span>
              <span className={`w-2.5 h-2.5 rounded-full bg-current ${k.accent}`} />
            </div>
            <p className="text-4xl font-display text-sa-green-ink leading-none">{k.val}</p>
            <p className="text-xs mt-3 text-sa-green-ink/60">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Dos columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Tendencia 7 días */}
          <Panel title="Ventas últimos 7 días">
            {dias.length === 0 ? (
              <p className={cx.muted}>Sin ventas en el periodo.</p>
            ) : (
              <div className="flex items-end gap-3 h-44 pt-2">
                {dias.map((d) => (
                  <div key={d.dia} className="flex-1 flex flex-col items-center gap-2 h-full">
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className="w-full min-h-[3px] rounded-t-lg bg-sa-green transition-all"
                        style={{ height: `${Math.round(((d.total_ventas ?? 0) / maxDia) * 100)}%` }}
                        title={mxn(d.total_ventas ?? 0)}
                      />
                    </div>
                    <span className="text-xs text-sa-green-ink/60 font-mono capitalize">
                      {new Date(d.dia + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Desglose de pago de hoy */}
          <Panel title="Cómo se cobró hoy">
            {!hoy && <p className={cx.muted}>Aún no hay ventas registradas hoy.</p>}
            {hoy && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Efectivo', hoy.efectivo ?? 0],
                  ['Tarjeta', hoy.tarjeta ?? 0],
                  ['Clip', hoy.clip ?? 0],
                  ['Cortesía', hoy.cortesia ?? 0],
                ].map(([lbl, val]) => (
                  <div key={lbl as string} className="flex flex-col gap-1 bg-sa-cream-soft/60 border border-sa-green-ink/5 rounded-sa px-4 py-3">
                    <span className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{lbl}</span>
                    <b className="font-mono text-lg text-sa-green-ink">{mxn(val as number)}</b>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          {/* Top productos */}
          <Panel title="Más vendidos">
            {top.length === 0 ? (
              <p className={cx.muted}>Sin datos aún.</p>
            ) : (
              <ol className="space-y-2">
                {top.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between py-2 border-b border-sa-green-ink/5 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-sa-green text-sa-cream font-mono text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-sa-green-ink truncate">{p.nombre}</span>
                    </div>
                    <span className="text-sm font-mono font-semibold text-sa-green-ink shrink-0 ml-2">{p.total_vendido}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* Alertas de stock */}
          <Panel title="Stock bajo mínimo">
            {bajos.length === 0 ? (
              <div className="text-center py-6 text-sa-green font-medium">Todo por encima del mínimo ✓</div>
            ) : (
              <div className="space-y-2">
                {bajos.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-sa bg-sa-strawberry/10 border border-sa-strawberry/30"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-sa-green-ink truncate">{s.insumo}</p>
                      <p className="text-xs text-sa-green-ink/50">{s.almacen}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-mono font-semibold text-sa-strawberry">{s.stock_actual} {s.unidad}</p>
                      <p className="text-xs font-mono text-sa-green-ink/50">mín {s.stock_minimo}</p>
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
