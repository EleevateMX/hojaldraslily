import { describe, it, expect } from 'vitest'
import { urlDeFoto, dibujoParaNombre } from './fotos'

describe('urlDeFoto', () => {
  it('deja pasar una foto subida a Storage', () => {
    const u = 'https://x.supabase.co/storage/v1/object/public/productos/a.jpg'
    expect(urlDeFoto(u)).toBe(u)
  })

  it('arma la ruta del dibujo bajo el base de la app', () => {
    expect(urlDeFoto('nutella.png', '/hojaldraslily/app/kiosko/'))
      .toBe('/hojaldraslily/app/kiosko/productos/nutella.png')
  })

  it('funciona cuando la app vive en la raiz', () => {
    expect(urlDeFoto('nutella.png')).toBe('/productos/nutella.png')
  })

  it('tolera un base sin diagonal final', () => {
    expect(urlDeFoto('nutella.png', '/app')).toBe('/app/productos/nutella.png')
  })

  it('sin imagen no inventa una ruta', () => {
    expect(urlDeFoto(null)).toBeNull()
    expect(urlDeFoto('   ')).toBeNull()
  })
})

describe('dibujoParaNombre', () => {
  it('no confunde la guayaba con queso de bola con la guayaba sola', () => {
    expect(dibujoParaNombre('Pasta de Guayaba y Queso de Bola · Chica · 24 cuadros'))
      .toBe('guayaba-queso-bola.png')
    expect(dibujoParaNombre('Pasta de Guayaba · 6 cuadros'))
      .toBe('pasta-de-guayaba.png')
  })

  it('reconoce los sabores del menu', () => {
    expect(dibujoParaNombre('Jamón y Queso · Mini · 12 cuadros')).toBe('jamon-y-queso.png')
    expect(dibujoParaNombre('Daysi, Jamón y Jalapeño · 6 cuadros')).toBe('daysi.png')
    expect(dibujoParaNombre('Cafe de olla')).toBe('cafe-de-olla.png')
  })

  it('un sabor que no conoce se queda sin dibujo, no con uno equivocado', () => {
    expect(dibujoParaNombre('Pastel de zanahoria')).toBeNull()
  })
})
