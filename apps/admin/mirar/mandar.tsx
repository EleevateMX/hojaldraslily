/**
 * PREVIA del modal «Mandar a hacer» del Dashboard (envío rápido).
 *   →  http://localhost:5186/mirar/mandar.html
 */
import { createRoot } from 'react-dom/client'
import MandarAHacerModal from '../src/pages/MandarAHacerModal'
import type { ProductoDelDia } from '@lily/supabase'
import '../src/index.css'

const MOCK: ProductoDelDia[] = [
  { producto_id: '1', nombre: 'Guayaba · Chica', sabor: 'Pasta de Guayaba', categoria: 'Hojaldras', cuadros: 12, piezas: null, precio: 30, imagen_url: null, cuadros_libres: 96, paquetes_posibles: 8, vendidos: 10 },
  { producto_id: '2', nombre: 'Queso · Chica', sabor: 'Queso', categoria: 'Hojaldras', cuadros: 12, piezas: null, precio: 30, imagen_url: null, cuadros_libres: 48, paquetes_posibles: 4, vendidos: 6 },
  { producto_id: '3', nombre: 'Rosca de Queso Philadelphia · Grande', sabor: null, categoria: 'Roscas y trenzas', cuadros: null, piezas: 1, precio: 180, imagen_url: null, cuadros_libres: null, paquetes_posibles: null, vendidos: 2 },
  { producto_id: '4', nombre: 'Trenza Suiza', sabor: null, categoria: 'Panes', cuadros: null, piezas: 1, precio: 95, imagen_url: null, cuadros_libres: null, paquetes_posibles: null, vendidos: 3 },
]

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)' }}>
    <MandarAHacerModal onClose={() => {}} fuente={async () => MOCK} />
  </div>,
)
