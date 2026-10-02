/**
 * Cómo se mide un renglón del catálogo: en cuadros o en piezas.
 *
 * Hay tres especies de producto y cada una se cuenta distinto:
 *
 *   · Una hojaldra se cuenta en **cuadros** — se corta de un molde.
 *   · Un pastelito, una bolita o el Pan de Leche se cuentan en **piezas** —
 *     vienen en paquete, y a veces se venden sueltos para cuadrar un encargo
 *     impar (17 pastelitos son 3 paquetes de 5 y 2 piezas).
 *   · Un café no se cuenta: es uno y ya.
 *
 * Vive aquí y no en cada pantalla porque la pregunta se hace en cuatro
 * (la caja, los encargos, el almacén y producción) y la respuesta tiene que
 * ser la misma en las cuatro. Escrita cuatro veces, tarde o temprano una
 * diría "piezas" de una hojaldra.
 */

export interface Medible {
  cuadros?: number | null
  piezas?: number | null
}

export interface MedidaDeVenta {
  /** El número que se pinta grande, o `null` si este producto no se cuenta. */
  cuanto: number | null
  /** La palabra de abajo: `cuadros`, `piezas`, `pieza` — o vacía. */
  unidad: string
  /** Para un renglón: «24 cuadros», «5 piezas», «1 pieza», o vacío. */
  texto: string
  /** ¿Es una pieza suelta, o sea el renglón con el que se cuadra lo impar? */
  esSuelta: boolean
}

/**
 * Los cuadros ganan cuando hay los dos.
 *
 * No debería pasar —una hojaldra no viene en paquete de piezas— pero si
 * algún día un renglón trae ambos, el cuadro es la unidad del inventario y
 * mentir ahí descuadra el pan. Mejor que la pantalla diga cuadros.
 */
export function medidaDeVenta(p: Medible): MedidaDeVenta {
  const cuadros = p.cuadros ?? null
  const piezas = p.piezas ?? null

  if (cuadros !== null && cuadros > 0) {
    return { cuanto: cuadros, unidad: 'cuadros', texto: `${cuadros} cuadros`, esSuelta: false }
  }
  if (piezas !== null && piezas > 0) {
    const unidad = piezas === 1 ? 'pieza' : 'piezas'
    return { cuanto: piezas, unidad, texto: `${piezas} ${unidad}`, esSuelta: piezas === 1 }
  }
  return { cuanto: null, unidad: '', texto: '', esSuelta: false }
}

/**
 * Cuántos paquetes y cuántas piezas sueltas hacen una cantidad.
 *
 * Es la cuenta que el mostrador hace a mano: 17 pastelitos de paquete de 5
 * son 3 paquetes y 2 piezas. Se usa para proponerlo, no para cobrarlo —el
 * dinero sigue saliendo de `productos.precio` en el servidor.
 */
export function enPaquetes(
  piezasPedidas: number,
  piezasPorPaquete: number,
): { paquetes: number; sueltas: number; texto: string } {
  const porPaquete = Math.max(1, Math.floor(piezasPorPaquete))
  const n = Math.max(0, Math.floor(piezasPedidas))
  const paquetes = Math.floor(n / porPaquete)
  const sueltas = n - paquetes * porPaquete

  const partes: string[] = []
  if (paquetes > 0) partes.push(`${paquetes} paquete${paquetes === 1 ? '' : 's'} de ${porPaquete}`)
  if (sueltas > 0) partes.push(`${sueltas} pieza${sueltas === 1 ? '' : 's'}`)
  return { paquetes, sueltas, texto: partes.join(' y ') || 'nada' }
}
