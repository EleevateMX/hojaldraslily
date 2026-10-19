import { describe, it, expect } from 'vitest'
import { hoyEnMerida, folioSinInternet, esFolioProvisional } from './dia'

describe('hoyEnMerida', () => {
  it('a las 7 de la noche sigue siendo el MISMO día, aunque UTC diga otro', () => {
    // 19/10/2026 19:30 en Mérida son las 01:30 UTC del día 20. Contado por
    // UTC, esa venta caería en el pan del día siguiente — pan que a esa hora
    // todavía no existe.
    expect(hoyEnMerida(new Date('2026-10-20T01:30:00Z'))).toBe('2026-10-19')
  })

  it('a las 6 de la mañana ya es el día nuevo', () => {
    expect(hoyEnMerida(new Date('2026-10-20T12:00:00Z'))).toBe('2026-10-20')
  })

  it('el corte del día es la medianoche de Mérida, no la de UTC', () => {
    expect(hoyEnMerida(new Date('2026-10-20T05:59:00Z'))).toBe('2026-10-19')
    expect(hoyEnMerida(new Date('2026-10-20T06:01:00Z'))).toBe('2026-10-20')
  })
})

describe('folioSinInternet', () => {
  it('va con dos digitos: «S-7» se oye como «S-17» en el mostrador', () => {
    expect(folioSinInternet(1)).toBe('S-01')
    expect(folioSinInternet(7)).toBe('S-07')
    expect(folioSinInternet(12)).toBe('S-12')
  })

  it('pasando de 99 crece solo', () => {
    expect(folioSinInternet(100)).toBe('S-100')
  })

  it('nunca da S-00 ni un folio negativo', () => {
    expect(folioSinInternet(0)).toBe('S-01')
    expect(folioSinInternet(-3)).toBe('S-01')
  })
})

describe('esFolioProvisional', () => {
  it('distingue el folio de la casa del provisional', () => {
    expect(esFolioProvisional('S-03')).toBe(true)
    expect(esFolioProvisional(1042)).toBe(false)
    expect(esFolioProvisional('1042')).toBe(false)
    expect(esFolioProvisional(null)).toBe(false)
  })
})
