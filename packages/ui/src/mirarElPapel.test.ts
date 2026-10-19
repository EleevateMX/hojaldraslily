/**
 * El ticket de la térmica, para MIRARLO.
 *
 *     pnpm --filter @lily/ui exec vitest run src/mirarElPapel.test.ts
 *
 * Un papel de 48 columnas no se revisa leyendo el código: se revisa viéndolo
 * con los casos que lo rompen. Seis defectos salieron de abrir este archivo
 * la primera vez y ninguno se veía en el fuente —el nombre del pan partido a
 * media sílaba («Pasta de Guay / aba,»), el total sin separador de miles
 * mientras el HTML sí lo ponía, dos reglas pegadas, el teléfono del pie
 * cortado en «999 926 71 / 51», y una línea de puro relleno tras el folio.
 *
 * Imprime y además comprueba lo único que no se puede romper: que ninguna
 * línea se pase del papel. Lo que se pasa de 48, la impresora lo tira a la
 * siguiente línea donde le toca y desalinea el ticket entero.
 */
import { describe, it, expect } from 'vitest'
import { armarTicket, COLUMNAS_80MM } from './ticketLineas'
import { NEGOCIO_DEFAULT, type TicketData } from './ticket'

const casos: [string, TicketData][] = [
  ['Venta de mostrador, efectivo', {
    folio: 1042, fecha: new Date('2026-10-19T20:26:00Z'), cajero: 'Rosa M.', canal: 'Caja',
    items: [
      { cantidad: 1, nombre: 'Jamón y Queso · Chica · 24 cuadros', precioUnitario: 310 },
      { cantidad: 2, nombre: 'Pastelitos de Lomo · 5 pzas', precioUnitario: 140 },
      { cantidad: 1, nombre: 'Hojaldra de Corazón · Pasta de Guayaba, Philadelphia y Nuez',
        precioUnitario: 440, personalizacion: 'Sin azúcar glass encima' },
    ],
    metodoPago: 'Efectivo', recibido: 1200,
  }],
  ['Entrega de encargo con anticipo, pago mixto', {
    folio: 1044, fecha: new Date('2026-10-19T20:44:00Z'), canal: 'Caja',
    clienteNombre: 'María Fernanda Cáceres Pech (encargo #1043)',
    items: [
      { cantidad: 1, nombre: 'Jamón y Queso · Grande · 48 cuadros', precioUnitario: 540 },
      { cantidad: 2, nombre: 'Galletas de Manteca Dulces', precioUnitario: 95 },
    ],
    anticipo: 200, metodoPago: 'Efectivo + Terminal',
    partes: [{ metodo: 'Efectivo', monto: 300 }, { metodo: 'Terminal', monto: 230 }],
    referenciaPago: 'CLIP-884213',
  }],
]

describe('mirar el papel', () => {
  for (const [rotulo, data] of casos) {
    it(rotulo, () => {
      const lineas = armarTicket(data, NEGOCIO_DEFAULT)
      const regla = '·'.repeat(COLUMNAS_80MM)
      const papel = lineas.map((l) => (typeof l === 'string' ? l : '[QR]'))
      console.log(`\n${rotulo}\n${regla}  <- 48 columnas\n${papel.join('\n')}\n${regla}`)
      expect(papel.filter((l) => l.length > COLUMNAS_80MM)).toEqual([])
    })
  }
})
