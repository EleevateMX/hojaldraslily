import { describe, it, expect } from 'vitest'
import { nombreParaOrdenar, partirNombreDeVenta, agruparCategorias, menuApagado } from './catalogo'

describe('nombreParaOrdenar', () => {
  it('deja el nombre como está', () => {
    for (const n of [
      'Pasta de Guayaba · Chica · 24 cuadros',
      'Cafe de olla',
      'Agua embotellada',
    ]) {
      expect(nombreParaOrdenar(n)).toBe(n)
    }
  })

  it('nunca devuelve vacío: un producto sin nombre visible es una tarjeta muerta', () => {
    expect(nombreParaOrdenar('   ')).toBe('   ')
    expect(nombreParaOrdenar('')).toBe('')
  })

  it('no modifica el nombre de la base: la sincronización de Costeos empata por ahí', () => {
    const enLaBase = 'Jamón y Queso · Grande · 48 cuadros'
    nombreParaOrdenar(enLaBase)
    expect(enLaBase).toBe('Jamón y Queso · Grande · 48 cuadros')
  })
})

describe('partirNombreDeVenta', () => {
  it('separa el sabor de la medida', () => {
    expect(partirNombreDeVenta('Pasta de Guayaba · Chica · 24 cuadros')).toEqual({
      sabor: 'Pasta de Guayaba',
      medida: 'Chica · 24 cuadros',
    })
  })

  it('un nombre sin medida se queda entero como sabor', () => {
    expect(partirNombreDeVenta('Cafe de olla')).toEqual({
      sabor: 'Cafe de olla',
      medida: '',
    })
  })

  it('no se traga el nombre cuando el sabor lleva comas', () => {
    // "Daysi, Jamón y Jalapeño" es UN sabor: solo el punto medio separa.
    expect(partirNombreDeVenta('Daysi, Jamón y Jalapeño · 6 cuadros')).toEqual({
      sabor: 'Daysi, Jamón y Jalapeño',
      medida: '6 cuadros',
    })
  })
})

describe('menuApagado', () => {
  const prod = (activa?: boolean) =>
    ({
      categorias: activa === undefined ? null : { id: 'c', nombre: 'x', orden: 1, activa, cocinas: null },
    }) as Parameters<typeof menuApagado>[0]

  it('un menú cerrado apaga sus piezas', () => {
    expect(menuApagado(prod(false))).toBe(true)
  })

  it('un menú abierto las deja vender', () => {
    expect(menuApagado(prod(true))).toBe(false)
  })

  it('falla ABIERTO: sin categoría, el producto se sigue vendiendo', () => {
    // Esconder un producto por un dato que falta es peor que mostrarlo de
    // más: nadie lo apagó, y desaparecería del menú sin explicación.
    expect(menuApagado(prod(undefined))).toBe(false)
  })
})

describe('agruparCategorias', () => {
  const cat = (nombre: string, orden: number) => ({ id: nombre, nombre, orden })

  it('pliega las subcategorías bajo su familia', () => {
    const familias = agruparCategorias([
      cat('Menú del día', 1),
      cat('Temporada', 12),
      cat('Temporada - Navidad', 14),
      cat('Temporada - Día de muertos', 15),
    ])
    expect(familias.map((f) => f.nombre)).toEqual(['Menú del día', 'Temporada'])
    const temporada = familias.find((f) => f.nombre === 'Temporada')!
    expect(temporada.subs.map((s) => s.nombre)).toEqual(['Navidad', 'Día de muertos'])
    expect(temporada.propia?.nombre).toBe('Temporada')
  })

  it('deja sueltas las que no cuelgan de nadie', () => {
    const familias = agruparCategorias([cat('Café', 5), cat('Bebidas', 11)])
    expect(familias.every((f) => f.subs.length === 0)).toBe(true)
    expect(familias.map((f) => f.nombre)).toEqual(['Café', 'Bebidas'])
  })

  it('la familia conserva su lugar aunque sus hijas vayan al final', () => {
    // Temporada es 12 y sus subcategorías 14-19: la familia no debe irse
    // detrás de Bebidas (11) ni saltar por encima de Menú del día (8).
    const familias = agruparCategorias([
      cat('Menú del día', 8),
      cat('Bebidas', 11),
      cat('Temporada - Navidad', 19),
      cat('Temporada', 12),
    ])
    expect(familias.map((f) => f.nombre)).toEqual(['Menú del día', 'Bebidas', 'Temporada'])
  })

  it('una subcategoría sin su familia igual crea el grupo', () => {
    // Pasa si alguien apaga "Temporada" pero deja las hijas activas.
    const [f] = agruparCategorias([cat('Temporada - Navidad', 14)])
    expect(f.nombre).toBe('Temporada')
    expect(f.propia).toBeNull()
    expect(f.subs).toHaveLength(1)
  })

  it('no parte un nombre que solo tiene guiones sin espacios', () => {
    const [f] = agruparCategorias([cat('Pre-pedidos', 3)])
    expect(f.nombre).toBe('Pre-pedidos')
    expect(f.subs).toHaveLength(0)
  })
})
