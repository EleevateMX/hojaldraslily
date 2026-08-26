/**
 * Los iconos de la app, dibujados.
 *
 * Antes eran emoji (🏋️ 🥤 📋 👤). Se ven distintos en cada telefono - en
 * iPhone son los de Apple, en Android los de Google, y en algunos
 * Android viejos ni siquiera existen y sale un cuadro -, no se pueden
 * tenir del color de la pestana activa, y a tamano de barra inferior son
 * demasiado detallados para leerse. Es el detalle que mas delata que algo
 * es una pagina web y no una app.
 *
 * Estos heredan `currentColor`, asi que la pestana activa los pinta de
 * amarillo sola, y estan dibujados con el grosor de trazo de la marca.
 */

type Props = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Mancuerna: la pestana de la tarjeta, y la unidad del programa. */
export function IconoMancuerna({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />
    </svg>
  )
}

/** Vaso con popote: el menu. */
export function IconoVaso({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" />
      <path d="M5 7h14" />
      <path d="M14 7 16.5 3" />
    </svg>
  )
}

/** Lista: la actividad. */
export function IconoLista({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M9.5 4V3h5v1" />
      <path d="M9.5 10h5M9.5 14h5M9.5 17.5h3" />
    </svg>
  )
}

/** Persona: la cuenta. */
export function IconoPersona({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

/** Sandwich: la tarjeta de sellos de comida. */
export function IconoComida({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 9.5 12 5l8 4.5" />
      <path d="M4 9.5h16" />
      <path d="M4 13h16" />
      <path d="M4 13v2a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2" />
    </svg>
  )
}

/** Regalo: el premio al final de la tarjeta de sellos. */
export function IconoRegalo({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 11h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z" />
      <path d="M3 7.5h18V11H3V7.5Z" />
      <path d="M12 7.5V21" />
      <path d="M12 7.5S10.5 3 8.2 3a2.2 2.2 0 0 0 0 4.5H12Z" />
      <path d="M12 7.5S13.5 3 15.8 3a2.2 2.2 0 0 1 0 4.5H12Z" />
    </svg>
  )
}

/** Palomita: un sello ya juntado. */
export function IconoPalomita({ className }: Props) {
  return (
    <svg {...base} className={className} strokeWidth={2.5} aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  )
}
