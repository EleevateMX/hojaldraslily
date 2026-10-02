/**
 * El catálogo de la caja, servido con datos de una tienda ocupada.
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5173/mirar/
 *
 * No es una prueba automática: es una ventana para MIRAR la rejilla. Existe
 * porque desde este contenedor el navegador no alcanza Supabase, y porque los
 * defectos que salen aquí no se ven leyendo el código. Los tres que encontró
 * el día que se escribió:
 *
 *   · El mosaico del paquete decía «5 · PIEZAS · 5 pzas»: la misma cifra dos
 *     veces (el mismo defecto que ya había tenido el Horno con los moldes).
 *   · La Hojaldra de Corazón pintaba un «—» enorme con «uno» debajo y el
 *     relleno —lo único que importa— en letra chica.
 *   · El Pan de Leche no decía por ningún lado que son dos piezas, que es
 *     justo lo que había que arreglar.
 *
 * Los datos son a mano y a propósito: hacen falta los casos raros juntos (un
 * paquete con su pieza suelta, una pieza sin paquete, dos panes que se
 * agrupan por nombre, cinco rellenos de un solo tamaño). Una pantalla vacía
 * no enseña nada.
 *
 * Vive fuera de `src/`, así que `vite build` no lo empaqueta.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { CatalogoBusqueda } from '../src/components/pos/CatalogoBusqueda'
import '../src/index.css'

const C = {
  enc: { id: 'c-enc', nombre: 'Por encargo', orden: 2, activa: true, cocinas: null },
  boc: { id: 'c-boc', nombre: 'Bocadillos', orden: 29, activa: true, cocinas: null },
  pan: { id: 'c-pan', nombre: 'Panes', orden: 30, activa: true, cocinas: null },
}
let n = 0
const p = (nombre: string, precio: number, cat: any, extra: any = {}) => ({
  id: 'p' + ++n, nombre, precio, cuadros: null, piezas: null, imagen_url: null,
  categoria_id: cat.id, categorias: cat, marca: null, orden: n, sabor: null,
  activo: true, es_extra: false, es_combo: false, iva_incluido: true,
  ...extra,
}) as any

// Una tienda de mediodia: los casos que de verdad van a convivir en la rejilla.
const productos = [
  // hojaldras: la caja de siempre, para que no se pierda de vista
  p('Jamón y Queso · Mini · 12 cuadros', 160, C.enc, { cuadros: 12, sabor: 'Jamón y Queso' }),
  p('Jamón y Queso · Chica · 24 cuadros', 310, C.enc, { cuadros: 24, sabor: 'Jamón y Queso' }),
  p('Jamón y Queso · Grande · 48 cuadros', 540, C.enc, { cuadros: 48, sabor: 'Jamón y Queso' }),
  // pastelitos: paquete + pieza suelta
  p('Pastelitos de Jamón y Queso · 5 pzas', 110, C.boc, { piezas: 5 }),
  p('Pastelitos de Jamón y Queso · 1 pza', 22, C.boc, { piezas: 1 }),
  p('Pastelitos de Lomo · 5 pzas', 140, C.boc, { piezas: 5 }),
  p('Pastelitos de Lomo · 1 pza', 28, C.boc, { piezas: 1 }),
  p('Bolitas de Queso Philadelphia · 5 pzas', 110, C.boc, { piezas: 5 }),
  p('Bolitas de Queso Philadelphia · 1 pza', 22, C.boc, { piezas: 1 }),
  // una pieza que anda sola
  p('Pastelitos solo queso · 1 pza', 26, C.enc, { piezas: 1 }),
  // el pan de leche de dos
  p('Pan de leche · 2 pzas', 60, C.pan, { piezas: 2 }),
  // sin medida: la trenza y las roscas, que se agrupan con su Grande
  p('Trenza Suiza', 160, C.pan),
  p('Trenza Suiza · Grande', 280, C.enc),
  p('Rosca de Queso de Bola', 310, C.pan),
  p('Rosca de Queso de Bola · Grande', 570, C.enc),
  // la hojaldra de corazon: un tamano, cinco rellenos
  p('Hojaldra de Corazón · Jamón y Queso', 310, C.enc),
  p('Hojaldra de Corazón · Hawaiana', 330, C.enc),
  p('Hojaldra de Corazón · Daysi, Jamón y Jalapeño', 440, C.enc),
  p('Hojaldra de Corazón · Pasta de Guayaba, Philadelphia y Nuez', 440, C.enc),
  p('Hojaldra de Corazón · Nutella', 440, C.enc),
  // y uno pelado, sin medida y sin hermanos
  p('Pata de Canela', 60, C.pan),
]

createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh', background: 'var(--sa-cream)' }}>
    <CatalogoBusqueda
      productos={productos}
      categorias={[C.enc, C.boc, C.pan] as any}
      extras={[]}
      productosExtra={[]}
    />
  </div>,
)
