/**
 * Lógica de costeo — espejo exacto de la vista vw_costeo_producto (v3),
 * que a su vez replica la función finishCalc del tablero legacy:
 *   total = receta×(1+merma) + empaque + mano de obra
 * (la merma NO aplica al empaque; la mano de obra es la del producto
 * si > 0, si no la global de parámetros).
 * Sirve para previsualizar en el cliente (mientras se edita una receta)
 * sin ir a la base. La fuente de verdad sigue siendo la vista.
 */

export interface ParametrosCosteo {
  /** IVA como fracción, ej. 0.16 */
  iva: number
  /** food cost objetivo como fracción, ej. 0.30 */
  foodCostMeta: number
  /** merma default como fracción, ej. 0.02 */
  mermaDefault: number
  /** mano de obra default por producto (MXN) */
  manoObra: number
}

export interface EntradaCosteo {
  /** costo total de insumos de la receta (incluye empaque) */
  costoInsumos: number
  /** costo de los insumos tipo empaque (subconjunto de costoInsumos) */
  costoEmpaque: number
  /** merma específica del producto (fracción) o null para usar default */
  mermaPct: number | null
  /** mano de obra del producto (MXN); 0 = usar la global de parámetros */
  manoObra: number
  /** precio de venta actual */
  precio: number
  /** true si el precio ya incluye IVA */
  ivaIncluido: boolean
}

export interface ResultadoCosteo {
  costoReceta: number
  costoEmpaque: number
  costoConMerma: number
  costoTotal: number
  precioSinIva: number
  precioConIva: number
  /** food cost real como fracción (costo / precio sin IVA) */
  foodCostPct: number | null
  /** utilidad bruta en MXN (precio sin IVA - costo total) */
  margen: number
  /** margen como fracción del precio sin IVA */
  margenPct: number | null
  /** precio sugerido con IVA, redondeado a múltiplos de $5 */
  precioSugerido: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000

export function calcularCosteo(e: EntradaCosteo, p: ParametrosCosteo): ResultadoCosteo {
  const merma = e.mermaPct ?? p.mermaDefault
  const costoReceta = e.costoInsumos - e.costoEmpaque
  const manoObra = e.manoObra > 0 ? e.manoObra : p.manoObra
  const costoConMerma = costoReceta * (1 + merma)
  const costoTotal = costoConMerma + e.costoEmpaque + manoObra
  const precioSinIva = e.ivaIncluido ? e.precio / (1 + p.iva) : e.precio
  const precioConIva = e.ivaIncluido ? e.precio : e.precio * (1 + p.iva)
  const foodCostPct = precioSinIva > 0 ? r4(costoTotal / precioSinIva) : null
  const margen = precioSinIva - costoTotal
  const margenPct = precioSinIva > 0 ? r4(margen / precioSinIva) : null
  const precioSugerido =
    p.foodCostMeta > 0 ? r2(Math.round((costoTotal / p.foodCostMeta) * (1 + p.iva) / 5) * 5) : 0

  return {
    costoReceta: r2(costoReceta),
    costoEmpaque: r2(e.costoEmpaque),
    costoConMerma: r2(costoConMerma),
    costoTotal: r2(costoTotal),
    precioSinIva: r2(precioSinIva),
    precioConIva: r2(precioConIva),
    foodCostPct,
    margen: r2(margen),
    margenPct,
    precioSugerido,
  }
}
