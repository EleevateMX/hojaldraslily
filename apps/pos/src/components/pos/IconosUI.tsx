/**
 * Íconos de la interfaz (no de categorías), dibujados en SVG en vez de usar
 * emojis del sistema.
 *
 * Los emojis del sistema se ven distintos en cada aparato y cuelgan el estilo
 * de la marca de cómo los dibuje Android/Windows. Estos van en `currentColor`,
 * así que heredan el color de donde se pongan (crema sobre la franja carmín,
 * morado sobre crema) y se ven igual en todos lados. Mismo trazo redondo del
 * resto de la marca.
 */

type Props = { className?: string }

/** Lupa del buscador. */
export function Lupa({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
    </svg>
  )
}

/** Llama — el horno. */
export function Llama({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.5 2c.3 3 2.2 4.5 3.4 6.2a6 6 0 1 1-9.9 4.3c0-2.1 1-3.9 2.3-5.3.2 1.3.9 2 1.8 2.2-.6-2.6.4-5.4 2.4-7.4z" />
    </svg>
  )
}

/** Reloj — lo que se pasó de su hora. */
export function Reloj({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12.5" r="8.5" />
      <path d="M12 7.5v5l3.3 2" />
    </svg>
  )
}

/** Caja — los encargos. */
export function Caja({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3.2 4 7v1l8 3.6L20 8V7l-8-3.8z" />
      <path d="M4 9v8.2L11 20.6V12.4L4 9z" />
      <path d="M20 9v8.2L13 20.6V12.4L20 9z" opacity="0.65" />
    </svg>
  )
}

/** Lápiz — una nota de personalización. */
export function Nota({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 17.3V21h3.7L17.6 10.1l-3.7-3.7L3 17.3zM20.7 7.3a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7 1.8-1.8z" />
    </svg>
  )
}

/** Etiqueta — el descuento. */
export function Etiqueta({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.6 3H5a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l8 8a2 2 0 0 0 2.8 0l6.6-6.6a2 2 0 0 0 0-2.8l-8-8A2 2 0 0 0 11.6 3zM7.5 9A1.5 1.5 0 1 1 7.5 6a1.5 1.5 0 0 1 0 3z" />
    </svg>
  )
}
