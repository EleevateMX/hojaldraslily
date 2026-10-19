/**
 * El día del negocio, y el folio provisional de una venta sin internet.
 *
 * La fecha del negocio **no es la de UTC**. En Mérida son UTC−6 todo el año,
 * así que a las 7 de la noche del sábado el reloj de UTC ya dice domingo: una
 * venta de las 19:30 contada por UTC cae en el día siguiente, y el pan se
 * hornea y se cuenta POR DÍA (`fn_existencias_por_molde` resuelve el día con
 * `at time zone 'America/Merida'`). Aquí se hace la misma cuenta del lado del
 * navegador, para que los folios provisionales se reinicien cuando el negocio
 * cambia de día y no cuando lo hace Greenwich.
 */

export const ZONA_MERIDA = 'America/Merida'

/** El día del negocio, como `2026-10-19`. */
export function hoyEnMerida(cuando: Date = new Date()): string {
  // `en-CA` da exactamente `YYYY-MM-DD`, que es lo que compara la base.
  return cuando.toLocaleDateString('en-CA', { timeZone: ZONA_MERIDA })
}

/**
 * El folio provisional: `S-01`, `S-02`… La «S» es de «sin internet».
 *
 * Es el número que se le dice al cliente y el que va en el ticket mientras no
 * hay conexión. Lleva dos dígitos porque se lee en voz alta en el mostrador y
 * «S-7» se confunde con «S-17»; pasando de 99 crece solo.
 */
export function folioSinInternet(n: number): string {
  return `S-${String(Math.max(1, Math.trunc(n))).padStart(2, '0')}`
}

/** ¿Este folio es de una venta que todavía no se registró? */
export function esFolioProvisional(folio: unknown): boolean {
  return typeof folio === 'string' && /^S-\d+$/.test(folio)
}
