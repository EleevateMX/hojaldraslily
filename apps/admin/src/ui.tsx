import type { ReactNode } from 'react'

/**
 * Piel de marca compartida (demo aesthetic) para el Admin.
 * Solo presentación — sin lógica de datos.
 */

// ── Clases reutilizables ────────────────────────────────────────────────────
export const cx = {
  panel: 'bg-white rounded-sa p-6 shadow-sa-sm border border-sa-green-ink/5',
  h3: 'text-xl font-display text-sa-green-ink',
  tableWrap: 'bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 overflow-hidden overflow-x-auto',
  table: 'w-full text-sm',
  thead: 'bg-sa-cream-soft border-b border-sa-green-ink/10 text-left text-sa-green-ink/60 font-mono text-xs uppercase tracking-wide',
  th: 'px-5 py-3 font-medium whitespace-nowrap',
  thNum: 'px-5 py-3 font-medium text-right whitespace-nowrap',
  tbody: 'divide-y divide-sa-green-ink/5',
  tr: 'hover:bg-sa-cream-soft/50 transition-colors',
  td: 'px-5 py-3 text-sa-green-ink',
  tdNum: 'px-5 py-3 text-right font-mono tabular-nums text-sa-green-ink',
  /**
   * Columna de acciones que se queda pegada al borde derecho.
   *
   * Sin esto, en una ventana angosta los botones se van detrás del scroll
   * horizontal y quedan invisibles: la fila se ve completa —nombre, estado,
   * conexión— y da la impresión de que no hay nada que hacer con ella. Pasó
   * de verdad con "Rotar token" en Impresoras.
   */
  thAcciones:
    'px-5 py-3 font-medium text-right whitespace-nowrap sticky right-0 z-10 bg-sa-cream-soft',
  tdAcciones:
    'px-5 py-3 text-right sticky right-0 z-10 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]',
  btnPrimary:
    'bg-sa-green hover:bg-sa-green-deep text-sa-cream px-5 py-2.5 rounded-sa font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-default',
  btnSec:
    'border border-sa-green-ink/15 text-sa-green-ink px-4 py-2.5 rounded-sa font-medium text-sm hover:bg-sa-cream-soft transition-colors',
  input:
    'w-full px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sa-green/40',
  label: 'text-xs font-mono text-sa-green-ink/60 uppercase tracking-wide',
  muted: 'text-sa-green-ink/50',
}

// ── Componentes de presentación ─────────────────────────────────────────────
export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`${cx.panel} ${className}`}>
      {title && <h3 className={`${cx.h3} mb-4`}>{title}</h3>}
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
      <div>
        <h2 className="text-4xl font-display text-sa-green-ink tracking-wide">{title}</h2>
        {subtitle && <p className="text-sa-green-ink/60 text-sm mt-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={cx.label}>{label}</span>
      {children}
    </label>
  )
}

export function ErrorMsg({ children }: { children: ReactNode }) {
  return (
    <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 text-sa-strawberry px-4 py-3 rounded-sa text-sm font-medium mb-4">
      {children}
    </div>
  )
}

export function OkMsg({ children }: { children: ReactNode }) {
  return (
    <div className="bg-sa-mint/20 border border-sa-mint/40 text-sa-green-deep px-4 py-3 rounded-sa text-sm font-medium mb-4">
      {children}
    </div>
  )
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="p-16 text-center text-sa-green font-medium">{children}</div>
}

export function Chip({ tone, children }: { tone: 'si' | 'no' | 'neutral'; children: ReactNode }) {
  const tones = {
    si: 'bg-sa-mint/30 text-sa-green-ink',
    no: 'bg-sa-cream-warm text-sa-green-ink/60',
    neutral: 'bg-sa-blueberry/15 text-sa-blueberry',
  }
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tones[tone]}`}>{children}</span>
}
