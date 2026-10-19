/**
 * Contar el efectivo del cajón por denominación.
 *
 * Contar «$3,450» es una cosa y contar «dos de mil, dos de quinientos, cuatro
 * de cien y un cincuenta» es otra. La primera da un número que nadie puede
 * revisar; la segunda convierte «faltan $340» en «falta un billete de $200 y
 * tres de $50», que es una frase con la que alguien puede acordarse de algo.
 *
 * Vive en `@lily/utils` y no dentro de una app porque son dos las que lo
 * tocan: la **caja** lo escribe al abrir y al cerrar el turno, y **Admin** lo
 * lee en el corte. Dos copias de la misma forma se separan en cuanto alguien
 * toca una, y entonces el desglose que se ve no es el que se guardó.
 *
 * ## El billete de $20 y la moneda de $20 NO son lo mismo
 *
 * En México el 20 existe como billete **y** como moneda. Un conteo indexado
 * solo por denominación —`{ 20: 15 }`— hace que las dos filas escriban la
 * misma casilla: al teclear las monedas se borran los billetes, el total
 * queda corto y el desglose miente. Por eso se guarda separado por especie.
 *
 * Es la única denominación que choca hoy, pero la forma no depende de eso: si
 * mañana vuelve el billete de $10 o sale una moneda de $50, ya cabe.
 *
 * (Esta lección es de la tienda hermana, que la aprendió con diez cortes ya
 * guardados en la forma plana y sin manera de saber cómo se repartía ese 20.
 * Aquí se empieza con la forma buena, así que **no hay lector del formato
 * viejo**: no existe esa deuda y no se copia.)
 */

/** Billetes en circulación, del más grande al más chico. */
export const BILLETES = [1000, 500, 200, 100, 50, 20] as const
/** Monedas en circulación. */
export const MONEDAS = [20, 10, 5, 2, 1] as const

export type EspecieEfectivo = 'billetes' | 'monedas'

export interface Conteo {
  billetes: Record<number, number>
  monedas: Record<number, number>
}

export const CONTEO_VACIO: Conteo = { billetes: {}, monedas: {} }

function sumaLado(lado: Record<number, number> | undefined): number {
  if (!lado) return 0
  return Object.entries(lado).reduce(
    (t, [den, n]) => t + Number(den) * (Number(n) || 0),
    0,
  )
}

/** Cuánto dinero representa el conteo. */
export function sumaConteo(c: Conteo | null | undefined): number {
  if (!c) return 0
  return sumaLado(c.billetes) + sumaLado(c.monedas)
}

/** Cambia cuántas piezas hay de una denominación, sin tocar la otra especie. */
export function ponerPiezas(
  c: Conteo,
  especie: EspecieEfectivo,
  den: number,
  piezas: number,
): Conteo {
  const n = Math.max(0, Math.trunc(Number(piezas) || 0))
  return { ...c, [especie]: { ...c[especie], [den]: n } }
}

export function piezasDe(c: Conteo, especie: EspecieEfectivo, den: number): number {
  return Number(c[especie]?.[den] ?? 0)
}

/** ¿Se tecleó algo? Un conteo en blanco no es un conteo de cero. */
export function hayConteo(c: Conteo | null | undefined): boolean {
  if (!c) return false
  return [...Object.values(c.billetes ?? {}), ...Object.values(c.monedas ?? {})]
    .some((n) => Number(n) > 0)
}

export interface RenglonDesglose {
  especie: EspecieEfectivo
  denominacion: number
  piezas: number
  subtotal: number
}

/**
 * El desglose en renglones, para pintarlo o imprimirlo.
 *
 * Solo lo que tiene piezas: un corte con catorce renglones en cero es papel
 * gastado y una pantalla que nadie termina de leer.
 */
export function renglonesDelConteo(c: Conteo | null | undefined): RenglonDesglose[] {
  if (!c) return []
  const out: RenglonDesglose[] = []
  for (const den of BILLETES) {
    const piezas = piezasDe(c, 'billetes', den)
    if (piezas > 0) out.push({ especie: 'billetes', denominacion: den, piezas, subtotal: den * piezas })
  }
  for (const den of MONEDAS) {
    const piezas = piezasDe(c, 'monedas', den)
    if (piezas > 0) out.push({ especie: 'monedas', denominacion: den, piezas, subtotal: den * piezas })
  }
  return out
}

/**
 * Lee lo que vino de la base.
 *
 * Tolera `null` y objetos a medias porque es un `jsonb`: lo que llega puede
 * ser de una versión anterior de la pantalla, y una caja que revienta al
 * abrir el corte es peor que un desglose incompleto.
 */
export function leerConteo(raw: unknown): Conteo | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { billetes?: unknown; monedas?: unknown }
  const lado = (v: unknown): Record<number, number> => {
    if (!v || typeof v !== 'object') return {}
    const out: Record<number, number> = {}
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      const den = Number(k)
      const piezas = Math.max(0, Math.trunc(Number(n) || 0))
      if (Number.isFinite(den) && den > 0) out[den] = piezas
    }
    return out
  }
  return { billetes: lado(o.billetes), monedas: lado(o.monedas) }
}
