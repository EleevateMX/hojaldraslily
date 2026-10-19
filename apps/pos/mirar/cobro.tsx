/**
 * La pantalla de cobro con un ticket armado, para MIRARLA.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/cobro.html          (venta normal)
 *                                 /mirar/cobro.html#encargo  (encargo con anticipo)
 *
 * Es la pantalla más importante de la caja y no se podía abrir sin Supabase:
 * el store se siembra aquí con un turno, un cajero y tres renglones, y la
 * pantalla se monta tal cual. Cobrar no funciona (no hay base), pero todo lo
 * demás —los métodos, el mixto, el recibido y el cambio, el resumen— es lo
 * de verdad.
 */
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Cobro } from '../src/pages/Cobro'
import { usePosStore } from '../src/store/posStore'
import type { ProductoVenta } from '@lily/supabase'
import '../src/index.css'

const prod = (id: string, nombre: string, precio: number): ProductoVenta =>
  ({ id, nombre, precio, activo: true, es_extra: false, categorias: null }) as unknown as ProductoVenta

const encargo = location.hash === '#encargo'

usePosStore.setState({
  empleado: { id: 'e1', nombre: 'Rosa M.', rol: 'caja', sucursal_id: 's1' } as never,
  almacen: { id: 'a1', sucursal_id: 's1', nombre: 'Kiosko', tipo: 'kiosko' } as never,
  caja: { id: 'c1', nombre: 'Caja mostrador', sucursal_id: 's1' } as never,
  corte: { id: 'k1', estado: 'abierta' } as never,
  items: [
    { lineaId: 'l1', producto: prod('p1', 'Jamón y Queso · Chica · 24 cuadros', 310), cantidad: 1, personalizacion: null },
    { lineaId: 'l2', producto: prod('p2', 'Pastelitos de Lomo · 5 pzas', 140), cantidad: 2, personalizacion: null },
    { lineaId: 'l3', producto: prod('p3', 'Cafe de olla', 35), cantidad: 1, personalizacion: 'sin azúcar' },
  ],
  encargo: encargo ? { id: 'en1', folio: 7, cliente: 'María Pérez', anticipo: 200 } : null,
})

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/cobro']}>
    <Routes>
      <Route path="/cobro" element={<Cobro />} />
      <Route path="*" element={<div className="p-8 font-mono">(navegó a la caja)</div>} />
    </Routes>
  </MemoryRouter>,
)
