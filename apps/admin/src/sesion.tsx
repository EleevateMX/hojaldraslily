import { createContext, useContext } from 'react'

/**
 * Quién está adentro de Admin, para que la barra lateral sepa qué enseñar.
 *
 * El candado (`CandadoAdmin`) ya sabe el rol del empleado; esto solo lo baja a
 * `App` para que un puesto acotado —Contabilidad— vea únicamente lo suyo. No
 * es seguridad de verdad (esa vive en RLS y en las Edge Functions): es para no
 * ponerle enfrente a alguien botones que de todos modos el servidor le negaría.
 */
export interface SesionAdmin {
  nombre: string
  /** El slug del rol: 'gerente', 'contabilidad', … */
  rol: string
}

export const SesionContext = createContext<SesionAdmin | null>(null)

export const useSesion = () => useContext(SesionContext)
