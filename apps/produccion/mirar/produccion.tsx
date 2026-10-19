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
import { Tarjeta, EncargosPorHora, ordenesPorDia } from '../src/vista'
import type { ItemDeProduccion, OrdenDeProduccion, Encargo } from '@lily/supabase'
import '../src/index.css'

/** Un encargo de hoy, con lo justo para sumarlo por hora. */
let ne = 0
const enc = (hora: string | null, items: [string, number][], p: Partial<Encargo> = {}): Encargo => ({
  id: 'e' + ++ne,
  folio: 100 + ne,
  cliente: 'Cliente ' + ne,
  telefono: null,
  fecha_entrega: '2026-10-20',
  hora_entrega: hora,
  estado: 'apartado',
  anticipo: 0,
  para_viaje: false,
  nota: null,
  creado_por: null,
  created_at: '',
  empacado_at: null,
  empacado_por: null,
  items: items.map(([producto, cantidad], i) => ({
    id: `i${ne}-${i}`, producto_id: producto, producto, cantidad, precio_unitario: 0, imagen_url: null,
  })),
  total: 0,
  piezas: items.reduce((s, [, n]) => s + n, 0),
  ...p,
})

const encargos: Encargo[] = [
  enc('11:30', [['Jamón y Queso · Chica · 24 cuadros', 6], ['Fiesta · Mini · 12 cuadros', 2]]),
  enc('12:00', [['Jamón y Queso · Chica · 24 cuadros', 4], ['Fiesta · Mini · 12 cuadros', 3]]),
  enc('14:00', [['Pasta de Guayaba · Grande · 48 cuadros', 2], ['Rosca de Queso Philadelphia', 10]]),
  enc('6 pm', [['Hawaiana · Chica · 24 cuadros', 3]]),
  enc(null, [['Trenza Suiza', 2]]),
  // Ya empacado: no le toca a esta mesa, no se suma.
  enc('12:00', [['Fiesta · Grande · 48 cuadros', 9]], { empacado_at: '2026-10-20T09:00:00' }),
  // De mañana: tampoco.
  enc('10:00', [['Fiesta · Grande · 48 cuadros', 9]], { fecha_entrega: '2026-10-21' }),
]

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

const orden = (
  folio: number,
  fecha: string,
  items: ItemDeProduccion[],
  nota?: string,
  hora?: string,
): OrdenDeProduccion => ({
  id: 'o' + folio,
  folio,
  fecha,
  estado: 'en_proceso',
  nota: nota ?? null,
  hora_objetivo: hora ?? null,
  creada_por: 'Gerencia',
  created_at: '',
  items,
})

// Hoy es martes 20 de octubre, a media mañana.
const hoy = new Date('2026-10-20T10:30:00')

const ordenes: OrdenDeProduccion[] = [
  orden(812, '2026-10-19', [
    it('Pasta de Guayaba', { moldes: 3, armados: 1, horneados: 1, masas: 0 }),
  ], 'Se quedó de ayer', '8:00'),
  orden(815, '2026-10-20', [
    it('Pasta de Guayaba', { moldes: 6, armados: 4, enHorno: 2, horneados: 1, masas: 3 }),
    it('Queso de Bola', { moldes: 2, molde: 24, armados: 2, enHorno: 1, masas: 1 }),
    it('Jamón y Queso', { moldes: 4, armados: 0 }),
    it('Rosca de Queso Philadelphia', { moldes: 20, unidad: 'pieza', molde: null, armados: 8, enHorno: 8, masas: 2 }),
  ], 'Para el encargo de las 2', '12:00'),
  orden(816, '2026-10-21', [
    it('Hawaiana', { moldes: 5, molde: 24 }),
    it('Pan de Muerto Tradicional · Grande', { moldes: 12, unidad: 'pieza', molde: null }),
  ]),
  // Sin hora: va al final de su dia y no pinta pastilla. Es un caso real, no
  // un hueco — no toda tanda lleva hora.
  orden(817, '2026-10-20', [it('Jamón y Queso', { moldes: 2 })], 'Cuando se pueda'),
]

const dias = ordenesPorDia(ordenes, hoy)

createRoot(document.getElementById('root')!).render(
  <div className="bg-sa-cream-paper min-h-screen text-sa-green-ink">
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
    <EncargosPorHora encargos={encargos} hoy={hoy} />
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
            ahora={hoy}
            onMarcar={() => {}}
            onApuntarMasas={() => {}}
          />
        ))}
        </section>
      ))}
    </div>
  </div>,
)
