/**
 * Cuánto aguantar antes de enseñar un error que puede irse solo.
 *
 * Las pantallas del local se releen cada 10 s. Al volver del bloqueo de una
 * tableta, la primera relectura suele fallar: el WiFi todavía se está
 * reconectando, o el token se está renovando en ese mismo instante. Pintar
 * ese fallo en rojo y borrarlo diez segundos después es peor que no decir
 * nada — es la regla de CLAUDE.md §4: «si algo se recupera con un reintento,
 * reintenta en silencio».
 *
 * Esto lleva la cuenta de cuándo fue la última lectura buena y contesta si ya
 * pasó suficiente tiempo sin una como para decirlo. Veinticinco segundos son
 * dos relecturas fallidas seguidas con margen; un internet caído de verdad
 * se enseña igual, nada más que sin el parpadeo.
 */
export const PACIENCIA_MS = 25_000

export interface Paciencia {
  /** Se llama cada vez que una lectura sale bien. */
  bien: (ahora?: number) => void
  /** ¿Ya lleva demasiado sin una buena como para enseñar el error? */
  seAcabo: (ahora?: number) => boolean
}

export function crearPaciencia(ms = PACIENCIA_MS, ahora = Date.now()): Paciencia {
  let ultimaBuena = ahora
  return {
    bien: (t = Date.now()) => {
      ultimaBuena = t
    },
    seAcabo: (t = Date.now()) => t - ultimaBuena > ms,
  }
}
