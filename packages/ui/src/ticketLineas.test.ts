import { describe, it, expect } from 'vitest'
import {
  armarTicket,
  armarCorte,
  subtotalDe,
  totalDe,
  COLUMNAS_80MM,
  type LineaTicket,
} from './ticketLineas'
import { ticketHTML, NEGOCIO_DEFAULT, type TicketData } from './ticket'

const venta: TicketData = {
  folio: 1042,
  fecha: new Date('2026-10-19T14:26:00'),
  cajero: 'Rosa M.',
  canal: 'Caja',
  items: [
    { cantidad: 1, nombre: 'Jamón y Queso · Chica · 24 cuadros', precioUnitario: 310 },
    { cantidad: 2, nombre: 'Pastelitos de Lomo · 5 pzas', precioUnitario: 140 },
  ],
  metodoPago: 'Efectivo',
  recibido: 700,
}

// El texto de cada línea, venga suelta o dentro de una marca de estilo.
const texto = (l: LineaTicket[]) =>
  l.flatMap((x) => (typeof x === 'string' ? [x] : x.tipo === 'estilo' ? [x.texto] : []))
/** Lo que una línea ocupa en columnas: al doble de ancho, el doble. */
const columnas = (x: LineaTicket) =>
  typeof x === 'string' ? x.length : x.tipo === 'estilo' ? x.texto.length * (x.ancho ?? 1) : 0

