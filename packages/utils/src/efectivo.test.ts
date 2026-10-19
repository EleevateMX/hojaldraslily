import { describe, it, expect } from 'vitest'
import {
  BILLETES, MONEDAS, CONTEO_VACIO,
  sumaConteo, ponerPiezas, piezasDe, hayConteo, renglonesDelConteo, leerConteo,
  type Conteo,
} from './efectivo'

describe('el billete de $20 y la moneda de $20', () => {
  // Es LA razón de que esto no sea un `Record<number, number>` y ya. En la
  // tienda hermana, la primera versión indexaba solo por denominación: al
  // teclear las monedas de $20 se borraban los billetes de $20, el total
  // quedaba corto y el desglose mentía.
  it('se cuentan por separado y ninguno le pisa el renglón al otro', () => {
    let c: Conteo = CONTEO_VACIO
    c = ponerPiezas(c, 'billetes', 20, 3)
    c = ponerPiezas(c, 'monedas', 20, 7)
    expect(piezasDe(c, 'billetes', 20)).toBe(3)
    expect(piezasDe(c, 'monedas', 20)).toBe(7)
    expect(sumaConteo(c)).toBe(200)
  })

  it('el $20 es la única denominación que existe de las dos formas', () => {
    const enLasDos = BILLETES.filter((b) => (MONEDAS as readonly number[]).includes(b))
    expect(enLasDos).toEqual([20])
  })
})

describe('sumaConteo', () => {
  it('suma un cajón de verdad', () => {
    let c: Conteo = CONTEO_VACIO
    c = ponerPiezas(c, 'billetes', 500, 2)
    c = ponerPiezas(c, 'billetes', 200, 3)
    c = ponerPiezas(c, 'billetes', 50, 1)
    c = ponerPiezas(c, 'monedas', 10, 4)
    c = ponerPiezas(c, 'monedas', 1, 7)
    expect(sumaConteo(c)).toBe(1000 + 600 + 50 + 40 + 7)
  })

  it('un conteo vacío vale cero, y null también', () => {
    expect(sumaConteo(CONTEO_VACIO)).toBe(0)
    expect(sumaConteo(null)).toBe(0)
    expect(sumaConteo(undefined)).toBe(0)
  })
})

describe('ponerPiezas', () => {
  it('no deja piezas negativas ni fraccionarias: son billetes, no pesos', () => {
    let c = ponerPiezas(CONTEO_VACIO, 'billetes', 100, -5)
    expect(piezasDe(c, 'billetes', 100)).toBe(0)
    c = ponerPiezas(c, 'monedas', 5, 2.9)
    expect(piezasDe(c, 'monedas', 5)).toBe(2)
  })

  it('no muta el conteo que recibe', () => {
    const antes: Conteo = { billetes: { 100: 1 }, monedas: {} }
    const despues = ponerPiezas(antes, 'billetes', 100, 9)
    expect(antes.billetes[100]).toBe(1)
    expect(despues.billetes[100]).toBe(9)
  })
})

describe('hayConteo', () => {
  // Un cajón en blanco y un cajón contado en cero no son lo mismo: el
  // segundo es una afirmación de alguien, el primero es que nadie contó.
  it('distingue «no se contó» de «se contó y dio cero»', () => {
    expect(hayConteo(CONTEO_VACIO)).toBe(false)
    expect(hayConteo(null)).toBe(false)
    expect(hayConteo({ billetes: { 1000: 0 }, monedas: {} })).toBe(false)
    expect(hayConteo({ billetes: {}, monedas: { 1: 1 } })).toBe(true)
  })
})

describe('renglonesDelConteo', () => {
  it('solo lo que tiene piezas, de mayor a menor, billetes antes que monedas', () => {
    const c: Conteo = { billetes: { 500: 1, 100: 0, 20: 2 }, monedas: { 10: 3 } }
    expect(renglonesDelConteo(c)).toEqual([
      { especie: 'billetes', denominacion: 500, piezas: 1, subtotal: 500 },
      { especie: 'billetes', denominacion: 20, piezas: 2, subtotal: 40 },
      { especie: 'monedas', denominacion: 10, piezas: 3, subtotal: 30 },
    ])
  })

  it('los subtotales suman el total', () => {
    const c: Conteo = { billetes: { 200: 3 }, monedas: { 5: 4, 2: 1 } }
    const suma = renglonesDelConteo(c).reduce((t, r) => t + r.subtotal, 0)
    expect(suma).toBe(sumaConteo(c))
  })
})

describe('leerConteo', () => {
  it('lee lo que guardó la base', () => {
    expect(leerConteo({ billetes: { '500': 2 }, monedas: { '10': 3 } })).toEqual({
      billetes: { 500: 2 },
      monedas: { 10: 3 },
    })
  })

  // Es un jsonb: lo que llega puede venir de una versión anterior de la
  // pantalla. Una caja que revienta al abrir el corte es peor que un
  // desglose incompleto.
  it('aguanta basura sin reventar', () => {
    expect(leerConteo(null)).toBeNull()
    expect(leerConteo('hola')).toBeNull()
    expect(leerConteo({})).toEqual({ billetes: {}, monedas: {} })
    expect(leerConteo({ billetes: 'no', monedas: null })).toEqual({ billetes: {}, monedas: {} })
    expect(leerConteo({ billetes: { x: 3, '100': -2 } })).toEqual({
      billetes: { 100: 0 },
      monedas: {},
    })
  })
})
