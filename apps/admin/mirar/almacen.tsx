/**
 * Admin → Almacén: el tablero del día con fichas, y el desplegable de hora.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5185/mirar/almacen.html
 *
 * Mismo `.env.local` de relleno que `produccion.tsx`. Se mira con un día
 * ocupado: dos a las 12, uno a la 1:02 (hora que no está en la lista del
 * desplegable), uno sin hora, uno que se pasó de ayer, uno ya empacado y de
 * viaje, y dos de mañana temprano (uno a las 10:30 que SÍ entra y uno a las
 * 11:00 que NO).
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TableroDelDia } from '../src/pages/Almacen'
import { SelectorDeHora } from '@lily/ui'
import type { Encargo } from '@lily/supabase'
import '../src/index.css'

const dia = (atras: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - atras)
  return d.toLocaleDateString('en-CA')
}
let n = 0
const enc = (cliente: string, fecha: string | null, hora: string | null, p: Partial<Encargo> = {}): Encargo => ({
  id: 'e' + ++n, folio: 40 + n, cliente, telefono: null, fecha_entrega: fecha, hora_entrega: hora,
  estado: 'apartado', anticipo: 0, para_viaje: false, nota: null, creado_por: null, created_at: '',
  empacado_at: null, empacado_por: null, items: [], total: 0, piezas: 2 + n, ...p,
})

const encargos: Encargo[] = [
  enc('María Pérez', dia(0), '12:00'),
  enc('Panadería Sur', dia(0), '12:00', { empacado_at: 'x', para_viaje: true }),
  enc('Jorge Canul', dia(0), '13:02', { estado: 'pagado' }),
  enc('Sin hora López', dia(0), null),
  enc('Se pasó Ayer', dia(1), '18:00'),
  enc('Temprano Mañana', dia(-1), '10:30'),
  enc('Tarde Mañana (no entra)', dia(-1), '11:00'),
  enc('Pasado Mañana', dia(-2), '09:00'),
]

function Demo() {
  const [h, setH] = useState('13:02')
  return (
    <div className="bg-sa-cream-paper min-h-screen text-sa-green-ink">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <TableroDelDia encargos={encargos} />
        <div className="bg-white rounded-sa p-5 space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sa-green">El desplegable de hora</p>
          <SelectorDeHora value={h} onChange={setH} className="w-full px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm bg-white" />
          <p className="font-mono text-xs text-sa-green-ink/60">guarda: {h || '(sin hora)'}</p>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Demo />)
