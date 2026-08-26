import { describe, expect, it } from 'vitest'
import { mensajeDeError } from './errores'

describe('mensajeDeError', () => {
  it('saca el mensaje de un Error normal', () => {
    expect(mensajeDeError(new Error('se cayó la red'))).toBe('se cayó la red')
  })

  it('lee el objeto plano de Supabase — el caso que mostraba [object Object]', () => {
    const errorDeSupabase = {
      code: 'P0001',
      message: 'Todos los productos de un combo deben ser de la misma estación',
      details: null,
      hint: null,
    }
    expect(mensajeDeError(errorDeSupabase)).toBe(
      'Todos los productos de un combo deben ser de la misma estación',
    )
  })

  it('conserva el hint, que es la parte que dice cómo arreglarlo', () => {
    expect(mensajeDeError({ message: 'función inexistente', hint: 'revisa el nombre' }))
      .toBe('función inexistente — revisa el nombre')
  })

  it('nunca devuelve "[object Object]"', () => {
    expect(mensajeDeError({ code: 'X' })).not.toContain('[object Object]')
    expect(mensajeDeError({})).toBe('Ocurrió un error inesperado.')
  })

  it('deja pasar strings y otros primitivos', () => {
    expect(mensajeDeError('falló y ya')).toBe('falló y ya')
  })
})
