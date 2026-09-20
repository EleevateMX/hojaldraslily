/**
 * Contar el pan como lo cuenta la casa: en MOLDES Y CUARTOS.
 *
 * Nadie en una panadería piensa en «1,423 cuadros». Piensan en «me quedan
 * dos moldes y tres cuartos». El inventario se guarda en cuadros —que es la
 * unidad que no miente cuando hay moldes de 48 y de 24 mezclados— pero se
 * **muestra** en moldes, que es como se habla en el mostrador.
 *
 * ## Por qué CUARTOS, y no décimas ni porcentajes
 *
 * Al principio parece una manía del negocio. No lo es: **un cuarto de molde
 * es exactamente el paquete más chico que sale de ese molde**.
 *
 *     molde de 48  →  un cuarto son 12 cuadros  →  el paquete de 12
 *     molde de 24  →  un cuarto son  6 cuadros  →  el paquete de 6
 *
 * Por eso cuando se corta un paquete de 12 de un molde de 48, lo que queda
 * son «tres cuartos»: no es una aproximación, es la cuenta exacta de lo que
 * se puede seguir vendiendo. Decir «queda el 75 %» sería el mismo número
 * diciendo menos.
 *
 * ## Se redondea HACIA ABAJO, siempre
 *
 * Con 47 cuadros de un molde de 48 esto dice «tres cuartos», no «un molde».
 * Redondear hacia arriba prometería un paquete que no existe, y la promesa
 * se rompe con el cliente enfrente. Lo que sobra del último cuarto no se
 * esconde: sale en `sueltos`, para quien quiera el número fino.
 */

/** Los dos tamaños de molde de la casa. */
export const MOLDES_VALIDOS = [48, 24] as const
export type TamanoDeMolde = (typeof MOLDES_VALIDOS)[number]

/** Cuántos cuadros son un cuarto de ese molde — o sea, su paquete más chico. */
export function cuadrosPorCuarto(molde: number): number {
  return Math.max(1, Math.round(molde / 4))
}

export interface EnMoldes {
  /** Moldes completos. */
  moldes: number
  /** Cuartos que sobran, de 0 a 3. */
  cuartos: number
  /** Cuadros que no alcanzan ni un cuarto. No se redondean: se enseñan. */
  sueltos: number
  /** Los cuadros que se le dieron, tal cual. */
  cuadros: number
  /** El tamaño de molde contra el que se contó. */
  molde: number
  /** «1 molde y ¾» — para leerse de lejos. */
  texto: string
  /** «1¾» — para cuando no hay espacio. */
  corto: string
}

const FRACCION = ['', '¼', '½', '¾']

/**
 * Cuadros → moldes y cuartos.
 *
 * `molde` es el tamaño contra el que se cuenta. Importa decirlo: los mismos
 * 48 cuadros son «un molde» si se hornea en moldes de 48 y «dos moldes» si
 * se hornea en los de 24, y las dos frases son ciertas.
 */
export function enMoldes(cuadros: number, molde: number): EnMoldes {
  const m = Math.max(1, Math.round(molde))
  const n = Math.max(0, Math.floor(cuadros))
  const cuarto = cuadrosPorCuarto(m)

  const moldes = Math.floor(n / m)
  const resto = n - moldes * m
  // `min(3, …)` por si el molde no es múltiplo de cuatro: sin esto, un molde
  // de 50 daría «4 cuartos», que es un molde entero escrito mal.
  const cuartos = Math.min(3, Math.floor(resto / cuarto))
  const sueltos = resto - cuartos * cuarto

  return {
    moldes,
    cuartos,
    sueltos,
    cuadros: n,
    molde: m,
    texto: frase(moldes, cuartos, sueltos),
    corto: moldes > 0 ? `${moldes}${FRACCION[cuartos]}` : cuartos > 0 ? FRACCION[cuartos] : '0',
  }
}

function frase(moldes: number, cuartos: number, sueltos: number): string {
  if (moldes === 0 && cuartos === 0) {
    // Sin molde ni cuarto, lo único honesto es el número pelón: decir «0
    // moldes» cuando hay siete cuadros en la charola es decir que no hay pan.
    if (sueltos === 0) return 'nada'
    return `${sueltos} cuadro${sueltos === 1 ? '' : 's'}`
  }
  const enteros = moldes === 0 ? '' : `${moldes} molde${moldes === 1 ? '' : 's'}`
  const parte = cuartos === 0 ? '' : moldes === 0 ? `${FRACCION[cuartos]} de molde` : FRACCION[cuartos]
  return [enteros, parte].filter(Boolean).join(' y ')
}

/**
 * Lo mismo, con el tamaño del molde dicho en voz alta: «1 molde de 48 y ¾».
 *
 * Se usa donde conviven los dos tamaños y la frase sola sería ambigua. Donde
 * el tamaño ya está en la pantalla, `enMoldes().texto` alcanza y estorba
 * menos.
 */
export function enMoldesConTamano(cuadros: number, molde: number): string {
  const r = enMoldes(cuadros, molde)
  if (r.moldes === 0 && r.cuartos === 0) return r.texto
  if (r.moldes === 0) return `${FRACCION[r.cuartos]} de molde de ${r.molde}`
  const parte = r.cuartos === 0 ? '' : ` y ${FRACCION[r.cuartos]}`
  return `${r.moldes} molde${r.moldes === 1 ? '' : 's'} de ${r.molde}${parte}`
}
