/**
 * La mesa de producción, con una mañana ocupada.
 *
 *     cd apps/produccion && pnpm dev
 *     →   http://localhost:5173/mirar/produccion.html
 *
 * Desde este contenedor el navegador no alcanza Supabase, y los defectos de
 * esta pantalla no se ven leyendo el código: la foto que nunca se pintó, el
 * «3 moldes de 48 · 3 moldes», la franja urgente en un lila que se ve gris.
 * Todos salieron de abrirla y mirarla.
 *
 * Por eso aquí hay una mesa de media mañana y no una lista limpia: una orden
 * que se quedó de ayer, la de hoy a medio armar, una de mañana sin empezar,
 * renglones con masas apuntadas y sin apuntar, moldes de 48 y de 24 en la
 * misma orden, y un renglón de **piezas** —las roscas— que no sale de ningún
 * molde.
 */
import { createRoot } from 'react-dom/client'
import { Tarjeta, ordenesPorDia } from '../src/vista'
import type { ItemDeProduccion, OrdenDeProduccion } from '@lily/supabase'
import '../src/index.css'

let n = 0
const it = (sabor: string, p: Partial<ItemDeProduccion> = {}): ItemDeProduccion => ({
  id: String(++n),
  sabor,
  imagen_url: null,
  moldes: 4,
  unidad: 'molde',
  molde: 48,
  armados: 0,
  enHorno: 0,
  horneados: 0,
  masas: null,
  terminado_por: null,
  ...p,
})

const orden = (folio: number, fecha: string, items: ItemDeProduccion[], nota?: string): OrdenDeProduccion => ({
  id: 'o' + folio,
  folio,
  fecha,
  estado: 'en_proceso',
  nota: nota ?? null,
  creada_por: 'Gerencia',
  created_at: '',
  items,
})

// Hoy es martes 20 de octubre, a media mañana.
const hoy = new Date('2026-10-20T10:30:00')

const ordenes: OrdenDeProduccion[] = [
  orden(812, '2026-10-19', [
    it('Pasta de Guayaba', { moldes: 3, armados: 1, horneados: 1, masas: 0 }),
  ], 'Se quedó de ayer'),
  orden(815, '2026-10-20', [
    it('Pasta de Guayaba', { moldes: 6, armados: 4, enHorno: 2, horneados: 1, masas: 3 }),
    it('Queso de Bola', { moldes: 2, molde: 24, armados: 2, enHorno: 1, masas: 1 }),
    it('Jamón y Queso', { moldes: 4, armados: 0 }),
    it('Rosca de Queso Philadelphia', { moldes: 20, unidad: 'pieza', molde: null, armados: 8, enHorno: 8, masas: 2 }),
  ], 'Para el encargo de las 2'),
  orden(816, '2026-10-21', [
    it('Hawaiana', { moldes: 5, molde: 24 }),
    it('Pan de Muerto Tradicional · Grande', { moldes: 12, unidad: 'pieza', molde: null }),
  ]),
]

const dias = ordenesPorDia(ordenes, hoy)

createRoot(document.getElementById('root')!).render(
  <div className="bg-sa-cream-paper min-h-screen text-sa-green-ink">
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
    {dias.map((d) => (
      <section key={d.fecha} className="space-y-5">
        <div className="flex items-baseline gap-3 pt-1">
          <h2
            className={[
              'font-display text-2xl',
              d.vencido ? 'text-sa-green-deep' : d.hoy ? 'text-sa-green-ink' : 'text-sa-green-ink/55',
            ].join(' ')}
          >
            {d.titulo}
          </h2>
          <div className="h-px flex-1 bg-sa-green-ink/10" />
          <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/45">
            {d.faltan > 0 ? `faltan ${d.faltan}` : 'listo'}
          </p>
        </div>
        {d.ordenes.map((o) => (
          <Tarjeta
            key={o.id}
            orden={o}
            ocupado={null}
            onMarcar={() => {}}
            onApuntarMasas={() => {}}
          />
        ))}
        </section>
      ))}
    </div>
  </div>,
)
