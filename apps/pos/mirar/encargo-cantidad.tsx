/**
 * El renglon con el que se arma un encargo, para probar que la cantidad se
 * TECLEA y no solo se sube de uno en uno.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/encargo-cantidad.html
 *
 * Existe porque el caso que lo pidio son los pastelitos de solo queso: se
 * encargan en cualquier cantidad (13, 15, 17) y con un boton de "+" eso eran
 * trece toques con el cliente al telefono.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'

const FILAS = [
  { producto_id: 'a', nombre: 'Pastelitos solo queso · 1 pza', medida: '1 pieza', libre: 'se hornea al pedido' },
  { producto_id: 'b', nombre: 'Pastelitos de Lomo · 5 pzas', medida: '5 piezas', libre: 'se hornea al pedido' },
  { producto_id: 'c', nombre: 'Jamón y Queso · Chica · 24 cuadros', medida: 'Chica', libre: '14 libres' },
]

function App() {
  const [piezas, setPiezas] = useState<Record<string, number>>({})
  const total = Object.values(piezas).reduce((s, n) => s + n, 0)
  return (
    <div className="p-6 space-y-2" style={{ background: 'var(--sa-cream)', minHeight: '100vh' }}>
      <p className="font-display text-xl text-sa-green-ink mb-3">Apartar un encargo</p>
      {FILAS.map((f) => {
        const n = piezas[f.producto_id] ?? 0
        return (
          <div key={f.producto_id} className={['flex items-center gap-2 rounded-sa border p-2 bg-white',
            n > 0 ? 'border-sa-green' : 'border-sa-green-ink/10'].join(' ')}>
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm text-sa-green-ink leading-tight">{f.nombre}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                {f.medida} · {f.libre}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setPiezas((p) => ({ ...p, [f.producto_id]: Math.max(0, n - 1) }))}
                disabled={n === 0}
                className="w-8 h-8 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
              >−</button>
              <input
                type="text"
                inputMode="numeric"
                value={n === 0 ? '' : String(n)}
                onChange={(e) =>
                  setPiezas((p) => ({
                    ...p,
                    [f.producto_id]: Math.min(999, Number(e.target.value.replace(/\D/g, '') || 0)),
                  }))
                }
                placeholder="0"
                className="font-mono text-sm w-10 text-center tabular-nums bg-transparent border-b border-sa-green-ink/15 focus:outline-none focus:border-sa-green"
              />
              <button
                onClick={() => setPiezas((p) => ({ ...p, [f.producto_id]: n + 1 }))}
                className="w-8 h-8 rounded-full bg-sa-green text-sa-cream"
              >+</button>
            </div>
          </div>
        )
      })}
      <p className="font-body text-sm text-sa-green-ink/70 pt-2">
        {total > 0 ? `${total} pieza${total === 1 ? '' : 's'}` : 'Todavía no ha puesto nada'}
      </p>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
