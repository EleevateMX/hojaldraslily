import { describe, it, expect } from 'vitest'
import { medidaDeVenta, enPaquetes } from './piezas'

describe('medidaDeVenta', () => {
  it('una hojaldra se cuenta en cuadros', () => {
    expect(medidaDeVenta({ cuadros: 24, piezas: null })).toMatchObject({
      cuanto: 24, unidad: 'cuadros', texto: '24 cuadros', esSuelta: false,
    })
  })

  it('un paquete de pastelitos se cuenta en piezas', () => {
    expect(medidaDeVenta({ cuadros: null, piezas: 5 })).toMatchObject({
      cuanto: 5, unidad: 'piezas', texto: '5 piezas', esSuelta: false,
    })
  })

  it('el Pan de Leche son dos piezas', () => {
    expect(medidaDeVenta({ piezas: 2 }).texto).toBe('2 piezas')
  })

  it('la pieza suelta va en singular, y se marca como suelta', () => {
    expect(medidaDeVenta({ cuadros: null, piezas: 1 })).toMatchObject({
      cuanto: 1, unidad: 'pieza', texto: '1 pieza', esSuelta: true,
    })
  })

  it('un cafe no se cuenta: ni numero ni unidad', () => {
    expect(medidaDeVenta({ cuadros: null, piezas: null })).toMatchObject({
      cuanto: null, unidad: '', texto: '', esSuelta: false,
    })
    expect(medidaDeVenta({})).toMatchObject({ cuanto: null, texto: '' })
  })

  it('si vinieran los dos, manda el cuadro: es la unidad del inventario', () => {
    expect(medidaDeVenta({ cuadros: 48, piezas: 5 }).unidad).toBe('cuadros')
  })

  it('un cero no es una medida', () => {
    expect(medidaDeVenta({ cuadros: 0, piezas: 0 }).texto).toBe('')
  })
})

describe('enPaquetes', () => {
  it('el caso que lo pidio: 17 pastelitos de paquete de 5', () => {
    expect(enPaquetes(17, 5)).toMatchObject({
      paquetes: 3, sueltas: 2, texto: '3 paquetes de 5 y 2 piezas',
    })
  })

  it('un multiplo exacto no deja piezas sueltas', () => {
    expect(enPaquetes(15, 5)).toMatchObject({ paquetes: 3, sueltas: 0, texto: '3 paquetes de 5' })
  })

  it('menos de un paquete son todas sueltas', () => {
    expect(enPaquetes(3, 5)).toMatchObject({ paquetes: 0, sueltas: 3, texto: '3 piezas' })
  })

  it('uno y uno van en singular', () => {
    expect(enPaquetes(6, 5).texto).toBe('1 paquete de 5 y 1 pieza')
  })

  it('el Pan de Leche: 5 panes son 2 paquetes y 1 suelto', () => {
    expect(enPaquetes(5, 2)).toMatchObject({ paquetes: 2, sueltas: 1 })
  })

  it('nada es nada, no "0 paquetes"', () => {
    expect(enPaquetes(0, 5).texto).toBe('nada')
  })

  it('no inventa paquetes con un tamano invalido', () => {
    expect(enPaquetes(7, 0)).toMatchObject({ paquetes: 7, sueltas: 0 })
  })
})
