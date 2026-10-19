import { describe, it, expect } from 'vitest'
import {
  armarTicket,
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

const texto = (l: LineaTicket[]) => l.filter((x): x is string => typeof x === 'string')

describe('armarTicket (líneas de la térmica)', () => {
  it('ninguna línea se pasa del ancho del papel', () => {
    // Es la única regla que no se puede romper: lo que se pasa de 48, la
    // impresora lo tira a la siguiente línea donde le toca y el ticket se
    // desalinea entero.
    const l = texto(armarTicket(venta, NEGOCIO_DEFAULT))
    const largas = l.filter((x) => x.length > COLUMNAS_80MM)
    expect(largas).toEqual([])
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
    expect(con.some((x) => x.includes('Caja: Rosa M.'))).toBe(true)
  })

  it('cada aviso va en su renglón, y uno en blanco no gasta papel', () => {
    const l = texto(armarTicket(venta, {
      ...NEGOCIO_DEFAULT,
      avisos: ['Solicita tu factura', '  ', 'Por higiene NO se hacen cambios de pan'],
    }))
    expect(l.some((x) => x.includes('Solicita tu factura'))).toBe(true)
    expect(l.some((x) => x.includes('Por higiene'))).toBe(true)
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
