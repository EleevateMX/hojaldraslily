/**
 * La cola de encargos y su historial, con una tienda ocupada.
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5173/mirar/encargos.html
 *
 * Mismo motivo que `main.tsx`: desde este contenedor el navegador no alcanza
 * Supabase, y los defectos de una lista con treinta tarjetas no se ven
 * leyendo el código. Hacen falta los casos raros juntos: uno que se pasó de
 * su día, varios el mismo día a horas distintas, una hora ilegible, uno sin
 * fecha, y encargos ya empacados conviviendo con los que no.
 */
import { createRoot } from 'react-dom/client'
import { encargosPorDia, type Encargo } from '../../../packages/supabase/src/queries/produccion'
import '../src/index.css'

let n = 0
const e = (cliente: string, fecha: string | null, hora: string | null, extra: Partial<Encargo> = {}): Encargo =>
  ({
    id: String(++n), folio: 1000 + n, cliente, telefono: '999 123 4567',
    fecha_entrega: fecha, hora_entrega: hora, estado: 'apartado', anticipo: 0,
    nota: null, creado_por: 'Caja', created_at: '', empacado_at: null, empacado_por: null,
    items: [{ id: 'i' + n, producto_id: 'p', producto: 'Jamón y Queso · Chica · 24 cuadros',
              imagen_url: null, cantidad: 2, precio_unitario: 310 }],
    total: 620, piezas: 2, ...extra,
  }) as Encargo

// Hoy es martes 20 de octubre en esta pantalla.
const hoy = new Date('2026-10-20T11:00:00')
const encargos = [
  e('Marisol Pech', '2026-10-18', '10:00'),
  e('Doña Carmen', '2026-10-20', '6 pm', { empacado_at: '2026-10-20T08:00:00Z', empacado_por: 'Empaque' }),
  e('Luis Canul', '2026-10-20', '10:00', { anticipo: 200 }),
  e('Oficina Kanasín', '2026-10-20', 'por la tarde', { nota: 'Son 3 cajas, para un cumpleaños' }),
  e('Rosy', '2026-10-21', '9:30'),
  e('Jorge Uc', '2026-10-21', null),
  e('Escuela Lily', '2026-10-22', '7 am'),
  e('Pasa más tarde', null, null),
]

const dias = encargosPorDia(encargos, hoy)

createRoot(document.getElementById('root')!).render(
  <div className="p-4 space-y-5" style={{ background: 'var(--sa-cream)', minHeight: '100vh' }}>
    {dias.map((d) => (
      <div key={d.fecha ?? 'sin'} className="space-y-3">
        <div className="flex items-baseline gap-3">
          <p className={`font-display text-xl leading-none ${d.vencido ? 'text-sa-green-deep bg-sa-strawberry/25 rounded-full px-3 py-1' : 'text-sa-green-ink'}`}>
            {d.titulo}
          </p>
          <span className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
            {d.encargos.length} encargo{d.encargos.length === 1 ? '' : 's'}
          </span>
          <span className="flex-1 border-b border-sa-green-ink/10" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {d.encargos.map((x) => (
            <div key={x.id} className="rounded-sa border border-sa-green-ink/10 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg text-sa-green-ink leading-tight">{x.cliente}</p>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-0.5">
                    #{x.folio} · {x.telefono}
                  </p>
                  {x.empacado_at && (
                    <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink bg-sa-mint/25 rounded-full px-2 py-0.5 inline-block mt-1">
                      Empacado · {x.empacado_por}
                    </p>
                  )}
                </div>
                <p className="font-display text-base shrink-0 text-sa-green-ink/70">
                  {x.hora_entrega || 'sin hora'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>,
)
