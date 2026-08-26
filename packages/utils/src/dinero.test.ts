import { describe, it, expect } from 'vitest'
import { mxn, pct } from './dinero'

describe('mxn', () => {
  it('formatea un monto positivo en pesos mexicanos', () => {
    expect(mxn(150)).toBe('$150.00')
  })

  it('formatea decimales correctamente', () => {
    expect(mxn(99.5)).toBe('$99.50')
  })

  it('trata null/undefined como $0.00 en vez de tronar', () => {
    expect(mxn(null)).toBe('$0.00')
    expect(mxn(undefined)).toBe('$0.00')
  })

  it('formatea 0 explícito igual que null (no lo confunde con "sin dato")', () => {
    expect(mxn(0)).toBe('$0.00')
  })

  it('usa separador de miles', () => {
    expect(mxn(1234.5)).toBe('$1,234.50')
  })
})

describe('pct', () => {
  it('convierte una fracción a porcentaje con un decimal', () => {
    expect(pct(0.3)).toBe('30.0%')
  })

  it('redondea a un decimal', () => {
    expect(pct(0.3333)).toBe('33.3%')
  })

  it('devuelve un guion cuando no hay dato (null)', () => {
    expect(pct(null)).toBe('—')
  })

  it('distingue 0 (0.0%) de "sin dato" (—)', () => {
    expect(pct(0)).toBe('0.0%')
  })
})