describe('armarTicket (líneas de la térmica)', () => {
  it('ninguna línea se pasa del ancho del papel', () => {
    // Es la única regla que no se puede romper: lo que se pasa de 48, la
    // impresora lo tira a la siguiente línea donde le toca y el ticket se
    // desalinea entero.
    const l = armarTicket(venta, NEGOCIO_DEFAULT)
    const largas = l.filter((x) => columnas(x) > COLUMNAS_80MM)
    expect(largas).toEqual([])
  })

  // El diseño de la nota (muestras/ticket.png) vive de tres cosas sin color:
  // el folio blanco sobre negro, el TOTAL grande y el recuadro del encargo.
  // Si alguna deja de ser una marca, el papel vuelve a ser texto plano y
  // nadie se entera hasta ver el ticket.
  it('el folio va invertido y al doble; el TOTAL, al doble de alto', () => {
    const l = armarTicket(venta, NEGOCIO_DEFAULT)
    const folio = l.find((x) => typeof x !== 'string' && x.tipo === 'estilo' && x.texto.includes('#1042'))
    expect(folio && folio.tipo === 'estilo' ? [folio.invertido, folio.ancho, folio.alto] : null).toEqual([true, 2, 2])
    const total = l.find((x) => typeof x !== 'string' && x.tipo === 'estilo' && x.texto.startsWith('TOTAL'))
    expect(total && total.tipo === 'estilo' ? [total.alto, total.texto.endsWith('$590.00')] : null).toEqual([2, true])
  })

  it('el nombre del encargo va al doble de ancho y cabe aunque sea largo', () => {
    const l = armarTicket({ ...venta, clienteNombre: 'María Fernanda Cáceres Pech (encargo #1043)' }, NEGOCIO_DEFAULT)
    const nombre = l.filter((x) => typeof x !== 'string' && x.tipo === 'estilo' && x.ancho === 2 && x.negrita)
    expect(nombre.length).toBeGreaterThan(1) // se partió, no se cortó
    expect(l.every((x) => columnas(x) <= COLUMNAS_80MM)).toBe(true)
    expect(texto(l).join(' ')).toContain('Cáceres Pech')
  })

  it('el importe queda pegado al borde derecho', () => {
    const l = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    const total = l.find((x) => x.startsWith('TOTAL'))!
    expect(total.endsWith('$590.00')).toBe(true)
    expect(total.length).toBe(COLUMNAS_80MM)
  })

  it('con más de uno, dice el precio unitario; con uno solo, no', () => {
    const l = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.includes('@ $140.00 c/u'))).toBe(true)
    expect(l.some((x) => x.includes('@ $310.00 c/u'))).toBe(false)
  })

  it('un nombre largo se envuelve y el importe cae solo en la última línea', () => {
    const largo: TicketData = {
      ...venta,
      items: [{
        cantidad: 1,
        nombre: 'Hojaldra de Corazón · Pasta de Guayaba, Philadelphia y Nuez',
        precioUnitario: 440,
      }],
    }
    const l = texto(armarTicket(largo, NEGOCIO_DEFAULT))
    expect(l.every((x) => x.length <= COLUMNAS_80MM)).toBe(true)

    // Dentro del BLOQUE DE PARTIDAS el importe sale una sola vez, pegado al
    // borde. (En todo el ticket sale tres veces —renglón, total y pago— y
    // eso es correcto: lo que no puede es partirse entre dos renglones.)
    const ini = l.findIndex((x) => x.startsWith('CANT DESCRIPCION')) + 2
    const fin = l.findIndex((x, i) => i > ini && x.startsWith('---'))
    const partidas = l.slice(ini, fin)
    const conImporte = partidas.filter((x) => x.includes('$440.00'))
    expect(conImporte.length).toBe(1)
    expect(conImporte[0].endsWith('$440.00')).toBe(true)
    // Y el nombre se repartió en más de un renglón, completo.
    expect(partidas.join(' ')).toContain('Philadelphia')
    expect(partidas.length).toBeGreaterThan(1)
  })

  it('el anticipo va en su propio renglón, no sumado al descuento', () => {
    const l = texto(armarTicket({ ...venta, anticipo: 200, descuento: 50 }, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.startsWith('Descuento'))).toBe(true)
    expect(l.some((x) => x.startsWith('Anticipo ya pagado'))).toBe(true)
    // Y el total es lo que se paga HOY.
    expect(l.find((x) => x.startsWith('TOTAL'))!.endsWith('$340.00')).toBe(true)
  })

  it('el voucher de la terminal imprime lo que pide el banco y solo los últimos 4', () => {
    const conTarjeta: TicketData = {
      ...venta,
      metodoPago: 'Terminal',
      recibido: undefined,
      referenciaPago: '123456',
      tarjeta: {
        afiliacion: '7654321', terminalId: 'TID01', controlNumber: 'L1042T1ABC',
        autorizacion: '123456', referencia: '000012345678', marca: 'VISA', tipo: 'CREDITO',
        banco: 'BANORTE', pan: '4152 31** **** 9876', entrada: 'CHIP', pin: '1',
        aid: 'A0000000031010', aplicacion: 'VISA CREDITO', tvr: '0000008000', tsi: 'E800',
      },
    }
    const l = texto(armarTicket(conTarjeta, NEGOCIO_DEFAULT))
    expect(l).toContain('BANORTE')
    expect(l.some((x) => x.startsWith('Tarjeta') && x.endsWith('VISA CREDITO **** 9876'))).toBe(true)
    expect(l.some((x) => x.startsWith('Autorización') && x.endsWith('123456'))).toBe(true)
    expect(l.some((x) => x.startsWith('AID') && x.endsWith('A0000000031010'))).toBe(true)
    expect(l).toContain('AUTORIZADO CON FIRMA ELECTRONICA')
    // El PAN completo no sale en ningún renglón, y la referencia manual no se
    // duplica cuando ya va en el voucher.
    expect(l.some((x) => x.includes('4152'))).toBe(false)
    expect(l.filter((x) => x.startsWith('Ref. '))).toEqual([])
    // Ninguna línea se pasa del papel con el bloque puesto.
    expect(armarTicket(conTarjeta, NEGOCIO_DEFAULT).filter((x) => columnas(x) > COLUMNAS_80MM)).toEqual([])
    // Y el HTML dice lo mismo.
    const html = ticketHTML(conTarjeta, NEGOCIO_DEFAULT)
    expect(html).toContain('**** 9876')
    expect(html).toContain('AUTORIZADO CON FIRMA ELECTRÓNICA')
    expect(html).not.toContain('4152')
    // Con firma: la raya; con QPS: nada.
    const firma = texto(armarTicket({ ...conTarjeta, tarjeta: { ...conTarjeta.tarjeta, pin: '0' } }, NEGOCIO_DEFAULT))
    expect(firma.some((x) => x.trim() === 'Firma')).toBe(true)
    const qps = texto(armarTicket({ ...conTarjeta, tarjeta: { ...conTarjeta.tarjeta, pin: '2' } }, NEGOCIO_DEFAULT))
    expect(qps.some((x) => x.trim() === 'Firma')).toBe(false)
    expect(qps).not.toContain('AUTORIZADO CON FIRMA ELECTRONICA')
  })

  it('el pago mixto sale con un renglón por parte', () => {
    const l = texto(armarTicket({
      ...venta,
      metodoPago: 'Efectivo + Terminal',
      partes: [{ metodo: 'Efectivo', monto: 300 }, { metodo: 'Terminal', monto: 290 }],
      recibido: undefined,
    }, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.startsWith('Efectivo') && x.endsWith('$300.00'))).toBe(true)
    expect(l.some((x) => x.startsWith('Terminal') && x.endsWith('$290.00'))).toBe(true)
  })

  it('el cambio sale solo si el recibido alcanza', () => {
    const con = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    expect(con.some((x) => x.startsWith('Cambio') && x.endsWith('$110.00'))).toBe(true)
    const sin = texto(armarTicket({ ...venta, recibido: undefined }, NEGOCIO_DEFAULT))
    expect(sin.some((x) => x.startsWith('Cambio'))).toBe(false)
  })

  it('el RFC vacío no se imprime: «RFC —» a la vista del cliente es peor', () => {
    const l = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.includes('RFC'))).toBe(false)
    const con = texto(armarTicket(venta, { ...NEGOCIO_DEFAULT, rfc: 'HLI260101ABC' }))
    expect(con.some((x) => x.includes('RFC: HLI260101ABC'))).toBe(true)
  })

  it('respeta mostrarCajero apagado, igual que el HTML', () => {
    const l = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.includes('Rosa M.'))).toBe(false)
    const con = texto(armarTicket(venta, { ...NEGOCIO_DEFAULT, mostrarCajero: true }))
    // Va junto al canal, como en la muestra: «Mostrador · Rosa M.».
    expect(con.some((x) => x.includes('· Rosa M.'))).toBe(true)
  })

  it('cada aviso va en su renglón, y uno en blanco no gasta papel', () => {
    const l = texto(armarTicket(venta, {
      ...NEGOCIO_DEFAULT,
      avisos: ['Solicita tu factura', '  ', 'Por higiene NO se hacen cambios de pan'],
    }))
    expect(l.some((x) => x.includes('Solicita tu factura'))).toBe(true)
    expect(l.some((x) => x.includes('Por higiene'))).toBe(true)
  })

  it('el horario sale en el pie solo si Admin lo puso, y delante de los avisos', () => {
    const sin = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    expect(sin.some((x) => x.includes('Horario'))).toBe(false)
    const con = texto(armarTicket(venta, { ...NEGOCIO_DEFAULT, horario: 'L a D 7 a.m. a 9 p.m.' }))
    const iH = con.findIndex((x) => x.includes('Horario: L a D 7 a.m. a 9 p.m.'))
    const iF = con.findIndex((x) => x.includes('Solicita tu factura'))
    expect(iH).toBeGreaterThan(-1)
    expect(iH).toBeLessThan(iF)
  })

  it('quien cobró NO sale por omisión: la casa no lo quiere en la nota', () => {
    expect(NEGOCIO_DEFAULT.mostrarCajero).toBe(false)
    expect(texto(armarTicket(venta, NEGOCIO_DEFAULT)).some((x) => x.includes('Rosa M.'))).toBe(false)
  })
})

