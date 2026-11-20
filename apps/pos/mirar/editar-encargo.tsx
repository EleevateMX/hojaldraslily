/**
 * Editar un encargo desde la caja: que el botón «Editar» ABRA el formulario a
 * la vista y que las cuatro acciones (Cancelar · Editar · Anticipo · Cobrar)
 * quepan en la tarjeta sin empujarse unas a otras.
 *
 *     cd apps/pos && pnpm dev   →   /mirar/editar-encargo.html
 *
 * Se reproduce la estructura REAL de la pantalla: un contenedor que scrollea
 * por dentro (no la ventana) con el formulario arriba y la cola de tarjetas
 * abajo. El defecto que esto mira: antes `window.scrollTo` no movía ese
 * contenedor, así que al tocar «Editar» con la lista larga no pasaba nada.
 */
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { mxn } from '@lily/utils'
import '../src/index.css'

const btn =
  'font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full transition-colors'

type Enc = {
  id: string
  folio: number | null
  cliente: string
  telefono: string
  hora: string
  items: { cantidad: number; sabor: string; medida: string }[]
  total: number
  anticipo: number
}

let n = 0
const e = (
  cliente: string,
  hora: string,
  items: Enc['items'],
  extra: Partial<Enc> = {},
): Enc => ({
  id: String(++n),
  folio: null,
  cliente,
  telefono: '999 123 4567',
  hora,
  items,
  total: items.reduce((s) => s, 0) || 620,
  anticipo: 0,
  ...extra,
})

const encargos: Enc[] = [
  e('Marisol Pech', '10:00 a.m.', [{ cantidad: 2, sabor: 'Jamón y Queso', medida: 'Chica' }], { total: 620 }),
  e('Luis Canul', '10:00 a.m.', [{ cantidad: 3, sabor: 'Fiesta', medida: '24 cuadros' }], { total: 960, anticipo: 200 }),
  e('Oficina Kanasín', '12:00 p.m.', [{ cantidad: 1, sabor: 'Trenza Suiza', medida: '' }], { total: 160 }),
  e('Fer Canto', '12:00 p.m.', [{ cantidad: 2, sabor: 'Guayaba', medida: 'Grande' }], { total: 1080 }),
  e('Sra. Tun', '12:30 p.m.', [{ cantidad: 4, sabor: 'Pastelitos de Lomo', medida: '5 pzas' }], { total: 560 }),
  e('Panadería Sur', '1:00 p.m.', [{ cantidad: 2, sabor: 'Jamón y Queso', medida: 'Grande' }], { total: 1080 }),
]

function Demo() {
  const [editando, setEditando] = useState<string | null>(null)
  const [cliente, setCliente] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  function abrirEdicion(x: Enc) {
    setEditando(x.id)
    setCliente(x.cliente)
    // El arreglo: sube el contenedor que de verdad scrollea.
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="h-dvh flex flex-col bg-sa-cream-paper overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-5 py-3 bg-sa-green-deep text-sa-cream flex-shrink-0">
        <h1 className="font-display text-2xl">Encargos</h1>
        <button className={`${btn} bg-sa-cream text-sa-green-deep`}>Apartar uno nuevo</button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {editando && (
          <section className="bg-white rounded-sa shadow-sa-sm p-5 space-y-3 ring-2 ring-sa-green">
            <p className="font-display text-xl text-sa-green-ink">Editar el encargo</p>
            <p className="font-body text-sm text-sa-green-ink/60 -mt-2">
              Se corrige lo apartado: nombre, fecha, hora, piezas o nota. El
              folio se sigue asignando hasta que se cobre.
            </p>
            <input
              className="w-full px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
              value={cliente}
              onChange={(ev) => setCliente(ev.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditando(null)} className={`${btn} border border-sa-green-ink/15 text-sa-green-ink`}>
                Cancelar
              </button>
              <button className="bg-sa-green text-sa-cream px-6 py-2.5 rounded-sa font-medium text-sm">
                Guardar cambios
              </button>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {encargos.map((x) => (
            <div key={x.id} className="rounded-sa border border-sa-green-ink/10 p-4 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg text-sa-green-ink leading-tight">{x.cliente}</p>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-0.5">
                    {x.folio != null ? `#${x.folio}` : 'Folio pendiente'} · {x.telefono}
                  </p>
                </div>
                <p className="font-display text-base shrink-0 text-sa-green-ink/70">{x.hora}</p>
              </div>
              <div className="mt-3 space-y-1">
                {x.items.map((i, k) => (
                  <p key={k} className="font-body text-sm text-sa-green-ink">
                    <span className="font-display text-base">{i.cantidad}</span> {i.sabor}
                    {i.medida && <span className="text-sa-green-ink/50"> · {i.medida}</span>}
                  </p>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-sa-green-ink/8">
                <div>
                  <p className="font-display text-xl text-sa-green leading-none">{mxn(x.total)}</p>
                  <p className="font-body text-[11px] text-sa-green-ink/50 mt-0.5">
                    {x.anticipo > 0
                      ? `Dejó ${mxn(x.anticipo)} de anticipo · faltan ${mxn(x.total - x.anticipo)}`
                      : 'Pendiente de pago'}
                  </p>
                </div>
                {/* Las cuatro acciones, envueltas: Editar no se sale de la tarjeta. */}
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}>Cancelar</button>
                  <button
                    onClick={() => abrirEdicion(x)}
                    className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}
                  >
                    Editar
                  </button>
                  {x.anticipo < x.total && (
                    <button className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}>Anticipo</button>
                  )}
                  <button className="bg-sa-green text-sa-cream px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide">
                    Cobrar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)
