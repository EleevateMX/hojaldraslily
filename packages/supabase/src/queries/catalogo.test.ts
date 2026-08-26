import { describe, it, expect } from 'vitest'
import { nombreParaOrdenar, agruparCategorias } from './catalogo'

describe('nombreParaOrdenar', () => {
  it('quita el "Scoop" para que quepa la marca, el producto y el sabor', () => {
    expect(nombreParaOrdenar('Scoop BIRDMAN - H Balance (Pink Lemonade)'))
      .toBe('BIRDMAN - H Balance (Pink Lemonade)')
    expect(nombreParaOrdenar('Scoop GHOST - Ghost Legend PW (Welchs Grape)'))
      .toBe('GHOST - Ghost Legend PW (Welchs Grape)')
  })

  it('no toca lo que no es un scoop', () => {
    for (const n of ['#1 Choco Killer', 'Coca Cola Zero', 'Vaso con Hielo', 'Kombucha']) {
      expect(nombreParaOrdenar(n)).toBe(n)
    }
  })

  it('no confunde una palabra que empieza con "scoop"', () => {
    // Sin el \s+ del patron, "Scoops variados" quedaria como "s variados".
    expect(nombreParaOrdenar('Scoops variados')).toBe('Scoops variados')
  })

  it('nunca devuelve vacio: un producto sin nombre visible es una tarjeta muerta', () => {
    expect(nombreParaOrdenar('Scoop')).toBe('Scoop')
    expect(nombreParaOrdenar('Scoop   ')).toBe('Scoop   ')
  })

  it('el nombre de la base no cambia: la sincronizacion de costeos empata por ahi', () => {
    const enLaBase = 'Scoop BIRDMAN FALCON - Chocolate'
    nombreParaOrdenar(enLaBase)
    expect(enLaBase).toBe('Scoop BIRDMAN FALCON - Chocolate')
  })
})

describe('agruparCategorias', () => {
  const cat = (nombre: string, orden: number) => ({ id: nombre, nombre, orden })

  it('pliega las subcategorias bajo su familia', () => {
    const familias = agruparCategorias([
      cat('Shakes', 1),
      cat('Scoops', 12),
      cat('Scoops - Proteínas', 14),
      cat('Scoops - Creatinas', 15),
    ])
    expect(familias.map((f) => f.nombre)).toEqual(['Shakes', 'Scoops'])
    const scoops = familias.find((f) => f.nombre === 'Scoops')!
    expect(scoops.subs.map((s) => s.nombre)).toEqual(['Proteínas', 'Creatinas'])
    expect(scoops.propia?.nombre).toBe('Scoops')
  })

  it('reconoce "Suplementos Birdman", que no lleva guion', () => {
    const [suplementos] = agruparCategorias([
      cat('Suplementos', 13),
      cat('Suplementos Birdman', 25),
      cat('Suplementos - BCAAs', 22),
    ])
    expect(suplementos.nombre).toBe('Suplementos')
    expect(suplementos.subs.map((s) => s.nombre).sort()).toEqual(['BCAAs', 'Birdman'])
  })

  it('deja sueltas las que no cuelgan de nadie', () => {
    const familias = agruparCategorias([cat('Café', 5), cat('Combos', 11)])
    expect(familias.every((f) => f.subs.length === 0)).toBe(true)
    expect(familias.map((f) => f.nombre)).toEqual(['Café', 'Combos'])
  })

  it('la familia conserva su lugar aunque sus hijas vayan al final', () => {
    // Scoops es 12 y sus subcategorias 14-19: la familia no debe irse detras
    // de Combos (11) ni saltar por encima de Alimentos (8).
    const familias = agruparCategorias([
      cat('Alimentos', 8), cat('Combos', 11), cat('Scoops - Birdman', 19), cat('Scoops', 12),
    ])
    expect(familias.map((f) => f.nombre)).toEqual(['Alimentos', 'Combos', 'Scoops'])
  })

  it('una subcategoria sin su familia igual crea el grupo', () => {
    // Pasa si alguien apaga "Scoops" pero deja las hijas activas.
    const [f] = agruparCategorias([cat('Scoops - Proteínas', 14)])
    expect(f.nombre).toBe('Scoops')
    expect(f.propia).toBeNull()
    expect(f.subs).toHaveLength(1)
  })

  it('no parte un nombre que solo tiene guiones sin espacios', () => {
    const [f] = agruparCategorias([cat('Pre-entrenos', 3)])
    expect(f.nombre).toBe('Pre-entrenos')
    expect(f.subs).toHaveLength(0)
  })
})