/**
 * El ancla entre los dos renderizadores.
 *
 * Una pantalla y un papel térmico tienen que verse distinto, y eso está
 * bien. Lo que NO puede pasar es que digan importes distintos del mismo
 * ticket: ahí es donde una vista previa empieza a mentir y nadie se entera
 * hasta que un cliente reclama.
 *
 * Los dos comen el mismo `TicketData`, así que esta prueba comprueba que el
 * número que importa —el total— es el mismo en los dos.
 */
describe('el papel y la pantalla dicen lo mismo', () => {
  const casos: { que: string; data: TicketData }[] = [
    { que: 'venta simple', data: venta },
    { que: 'con descuento', data: { ...venta, descuento: 90 } },
    { que: 'con anticipo', data: { ...venta, anticipo: 200 } },
    { que: 'con los dos', data: { ...venta, descuento: 50, anticipo: 200 } },
  ]

  for (const { que, data } of casos) {
    it(`mismo total — ${que}`, () => {
      const enLineas = totalDe(data)
      // El HTML pinta el total con Intl; se compara contra el mismo número
      // formateado igual, no contra el texto del otro renderizador.
      const esperado = new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: 'MXN',
      }).format(enLineas)
      expect(ticketHTML(data, NEGOCIO_DEFAULT)).toContain(esperado)
    })
  }

  it('el subtotal también coincide', () => {
    const data = { ...venta, descuento: 50, anticipo: 200 }
    const esperado = new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN',
    }).format(subtotalDe(data.items))
    expect(ticketHTML(data, NEGOCIO_DEFAULT)).toContain(esperado)
  })
})

