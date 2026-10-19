/**
 * Admin → Cortes de caja, con una semana de tienda ocupada.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5185/mirar/cortes.html
 *
 * Hace falta el mismo `.env.local` de relleno que `produccion.tsx` explica.
 *
 * Los casos que rompen: un corte que cuadra, uno con faltante (que tiene que
 * gritar en carmín, no en rosa), uno con sobrante, uno sin conteo por
 * denominación (de antes de que existiera) y el turno de hoy todavía abierto.
 * El detalle se abre solo en el del faltante, que es el que alguien va a
 * querer leer billete por billete.
 */
import { createRoot } from 'react-dom/client'
import Cortes from '../src/pages/Cortes'
import type { CorteDeCaja } from '@lily/supabase'
import '../src/index.css'

const hoy = new Date()
const dia = (atras: number, h: number, m = 0): string => {
  const d = new Date(hoy)
  d.setDate(d.getDate() - atras)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const base = (p: Partial<CorteDeCaja>): CorteDeCaja => ({
  corte_id: crypto.randomUUID(),
  folio: 0,
  caja: 'Caja mostrador',
  estado: 'cerrada',
  abierto_en: dia(1, 7),
  cerrado_en: dia(1, 20, 15),
  abrio: 'Rosa M.',
  cerro: 'Rosa M.',
  fondo_inicial: 500,
  num_ordenes: 87,
  total_efectivo: 6240,
  total_tarjeta: 2890,
  total_clip: 0,
  total_cortesia: 120,
  total_otro: 0,
  total_pagado: 9250,
  efectivo_esperado: 6740,
  efectivo_contado: 6740,
  diferencia: 0,
  conteo_apertura: { billetes: { 100: 3, 50: 2, 20: 4 }, monedas: { 10: 2 } },
  conteo_cierre: { billetes: { 500: 8, 200: 9, 100: 7, 50: 4, 20: 3 }, monedas: { 20: 2, 10: 1, 5: 2 } },
  notas: null,
  ...p,
})

const CORTES: CorteDeCaja[] = [
  base({
    folio: 14, estado: 'abierta', abierto_en: dia(0, 7, 5), cerrado_en: null, cerro: null,
    num_ordenes: 23, total_efectivo: 1860, total_tarjeta: 740, total_pagado: 2600,
    efectivo_esperado: 2360, efectivo_contado: null, diferencia: null, conteo_cierre: null,
  }),
  base({
    folio: 13, abierto_en: dia(1, 7), cerrado_en: dia(1, 20, 10), cerro: 'Lily',
    efectivo_contado: 6400, diferencia: -340,
    conteo_cierre: { billetes: { 500: 8, 200: 8, 100: 6, 50: 2, 20: 3 }, monedas: { 20: 2, 10: 1, 5: 2 } },
    notas: 'Se pagó el agua del garrafón del cajón, $40. Lo demás no lo encontramos.',
  }),
  base({ folio: 12, abierto_en: dia(2, 7), cerrado_en: dia(2, 19, 50), efectivo_contado: 6790, diferencia: 50 }),
  base({ folio: 11, abierto_en: dia(3, 7), cerrado_en: dia(3, 20), abrio: 'Lily', cerro: 'Lily' }),
  base({
    folio: 10, abierto_en: dia(4, 7, 10), cerrado_en: dia(4, 20, 5),
    conteo_apertura: null, conteo_cierre: null, efectivo_contado: 6740, diferencia: 0,
  }),
]

createRoot(document.getElementById('root')!).render(
  <div className="bg-sa-cream-paper min-h-screen text-sa-green-ink">
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <Cortes fuente={async () => CORTES} />
    </div>
  </div>,
)
