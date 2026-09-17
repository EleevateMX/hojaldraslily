import { describe, it, expect } from 'vitest'
import { diasSinContar } from './inventario'

describe('diasSinContar', () => {
  const ahora = new Date('2026-09-17T09:00:00')

  it('lo que se contó hoy va en cero', () => {
    expect(diasSinContar('2026-09-17T07:30:00', ahora)).toBe(0)
  })

  it('cuenta los días completos hacia atrás', () => {
    expect(diasSinContar('2026-09-10T18:00:00', ahora)).toBe(7)
  })

  it('lo que nunca se contó no es "hace mucho": es null', () => {
    expect(diasSinContar(null, ahora)).toBeNull()
  })

  it('una fecha que no se entiende tampoco inventa un número', () => {
    expect(diasSinContar('el martes pasado', ahora)).toBeNull()
  })

  // La trampa que ya costó una vez en los encargos: comparar horas en vez de
  // días hace que contar a las 11 p.m. y mirar a la 1 a.m. den días distintos
  // según de qué lado se mire.
  it('anoche tarde y esta madrugada siguen siendo ayer y hoy', () => {
    const madrugada = new Date('2026-09-17T01:00:00')
    expect(diasSinContar('2026-09-16T23:30:00', madrugada)).toBe(1)
  })

  it('contar en la mañana y mirar en la noche del mismo día sigue siendo hoy', () => {
    const noche = new Date('2026-09-17T23:30:00')
    expect(diasSinContar('2026-09-17T06:00:00', noche)).toBe(0)
  })
})
