import { describe, it, expect } from 'vitest'
import { enMoldes, enMoldesConTamano, cuadrosPorCuarto } from './moldes'

describe('cuadrosPorCuarto', () => {
  // La razón de ser de los cuartos: un cuarto de molde es el paquete más
  // chico que sale de ese molde.
  it('un cuarto del molde de 48 es el paquete de 12', () => {
    expect(cuadrosPorCuarto(48)).toBe(12)
  })
  it('un cuarto del molde de 24 es el paquete de 6', () => {
    expect(cuadrosPorCuarto(24)).toBe(6)
  })
})

describe('enMoldes', () => {
  // El ejemplo que dio el negocio, tal cual: dos moldes de 48; se usa un
  // paquete de 12 y quedan «un molde y tres cuartos».
  it('el caso del negocio: 2 moldes menos un paquete de 12', () => {
    expect(enMoldes(96, 48).texto).toBe('2 moldes')
    expect(enMoldes(96 - 12, 48).texto).toBe('1 molde y ¾')
  })

  it('cuenta igual en el molde de 24, con su propio cuarto', () => {
    // Del molde de 24 el cuarto son 6, así que quitar un paquete de 6 deja ¾.
    expect(enMoldes(48, 24).texto).toBe('2 moldes')
    expect(enMoldes(48 - 6, 24).texto).toBe('1 molde y ¾')
    // Y un paquete de 12 se lleva DOS cuartos del de 24.
    expect(enMoldes(48 - 12, 24).texto).toBe('1 molde y ½')
  })

  it('sin moldes enteros dice "de molde", que si no se lee como cuadros', () => {
    expect(enMoldes(12, 48).texto).toBe('¼ de molde')
    expect(enMoldes(24, 48).texto).toBe('½ de molde')
    expect(enMoldes(36, 48).texto).toBe('¾ de molde')
  })

  it('redondea HACIA ABAJO: 47 de 48 no es un molde', () => {
    const r = enMoldes(47, 48)
    expect(r.moldes).toBe(0)
    expect(r.cuartos).toBe(3)
    expect(r.texto).toBe('¾ de molde')
    // Lo que sobra no se esconde, se enseña aparte.
    expect(r.sueltos).toBe(11)
  })

  it('lo que no llega a un cuarto se dice en cuadros, no en "nada"', () => {
    // Siete cuadros en la charola no son cero pan.
    expect(enMoldes(7, 48).texto).toBe('7 cuadros')
    expect(enMoldes(1, 48).texto).toBe('1 cuadro')
  })

  it('cero es "nada"', () => {
    expect(enMoldes(0, 48).texto).toBe('nada')
    expect(enMoldes(-5, 48).texto).toBe('nada')
  })

  it('el número grande que nadie quiere leer', () => {
    // 1423 cuadros: 29 moldes (1392), sobran 31 -> 2 cuartos (24) y 7 sueltos.
    const r = enMoldes(1423, 48)
    expect(r.moldes).toBe(29)
    expect(r.cuartos).toBe(2)
    expect(r.sueltos).toBe(7)
    expect(r.texto).toBe('29 moldes y ½')
  })

  it('la forma corta cabe en una esquina', () => {
    expect(enMoldes(84, 48).corto).toBe('1¾')
    expect(enMoldes(96, 48).corto).toBe('2')
    expect(enMoldes(12, 48).corto).toBe('¼')
    expect(enMoldes(0, 48).corto).toBe('0')
  })

  it('nunca inventa un cuarto de más con un molde raro', () => {
    // Un molde de 50 tiene cuartos de 12 (redondeado): 49 cuadros darían
    // "4 cuartos" sin el tope, que es un molde entero escrito mal.
    const r = enMoldes(49, 50)
    expect(r.moldes).toBe(0)
    expect(r.cuartos).toBeLessThanOrEqual(3)
  })
})

describe('enMoldesConTamano', () => {
  // Donde conviven los dos tamaños, la frase sola es ambigua: los mismos 48
  // cuadros son "un molde" o "dos", según con cuál se horneó.
  it('dice de qué molde habla', () => {
    expect(enMoldesConTamano(84, 48)).toBe('1 molde de 48 y ¾')
    expect(enMoldesConTamano(48, 24)).toBe('2 moldes de 24')
    expect(enMoldesConTamano(12, 48)).toBe('¼ de molde de 48')
  })
  it('con menos de un cuarto no hay molde del que hablar', () => {
    expect(enMoldesConTamano(7, 48)).toBe('7 cuadros')
  })
})
