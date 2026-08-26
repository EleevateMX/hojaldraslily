import { describe, it, expect } from 'vitest'
import { calcularCosteo, type ParametrosCosteo } from './costeo'

const parametrosBase: ParametrosCosteo = {
  iva: 0.16,
  foodCostMeta: 0.3,
  mermaDefault: 0.02,
  manoObra: 5,
}

describe('calcularCosteo', () => {
  it('usa la merma default cuando el producto no trae la suya', () => {
    const r = calcularCosteo(
      { costoInsumos: 100, costoEmpaque: 10, mermaPct: null, manoObra: 0, precio: 150, ivaIncluido: true },
      parametrosBase,
    )
    // costoReceta = 100-10=90; costoConMerma = 90*1.02=91.8; +empaque(10)+manoObra(5) = 106.8
    expect(r.costoReceta).toBe(90)
    expect(r.costoConMerma).toBe(91.8)
    expect(r.costoTotal).toBe(106.8)
  })

  it('usa la merma del producto cuando viene definida, no la default', () => {
    const r = calcularCosteo(
      { costoInsumos: 100, costoEmpaque: 0, mermaPct: 0.1, manoObra: 0, precio: 150, ivaIncluido: true },
      parametrosBase,
    )
    expect(r.costoConMerma).toBe(110) // 100 * 1.10
  })

  it('la merma NO se aplica al empaque', () => {
    const conEmpaqueAlto = calcularCosteo(
      { costoInsumos: 200, costoEmpaque: 100, mermaPct: 0.5, manoObra: 0, precio: 150, ivaIncluido: true },
      parametrosBase,
    )
    // costoReceta = 200-100=100; costoConMerma = 100*1.5=150;
    // costoTotal = 150 + 100(empaque, sin merma) + 5(manoObra global) = 255
    expect(conEmpaqueAlto.costoTotal).toBe(255)
  })

  it('usa la mano de obra del producto si es > 0, si no la global', () => {
    const conManoObraPropia = calcularCosteo(
      { costoInsumos: 100, costoEmpaque: 0, mermaPct: 0, manoObra: 20, precio: 150, ivaIncluido: true },
      parametrosBase,
    )
    expect(conManoObraPropia.costoTotal).toBe(120) // 100 + 20, no la global (5)

    const sinManoObraPropia = calcularCosteo(
      { costoInsumos: 100, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 150, ivaIncluido: true },
      parametrosBase,
    )
    expect(sinManoObraPropia.costoTotal).toBe(105) // 100 + global (5)
  })

  it('calcula precio sin IVA correctamente cuando el precio ya lo incluye', () => {
    const r = calcularCosteo(
      { costoInsumos: 50, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 116, ivaIncluido: true },
      parametrosBase,
    )
    expect(r.precioSinIva).toBe(100) // 116 / 1.16
    expect(r.precioConIva).toBe(116)
  })

  it('calcula precio con IVA correctamente cuando el precio NO lo incluye', () => {
    const r = calcularCosteo(
      { costoInsumos: 50, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 100, ivaIncluido: false },
      parametrosBase,
    )
    expect(r.precioSinIva).toBe(100)
    expect(r.precioConIva).toBe(116)
  })

  it('food cost y margen son null cuando el precio sin IVA es 0', () => {
    const r = calcularCosteo(
      { costoInsumos: 50, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 0, ivaIncluido: false },
      parametrosBase,
    )
    expect(r.foodCostPct).toBeNull()
    expect(r.margenPct).toBeNull()
  })

  it('food cost y margen son coherentes entre sí (manoObra:0 cae al default global de 5)', () => {
    const r = calcularCosteo(
      { costoInsumos: 100, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 200, ivaIncluido: false },
      parametrosBase,
    )
    // costoTotal = 100 (receta, sin merma) + 0 (empaque) + 5 (manoObra global) = 105
    // precioSinIva=200 -> foodCostPct=105/200=0.525, margen=95, margenPct=0.475
    expect(r.costoTotal).toBe(105)
    expect(r.foodCostPct).toBe(0.525)
    expect(r.margen).toBe(95)
    expect(r.margenPct).toBe(0.475)
  })

  it('precio sugerido se redondea a múltiplos de 5', () => {
    const r = calcularCosteo(
      { costoInsumos: 30, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 100, ivaIncluido: false },
      parametrosBase,
    )
    // costoTotal = 30 + 0 + 5(manoObra global) = 35; /foodCostMeta(0.3)=116.67;
    // *1.16=135.33; /5=27.07 -> round=27 -> *5=135
    expect(r.precioSugerido).toBe(135)
    expect(r.precioSugerido % 5).toBe(0)
  })

  it('precio sugerido es 0 si no hay meta de food cost configurada', () => {
    const r = calcularCosteo(
      { costoInsumos: 30, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 100, ivaIncluido: false },
      { ...parametrosBase, foodCostMeta: 0 },
    )
    expect(r.precioSugerido).toBe(0)
  })

  it('nunca genera costos negativos con insumos/empaque en 0 (queda solo la manoObra global)', () => {
    const r = calcularCosteo(
      { costoInsumos: 0, costoEmpaque: 0, mermaPct: 0, manoObra: 0, precio: 50, ivaIncluido: false },
      parametrosBase,
    )
    expect(r.costoTotal).toBe(5) // manoObra global, insumos/empaque en 0
    expect(r.margen).toBe(45)
  })
})
