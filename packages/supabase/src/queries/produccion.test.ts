import { describe, it, expect } from 'vitest'
import { faltaPara, precioEnCanal, seVendeEnCanal } from './produccion'

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

describe('precios por canal', () => {
  const guayaba12 = { id: 'g12', precio: 225 }
  const guayaba24 = { id: 'g24', precio: 440 }
  const trenza = { id: 'tz', precio: 160 }

  // Tal como quedó la lista de precios de la casa: la guayaba de 12 sube en
  // Rappi, la de 24 y la trenza traen "X" (no van en la plataforma), y lo que
  // no tiene renglón se cobra igual que en mostrador.
  const precios = {
    g12: { rappi: { precio: 290, disponible: true } },
    g24: { rappi: { precio: 0, disponible: false } },
    tz: { rappi: { precio: 0, disponible: false } },
  }

  it('en Rappi cobra el precio de Rappi', () => {
    expect(precioEnCanal(guayaba12, 'rappi', precios)).toBe(290)
  })

  it('en mostrador cobra el de mostrador, aunque tenga precio de Rappi', () => {
    expect(precioEnCanal(guayaba12, 'pos', precios)).toBe(225)
  })

  it('lo que no tiene renglón vale lo mismo en los dos lados', () => {
    expect(precioEnCanal({ id: 'otro', precio: 60 }, 'rappi', precios)).toBe(60)
  })

  // La trampa: la marca de "no se vende aquí" guarda precio 0. Si se devolviera
  // tal cual, la caja ofrecería una trenza de $160 en cero.
  it('una "X" nunca se convierte en un precio de cero', () => {
    expect(precioEnCanal(trenza, 'rappi', precios)).toBe(160)
    expect(precioEnCanal(guayaba24, 'rappi', precios)).toBe(440)
  })

  it('en Rappi esconde lo que trae "X", y en mostrador lo deja', () => {
    expect(seVendeEnCanal(guayaba24, 'rappi', precios)).toBe(false)
    expect(seVendeEnCanal(guayaba24, 'pos', precios)).toBe(true)
  })

  it('sin renglón, se vende: la ausencia no es una prohibición', () => {
    expect(seVendeEnCanal({ id: 'otro' }, 'rappi', precios)).toBe(true)
  })
})
