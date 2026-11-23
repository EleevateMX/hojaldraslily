import type { ReactNode } from 'react'

/**
 * PREVIA de la navegación del Admin (no ruteada; no toca App.tsx).
 *
 * Hoy la barra son 17 ítems planos. La propuesta los agrupa en secciones con
 * encabezado, suma el nuevo «Reporte gerencial» y mantiene la marca (carmín
 * profundo `sa-green-deep`, crema). Mismo patrón responsive: lateral en PC,
 * cabecera con menú en el teléfono.
 */

function Ico() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 opacity-80">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

type Item = { label: string; nuevo?: boolean }
type Grupo = { titulo: string; items: Item[] }

// ── IA propuesta: 5 secciones ───────────────────────────────────────────────
export const GRUPOS: Grupo[] = [
  { titulo: 'Resumen', items: [{ label: 'Dashboard' }, { label: 'Reporte gerencial', nuevo: true }, { label: 'En vivo' }] },
  { titulo: 'Operación', items: [{ label: 'Producción' }, { label: 'Almacén' }, { label: 'Menús del día' }, { label: 'Inventario' }] },
  { titulo: 'Ventas y dinero', items: [{ label: 'Ventas' }, { label: 'Cortes de caja' }, { label: 'Facturación' }] },
  { titulo: 'Catálogo', items: [{ label: 'Menú' }, { label: 'Categorías' }, { label: 'Combos' }] },
  { titulo: 'Sistema', items: [{ label: 'Empleados' }, { label: 'Impresoras' }, { label: 'Descargas' }, { label: 'Diagnóstico' }, { label: 'Sistema' }] },
]

// Lista plana de hoy (orden real de App.tsx), para el antes/después.
export const PLANO: string[] = [
  'Dashboard', 'En vivo', 'Producción', 'Almacén', 'Menús del día', 'Diagnóstico', 'Menú',
  'Categorías', 'Combos', 'Inventario', 'Ventas', 'Cortes de caja', 'Facturación',
  'Empleados', 'Impresoras', 'Descargas', 'Sistema',
]

function Fila({ label, activo, nuevo }: { label: string; activo?: boolean; nuevo?: boolean }) {
  return (
    <div
      className={`md:w-full flex items-center gap-3 px-4 py-2.5 rounded-sa-lg text-sm whitespace-nowrap ${
        activo ? 'bg-sa-cream text-sa-green-ink font-semibold shadow-sa-sm' : 'text-sa-cream/80 font-medium'
      }`}
    >
      <Ico />
      <span>{label}</span>
      {nuevo && (
        <span className="ml-auto text-[10px] font-mono uppercase bg-sa-cream text-sa-green-deep px-1.5 py-0.5 rounded-full">nuevo</span>
      )}
    </div>
  )
}

function Marco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-mono text-sa-green-ink/60 uppercase tracking-wide mb-2">{titulo}</p>
      <aside className="w-60 rounded-sa-lg bg-sa-green-deep text-sa-cream flex flex-col overflow-hidden shadow-sa">
        <div className="px-6 pt-6 pb-4">
          <div className="h-6 w-28 rounded bg-sa-cream/90" />
        </div>
        {children}
        <div className="px-4 py-3 border-t border-sa-cream/10">
          <p className="text-[11px] font-mono uppercase tracking-wider text-sa-cream/40 px-1">Hojaldras Lily · Admin</p>
        </div>
      </aside>
    </div>
  )
}

/** Barra agrupada (propuesta). */
export function NavAgrupada({ activo = 'Dashboard' }: { activo?: string }) {
  return (
    <Marco titulo="Después · agrupado por secciones">
      <nav className="flex flex-col gap-4 px-3 pb-3">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <p className="text-[11px] font-mono uppercase tracking-wider text-sa-cream/45 px-3 mb-1">{g.titulo}</p>
            <div className="flex flex-col gap-1">
              {g.items.map((it) => <Fila key={it.label} label={it.label} nuevo={it.nuevo} activo={it.label === activo} />)}
            </div>
          </div>
        ))}
      </nav>
    </Marco>
  )
}

/** Barra plana (como está hoy). */
export function NavPlana({ activo = 'Dashboard' }: { activo?: string }) {
  return (
    <Marco titulo="Antes · 17 ítems planos">
      <nav className="flex flex-col gap-1 px-3 pb-3">
        {PLANO.map((label) => <Fila key={label} label={label} activo={label === activo} />)}
      </nav>
    </Marco>
  )
}

/** Teléfono: cabecera con la sección actual + menú agrupado abierto. */
export function NavTelefono() {
  return (
    <div>
      <p className="text-xs font-mono text-sa-green-ink/60 uppercase tracking-wide mb-2">Teléfono · menú abierto</p>
      <div className="w-[300px] rounded-sa-lg bg-sa-green-deep text-sa-cream overflow-hidden shadow-sa">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="h-5 w-20 rounded bg-sa-cream/90" />
          <div className="flex items-center gap-2 bg-sa-cream text-sa-green-ink font-semibold text-sm px-3 py-1.5 rounded-sa-lg shadow-sa-sm">
            <Ico /><span>Dashboard</span><span className="text-xs">▲</span>
          </div>
        </div>
        <nav className="flex flex-col gap-3 px-3 pb-3">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <p className="text-[11px] font-mono uppercase tracking-wider text-sa-cream/45 px-3 mb-1">{g.titulo}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((it) => <Fila key={it.label} label={it.label} nuevo={it.nuevo} activo={it.label === 'Dashboard'} />)}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  )
}

export default function NavPreview() {
  return (
    <div className="flex flex-wrap items-start gap-8">
      <NavPlana />
      <NavAgrupada />
      <NavTelefono />
    </div>
  )
}
