import { describe, it, expect } from 'vitest'
import {
  faltaPara,
  precioEnCanal,
  seVendeEnCanal,
  minutosDeHora,
  loQueHayQueEmpacar,
  encargosPorDia,
  type Encargo,
} from './produccion'

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

describe('minutosDeHora', () => {
  // `hora_entrega` es texto libre: la caja lo teclea a mano. Estas son las
  // formas que de verdad se escriben en un mostrador.
  it('lee la hora escrita como toca', () => {
    expect(minutosDeHora('10:00')).toBe(600)
    expect(minutosDeHora('9:30')).toBe(570)
  })

  it('entiende la tarde', () => {
    expect(minutosDeHora('6 pm')).toBe(18 * 60)
    expect(minutosDeHora('1:30 p.m.')).toBe(13 * 60 + 30)
    expect(minutosDeHora('7 de la tarde')).toBe(19 * 60)
  })

  it('no le inventa doce horas a un número pelón', () => {
    // «6» son las 6. Si el negocio quiere las seis de la tarde lo escribe.
    expect(minutosDeHora('6')).toBe(6 * 60)
  })

  it('las 12 de la mañana son la medianoche', () => {
    expect(minutosDeHora('12 am')).toBe(0)
  })

  it('lo que no se puede leer se queda sin hora, no se adivina', () => {
    expect(minutosDeHora('por la tarde')).toBe(null)
    expect(minutosDeHora('')).toBe(null)
    expect(minutosDeHora(null)).toBe(null)
    expect(minutosDeHora('99:99')).toBe(null)
  })
})

describe('loQueHayQueEmpacar', () => {
  // Quien empaca no empaca por cliente: empaca por producto. La pregunta que
  // contesta esta función es «¿cuántas Fiesta de 24 corto?», no «¿qué pidió
  // doña Mari?».
  const encargo = (id: string, items: [string, string, number][]): Encargo =>
    ({
      id,
      folio: 1,
      cliente: 'X',
      telefono: null,
      fecha_entrega: null,
      hora_entrega: null,
      estado: 'apartado',
      anticipo: 0,
      nota: null,
      creado_por: null,
      created_at: '',
      empacado_at: null,
      empacado_por: null,
      items: items.map(([pid, nombre, cantidad], n) => ({
        id: `${id}-${n}`,
        producto_id: pid,
        producto: nombre,
        imagen_url: null,
        cantidad,
        precio_unitario: 0,
      })),
      total: 0,
      piezas: items.reduce((s, [, , c]) => s + c, 0),
    }) as Encargo

  it('suma el mismo producto de encargos distintos', () => {
    const r = loQueHayQueEmpacar([
      encargo('a', [['f24', 'Fiesta 24', 2]]),
      encargo('b', [['f24', 'Fiesta 24', 3]]),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].cantidad).toBe(5)
    expect(r[0].encargos).toBe(2)
  })

  it('pone primero lo más numeroso, que es por donde conviene empezar', () => {
    const r = loQueHayQueEmpacar([
      encargo('a', [
        ['g12', 'Guayaba 12', 1],
        ['f24', 'Fiesta 24', 4],
      ]),
    ])
    expect(r.map((x) => x.producto)).toEqual(['Fiesta 24', 'Guayaba 12'])
  })

  it('sin encargos no hay nada que empacar', () => {
    expect(loQueHayQueEmpacar([])).toEqual([])
  })
})

describe('encargosPorDia', () => {
  // Un lunes 20 al mediodía, para que «Hoy» y «Mañana» sean estables.
  const hoy = new Date('2026-10-20T12:00:00')
  const enc = (folio: number, fecha: string | null, hora: string | null = null) =>
    ({ id: String(folio), folio, cliente: 'X', fecha_entrega: fecha, hora_entrega: hora } as never)

  it('parte la cola por día de entrega, en orden', () => {
    const dias = encargosPorDia(
      [enc(3, '2026-10-22'), enc(1, '2026-10-20'), enc(2, '2026-10-21')],
      hoy,
    )
    expect(dias.map((d) => d.fecha)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
  })

  it('rotula con el día y el número, que es lo que pidió la casa', () => {
    const dias = encargosPorDia([enc(1, '2026-10-20'), enc(2, '2026-10-21'), enc(3, '2026-10-22')], hoy)
    expect(dias[0].titulo).toBe('Hoy · martes 20')
    expect(dias[1].titulo).toBe('Mañana · miércoles 21')
    expect(dias[2].titulo).toBe('Jueves 22')
  })

  it('lo que se pasó de su día queda marcado', () => {
    const dias = encargosPorDia([enc(1, '2026-10-18'), enc(2, '2026-10-21')], hoy)
    expect(dias[0]).toMatchObject({ vencido: true })
    expect(dias[0].titulo).toContain('Se pasó')
    expect(dias[1].vencido).toBe(false)
  })

  it('los que no traen fecha van al final de todo, no al principio', () => {
    const dias = encargosPorDia([enc(1, null), enc(2, '2026-10-21')], hoy)
    expect(dias.map((d) => d.fecha)).toEqual(['2026-10-21', null])
    expect(dias[1].titulo).toBe('Sin fecha')
  })

  it('dentro del día van por hora, y la hora ilegible al final de SU día', () => {
    const dias = encargosPorDia(
      [enc(1, '2026-10-20', 'por la tarde'), enc(2, '2026-10-20', '6 pm'), enc(3, '2026-10-20', '10:00')],
      hoy,
    )
    expect(dias[0].encargos.map((e) => e.folio)).toEqual([3, 2, 1])
  })

  it('a la misma hora, manda el folio: primero el que se apartó primero', () => {
    const dias = encargosPorDia(
      [enc(9, '2026-10-20', '10:00'), enc(4, '2026-10-20', '10:00')],
      hoy,
    )
    expect(dias[0].encargos.map((e) => e.folio)).toEqual([4, 9])
  })

  it('sin encargos no inventa días', () => {
    expect(encargosPorDia([], hoy)).toEqual([])
  })
})
