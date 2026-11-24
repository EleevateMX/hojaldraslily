/**
 * PREVIA del Registro de cambios (cancelaciones y modificaciones).
 *   →  http://localhost:5186/mirar/registro.html
 */
import { createRoot } from 'react-dom/client'
import Registro from '../src/pages/Registro'
import type { CambioRegistrado } from '@lily/supabase'
import '../src/index.css'

const MOCK: CambioRegistrado[] = [
  { tipo: 'cancelada', cuando: '2026-11-24T18:53:00Z', folio: 1042, total: 160, metodo_pago: 'inbursa', canal: 'pos', motivo: 'Hojaldra cruda', autorizo: 'Lily (gerencia)', created_at: '2026-11-24T18:40:00Z' },
  { tipo: 'modificada', cuando: '2026-11-24T17:38:00Z', folio: 1039, total: 160, metodo_pago: 'efectivo', canal: 'pos', motivo: null, autorizo: 'Lily (gerencia)', created_at: '2026-11-24T17:30:00Z' },
  { tipo: 'modificada', cuando: '2026-11-24T15:03:00Z', folio: 1028, total: 405, metodo_pago: 'tarjeta', canal: 'pos', motivo: null, autorizo: 'Rosa (gerencia)', created_at: '2026-11-24T14:55:00Z' },
  { tipo: 'cancelada', cuando: '2026-11-23T20:11:00Z', folio: 1017, total: 95, metodo_pago: 'efectivo', canal: 'pos', motivo: 'Cambio de pedido', autorizo: 'Rosa (gerencia)', created_at: '2026-11-23T20:02:00Z' },
  { tipo: 'cancelada', cuando: '2026-11-23T12:20:00Z', folio: 1009, total: 60, metodo_pago: null, canal: 'rappi', motivo: 'Pedido duplicado en Rappi', autorizo: 'Lily (gerencia)', created_at: '2026-11-23T12:10:00Z' },
]

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '24px' }}>
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <Registro fuente={async () => MOCK} />
    </div>
  </div>,
)
