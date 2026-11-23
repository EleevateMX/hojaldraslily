/**
 * PREVIA de Clientes (ficha e historial de encargos).
 *   →  http://localhost:5186/mirar/clientes.html
 */
import { createRoot } from 'react-dom/client'
import Clientes from '../src/pages/Clientes'
import type { Encargo } from '@lily/supabase'
import '../src/index.css'

const it = (producto: string, cantidad: number, precio: number) => ({ id: crypto.randomUUID(), producto_id: 'p', producto, imagen_url: null, cantidad, precio_unitario: precio })
const enc = (o: Partial<Encargo> & { cliente: string; total: number; estado: Encargo['estado'] }): Encargo => ({
  id: crypto.randomUUID(), folio: null, telefono: null, fecha_entrega: null, hora_entrega: null, anticipo: 0,
  para_viaje: false, nota: null, creado_por: null, created_at: '2026-11-20T10:00:00Z', empacado_at: null, empacado_por: null,
  items: [it('Jamón y Queso · Chica', 10, 45)], piezas: 10, folio_pendiente: undefined as never, ...o,
}) as Encargo

const MOCK: Encargo[] = [
  enc({ cliente: 'Panadería Sur', telefono: '9991234567', total: 1200, estado: 'entregado', folio: 1012, fecha_entrega: '2026-11-18', items: [it('Fiesta · 24', 20, 60)], anticipo: 1200 }),
  enc({ cliente: 'Panadería Sur', telefono: '9991234567', total: 900, estado: 'apartado', folio: null, fecha_entrega: '2026-11-25', hora_entrega: '12:00', anticipo: 300, items: [it('Guayaba · Chica', 15, 60)] }),
  enc({ cliente: 'Panadería Sur', telefono: '9991234567', total: 600, estado: 'pagado', folio: 1030, fecha_entrega: '2026-11-24', anticipo: 600, items: [it('Queso · Mini', 20, 30)] }),
  enc({ cliente: 'María Pérez', telefono: '9997654321', total: 450, estado: 'entregado', folio: 1001, fecha_entrega: '2026-11-15', anticipo: 450, items: [it('Trenza Suiza', 5, 90)] }),
  enc({ cliente: 'María Pérez', telefono: '9997654321', total: 780, estado: 'apartado', folio: null, fecha_entrega: '2026-11-26', hora_entrega: '13:00', anticipo: 0, items: [it('Pan de Muerto', 6, 130)] }),
  enc({ cliente: 'Jorge Canul', telefono: null, total: 300, estado: 'entregado', folio: 1005, fecha_entrega: '2026-11-19', anticipo: 300, items: [it('Rosca de Queso', 2, 150)] }),
]

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '24px' }}>
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <Clientes fuente={async () => MOCK} />
    </div>
  </div>,
)
