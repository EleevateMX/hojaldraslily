/**
 * Íconos de las categorías del menú, dibujados en SVG al estilo de la casa.
 *
 * Antes las pestañas mostraban UN solo emoji genérico por cocina (🍽️ para toda
 * la comida, 🥤 para bebidas), así que «Menú del día», «Panes», «Galletas»… se
 * veían iguales. Esto le da un ícono propio a cada una.
 *
 * Van en **un solo color** (`currentColor`): el ícono hereda el color del texto
 * del pill, así se ve nítido en los dos estados de la pestaña —crema con texto
 * morado cuando está apagada, carmín con crema cuando está activa—. Una
 * ilustración multicolor (como las de los productos) no invierte sobre el
 * carmín; a 18 px un trazo sólido se lee mejor. Formas redondeadas, sin
 * contorno, como el resto de la marca.
 */

type Clave =
  | 'dia' | 'bocadillo' | 'pan' | 'galleta' | 'anis'
  | 'temporada' | 'bebida' | 'encargo' | 'otro'

/** De qué categoría es cada ícono, por el nombre (sin acentos, en minúsculas). */
function claveIcono(nombre: string): Clave {
  const n = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('temporada')) return 'temporada'
  if (n.includes('encargo')) return 'encargo'
  if (n.includes('bebida')) return 'bebida'
  if (n.includes('galleta')) return 'galleta'
  if (n.includes('anis')) return 'anis'
  if (n.includes('bocadillo')) return 'bocadillo'
  if (n.includes('pan')) return 'pan' // panes, panadería
  if (n.includes('dia') || n.includes('menu')) return 'dia' // menú del día
  return 'otro'
}

const trazos: Record<Clave, React.ReactNode> = {
  // Menú del día → sol («del día»).
  dia: (
    <>
      <circle cx="12" cy="12" r="4" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2.5" x2="12" y2="4.8" />
        <line x1="12" y1="19.2" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="4.8" y2="12" />
        <line x1="19.2" y1="12" x2="21.5" y2="12" />
        <line x1="5.2" y1="5.2" x2="6.8" y2="6.8" />
        <line x1="17.2" y1="17.2" x2="18.8" y2="18.8" />
        <line x1="18.8" y1="5.2" x2="17.2" y2="6.8" />
        <line x1="6.8" y1="17.2" x2="5.2" y2="18.8" />
      </g>
    </>
  ),
  // Bocadillos → tres bocados.
  bocadillo: (
    <>
      <circle cx="8" cy="14.5" r="3.4" />
      <circle cx="14.5" cy="8.5" r="3.4" />
      <circle cx="16.5" cy="16" r="3" />
    </>
  ),
  // Panes → una hogaza.
  pan: <path d="M3.5 14.5c0-3.6 2.9-6.5 6.5-6.5h4c3.6 0 6.5 2.9 6.5 6.5 0 1.2-1 2.2-2.2 2.2H5.7c-1.2 0-2.2-1-2.2-2.2z" />,
  // Galletas → una galleta con sus chispas (agujeros con even-odd).
  galleta: (
    <path
      fillRule="evenodd"
      d="M12 3a9 9 0 1 0 .01 0ZM8.8 9a1.3 1.3 0 1 0 .01 0ZM15 8.6a1.1 1.1 0 1 0 .01 0ZM9.8 14.2a1.2 1.2 0 1 0 .01 0ZM15.2 14.6a1.3 1.3 0 1 0 .01 0Z"
    />
  ),
  // Anís → estrella (anís estrella).
  anis: <path d="M12 2l2.7 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17.1 5.6 20.6l1.5-6.7-5.1-4.5 6.8-.6z" />,
  // Menú de temporada → una hoja.
  temporada: <path d="M19.8 4.2C10 3.8 3.8 10.4 4.2 20.2c9.8.4 16-6.2 15.6-16z" />,
  // Bebidas → vaso con popote.
  bebida: (
    <>
      <path d="M6 7.5h12l-1.1 11.6a2.2 2.2 0 0 1-2.2 2H9.3a2.2 2.2 0 0 1-2.2-2L6 7.5z" />
      <line x1="14.5" y1="3" x2="13" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  // Por encargo → una caja (como el 📦 de la franja).
  encargo: (
    <>
      <path d="M12 3.2 4 7v1l8 3.6L20 8V7l-8-3.8z" />
      <path d="M4 9v8.2L11 20.6V12.4L4 9z" />
      <path d="M20 9v8.2L13 20.6V12.4L20 9z" opacity="0.65" />
    </>
  ),
  // Cualquier otra → un disco simple.
  otro: <circle cx="12" cy="12" r="6.5" />,
}

export function IconoCategoria({ nombre, className }: { nombre: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {trazos[claveIcono(nombre)]}
    </svg>
  )
}
