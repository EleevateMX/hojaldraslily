import { describe, it, expect } from 'vitest'
import { faltaPara } from './produccion'

describe('faltaPara', () => {
  const ahora = new Date('2026-08-27T10:00:00Z')
  const enMinutos = (m: number) => new Date(ahora.getTime() + m * 60000).toISOString()

  it('dice cuánto falta en minutos', () => {
    expect(faltaPara(enMinutos(25), ahora).texto).toBe('en 25 min')
  })

  it('pasa a horas cuando falta más de una', () => {
    expect(faltaPara(enMinutos(95), ahora).texto).toBe('en 1 h 35 min')
  })

  it('avisa cuando ya se pasó, y no lo disfraza de "en -5 min"', () => {
    const r = faltaPara(enMinutos(-5), ahora)
    expect(r.texto).toBe('5 min tarde')
    expect(r.tarde).toBe(true)
  })

  it('lo que se pasó mucho también se lee en horas', () => {
    expect(faltaPara(enMinutos(-75), ahora).texto).toBe('1 h 15 min tarde')
  })

  it('justo a tiempo no es "tarde"', () => {
    const r = faltaPara(enMinutos(0), ahora)
    expect(r.texto).toBe('ya mero')
    expect(r.tarde).toBe(false)
  })
})