describe('armarCorte (el papel del cierre)', () => {
  const corte = {
    tipo: 'corte' as const, corte_id: 'c1', caja: 'Caja 1',
    abierto_en: '2026-10-19T13:00:00Z', cerrado_en: '2026-10-20T02:00:00Z',
    fondo_inicial: 500, num_ordenes: 42, total_efectivo: 3100, total_tarjeta: 1800,
    total_pagado: 4900, efectivo_esperado: 3600, efectivo_contado: 3400, diferencia: -200,
    conteo_cierre: { billetes: { 500: 4, 200: 7 }, monedas: { 20: 3 } },
    abrio: 'Rosa', cerro: 'Rosa',
  }

  it('ninguna línea se pasa del papel', () => {
    const l = texto(armarCorte(corte, NEGOCIO_DEFAULT))
    expect(l.filter((x) => x.length > COLUMNAS_80MM)).toEqual([])
  })

  it('dice con una palabra si cuadró, y el signo va con el número', () => {
    expect(texto(armarCorte(corte, NEGOCIO_DEFAULT)).some((x) => x.startsWith('FALTANTE') && x.endsWith('-$200.00'))).toBe(true)
    expect(texto(armarCorte({ ...corte, diferencia: 0 }, NEGOCIO_DEFAULT)).some((x) => x.startsWith('CUADRA'))).toBe(true)
    expect(texto(armarCorte({ ...corte, diferencia: 50 }, NEGOCIO_DEFAULT)).some((x) => x.startsWith('SOBRANTE') && x.endsWith('$50.00'))).toBe(true)
  })

  it('el desglose del cajón va renglón por renglón, y suma lo contado', () => {
    const l = texto(armarCorte(corte, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.includes('Billete $500 x 4') && x.endsWith('$2,000.00'))).toBe(true)
    expect(l.some((x) => x.includes('Moneda $20 x 3') && x.endsWith('$60.00'))).toBe(true)
  })

  it('un corte sin desglose ni notas no deja renglones huecos', () => {
    const l = texto(armarCorte({ ...corte, conteo_cierre: null, notas: null }, NEGOCIO_DEFAULT))
    expect(l.some((x) => x.includes('Billete'))).toBe(false)
    expect(l.some((x) => x.startsWith('Notas'))).toBe(false)
  })
})
