/**
 * La caja ENTERA —cabecera, catálogo y ticket— con un turno abierto y tres
 * cosas ya en el ticket, para MIRARLA en teléfono, tableta y PC.
 *
 *     cd apps/pos && pnpm dev   →   /mirar/caja.html
 *
 * `PantallaDeVenta` existe para esto: `Caja.tsx` carga el contexto de
 * Supabase y aquí se le da de comer a mano. Lo que hay que mirar es la forma
 * en cada aparato: que en el teléfono el ticket sea la barra de abajo y no
 * una columna que aplasta el catálogo, que la cabecera no se parta en tres
 * renglones, y que la Coca Cola sea UNA tarjeta con cuatro opciones.
 */
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { PantallaDeVenta } from '../src/components/pos/PantallaDeVenta'
import { usePosStore } from '../src/store/posStore'
import type { ProductoVenta } from '@lily/supabase'
import '../src/index.css'

const C = {
  dia: { id: 'c-dia', nombre: 'Menú del día', orden: 1, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
  boc: { id: 'c-boc', nombre: 'Bocadillos', orden: 2, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
  pan: { id: 'c-pan', nombre: 'Panes', orden: 3, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
  gal: { id: 'c-gal', nombre: 'Galletas', orden: 4, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
  ani: { id: 'c-ani', nombre: 'Anís', orden: 5, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
  tem: { id: 'c-tem', nombre: 'Menú de Temporada', orden: 6, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
  beb: { id: 'c-beb', nombre: 'Bebidas', orden: 7, cocinas: { id: 'k2', nombre: 'Bebidas', slug: 'bebidas' } },
  enc: { id: 'c-enc', nombre: 'Por encargo', orden: 8, cocinas: { id: 'k1', nombre: 'Alimentos', slug: 'alimentos' } },
}
let n = 0
const p = (nombre: string, precio: number, cat: (typeof C)[keyof typeof C], extra: Record<string, unknown> = {}) =>
  ({
    id: 'p' + ++n, nombre, precio, cuadros: null, piezas: null, imagen_url: null,
    categoria_id: cat.id, categorias: cat, marca: null, orden: n, sabor: null,
    activo: true, es_extra: false, es_combo: false, iva_incluido: true,
    ...extra,
  }) as unknown as ProductoVenta

const productos = [
  p('Jamón y Queso · Mini · 12 cuadros', 160, C.dia, { cuadros: 12, imagen_url: 'jamon-y-queso.png' }),
  p('Jamón y Queso · Chica · 24 cuadros', 310, C.dia, { cuadros: 24, imagen_url: 'jamon-y-queso.png' }),
  p('Jamón y Queso · Grande · 48 cuadros', 540, C.dia, { cuadros: 48, imagen_url: 'jamon-y-queso.png' }),
  p('Fiesta · 6 cuadros', 90, C.dia, { cuadros: 6, imagen_url: 'fiesta.png' }),
  p('Fiesta · 12 cuadros', 170, C.dia, { cuadros: 12, imagen_url: 'fiesta.png' }),
  p('Fiesta · 24 cuadros', 320, C.dia, { cuadros: 24, imagen_url: 'fiesta.png' }),
  p('Pastelitos de Jamón y Queso · 5 pzas', 110, C.boc, { piezas: 5, imagen_url: 'pastelitos-de-jamon-y-queso.png' }),
  p('Pastelitos de Jamón y Queso · 1 pza', 22, C.boc, { piezas: 1, imagen_url: 'pastelitos-de-jamon-y-queso.png' }),
  p('Pastelitos de Lomo · 5 pzas', 140, C.boc, { piezas: 5, imagen_url: 'pastelitos-de-lomo.png' }),
  p('Pan de leche · 2 pzas', 60, C.pan, { piezas: 2, imagen_url: 'pan-de-leche.png' }),
  p('Trenza Suiza', 160, C.pan, { imagen_url: 'trenza-suiza.png' }),
  p('Galletas de Manteca Dulces', 45, C.gal, { imagen_url: 'galletas-de-manteca-dulces.png' }),
  p('Rosca de Anís', 85, C.ani, { imagen_url: 'rosca-de-anis.png' }),
  p('Pan de Muerto Tradicional · Chica', 80, C.tem, { imagen_url: 'pan-de-muerto.png' }),
  p('Pan de Muerto Tradicional · Grande', 130, C.tem, { imagen_url: 'pan-de-muerto.png' }),
  // Las bebidas de la casa (20/10): la Coca es una tarjeta con cuatro opciones.
  p('Coca Cola · Lata', 25, C.beb, { imagen_url: 'coca-cola-lata.png' }),
  p('Coca Cola · Lata Sin Azúcar', 25, C.beb, { imagen_url: 'coca-cola-lata.png' }),
  p('Coca Cola · Botella', 30, C.beb, { imagen_url: 'coca-cola-botella.png' }),
  p('Coca Cola · Botella Sin Azúcar', 30, C.beb, { imagen_url: 'coca-cola-botella.png' }),
  p('Agua', 20, C.beb, { imagen_url: 'agua-embotellada.png' }),
  p('Boxito', 30, C.beb, { imagen_url: 'boxito.png' }),
  p('Soldado Chocolate', 31, C.beb, { imagen_url: 'soldado-chocolate.png' }),
  p('Jugo', 20, C.beb, { imagen_url: 'jugo.png' }),
  p('Rosca de Queso de Bola', 310, C.enc, { imagen_url: 'rosca-de-queso-de-bola.png' }),
]

const categorias = Object.values(C).map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden, cocinas: c.cocinas }))

usePosStore.setState({
  empleado: { id: 'e1', nombre: 'Rosa M.', rol: 'caja', sucursal_id: 's1' } as never,
  corte: { id: 'k1', estado: 'abierta' } as never,
  items: [
    { lineaId: 'l1', producto: productos[1], cantidad: 1, personalizacion: null },
    { lineaId: 'l2', producto: productos[8], cantidad: 2, personalizacion: null },
    { lineaId: 'l3', producto: productos[15], cantidad: 1, personalizacion: null },
  ],
})

function Arnes() {
  const canal = usePosStore((s) => s.canal)
  const setCanal = usePosStore((s) => s.setCanal)
  return (
    <PantallaDeVenta
      productos={productos}
      productosExtra={[]}
      extras={[]}
      categorias={categorias}
      loading={false}
      hora="11:42 a.m."
      almacenNombre="Mostrador"
      empleadoNombre="Rosa"
      canal={canal}
      setCanal={setCanal}
      onIr={(r) => console.log('ir a', r)}
      onSalir={() => console.log('salir')}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter><Arnes /></MemoryRouter>,
)
