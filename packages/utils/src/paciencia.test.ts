import { describe, expect, it } from 'vitest'
import { crearPaciencia } from './paciencia'

describe('crearPaciencia', () => {
  it('no se acaba con un fallo suelto', () => {
    const p = crearPaciencia(25_000, 0)
    expect(p.seAcabo(10_000)).toBe(false)
  })

  it('se acaba cuando lleva más del plazo sin una lectura buena', () => {
    const p = crearPaciencia(25_000, 0)
    expect(p.seAcabo(25_001)).toBe(true)
  })

  it('una lectura buena vuelve a empezar la cuenta', () => {
    const p = crearPaciencia(25_000, 0)
    p.bien(20_000)
    expect(p.seAcabo(40_000)).toBe(false)
    expect(p.seAcabo(45_001)).toBe(true)
  })
})
