/**
 * El ticket que se le entrega al cliente, para MIRARLO antes de imprimirlo.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/ticket.html
 *
 * Se pinta a 80 mm de ancho, que es el papel de la impresora de la caja, con
 * una venta de las que de verdad pasan: varios renglones, un descuento, pago
 * mixto y cambio.
 */
import { createRoot } from 'react-dom/client'
import { ticketHTML, imprimirTicket, NEGOCIO_DEFAULT, type TicketData } from '../../../packages/ui/src/ticket'

const venta: TicketData = {
  folio: 1042,
  fecha: new Date('2026-10-05T13:24:00'),
  cajero: 'Lupita',
  canal: 'Caja',
  items: [
    { cantidad: 1, nombre: 'Jamón y Queso · Chica · 24 cuadros', precioUnitario: 310 },
    { cantidad: 2, nombre: 'Pan de Muerto Tradicional · Chica', precioUnitario: 80 },
    { cantidad: 3, nombre: 'Pastelitos solo queso · 1 pza', precioUnitario: 26 },
    { cantidad: 1, nombre: 'Pastelitos de Lomo · 5 pzas', precioUnitario: 140 },
  ],
  descuento: 50,
  metodoPago: 'Efectivo + Terminal',
  partes: [
    { metodo: 'Efectivo', monto: 400 },
    { metodo: 'Terminal', monto: 238 },
  ],
  referenciaPago: 'CLIP-884213',
  recibido: 400,
  clienteNombre: 'Doña Carmen',
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 24, background: '#e9e4d8', minHeight: '100vh', fontFamily: 'sans-serif' }}>
    <p style={{ marginBottom: 12 }}>
      <button id="imprimir" onClick={() => imprimirTicket(venta)}
        style={{ padding: '8px 16px', fontSize: 14 }}>
        Imprimir
      </button>
      <span style={{ marginLeft: 12, fontSize: 13, color: '#555' }}>
        80 mm — así sale el papel
      </span>
    </p>
    <div style={{ width: '80mm', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.2)' }}
      dangerouslySetInnerHTML={{ __html: ticketHTML(venta, NEGOCIO_DEFAULT) }} />
  </div>,
)
