import type { ReactNode } from 'react'

/**
 * Piezas visuales compartidas del Dashboard: las usa `DashboardVista`, que
 * alimentan la pantalla real (`Dashboard.tsx`, con datos de Supabase) y el
 * arnés `mirar/dashboard.html` (con datos de ejemplo). Una sola fuente.
 *
 * Regla de color de la casa: lo que ALARMA va en carmín profundo
 * (`sa-green-deep`), nunca en salmón.
 */

export type Delta = { pct: number; buenoSiSube: boolean }
export type Kpi = { lbl: string; val: string; sub: string; delta?: Delta }
export type Callout = { tono: 'urgente' | 'aviso' | 'ok'; titulo: string; detalle: string }

/** Delta vs el periodo anterior: flecha + % en pastilla, color por si es bueno. */
export function DeltaPill({ d }: { d: Delta }) {
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

/** Scorecard: etiqueta, cifra grande y el cambio vs el periodo anterior. */
export function Scorecard({ k }: { k: Kpi }) {
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
  urgente: { caja: 'bg-sa-green/8 border-sa-green-deep/30', punto: 'bg-sa-green-deep', etiqueta: 'text-sa-green-deep' },
  aviso: { caja: 'bg-sa-banana/15 border-sa-banana/50', punto: 'bg-sa-mango', etiqueta: 'text-sa-green-ink' },
  ok: { caja: 'bg-sa-mint/15 border-sa-mint/40', punto: 'bg-sa-mint', etiqueta: 'text-sa-green-ink' },
}

/** Una tarjeta del riel «qué hay que atender hoy». */
export function CalloutCard({ c }: { c: Callout }) {
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

export function Pastilla({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{children}</span>
}
