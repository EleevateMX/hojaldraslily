/**
 * El ticket que se le entrega al cliente, para MIRARLO antes de imprimirlo.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/ticket.html
 *
 * Los dos casos limite que definio el diseno: una venta de mostrador en
 * efectivo, y un encargo con pago mixto, descuento y una nota larga. Si el
 * ticket aguanta esos dos, aguanta el dia.
 *
 * OJO CON LAS FUENTES. El ticket de verdad las pide a Google, igual que el
 * resto del sistema, pero el Chromium de este contenedor no alcanza
 * fonts.gstatic.com (no valida el certificado del proxy) y cae a las de
 * respaldo -- con lo que el logotipo pierde la Yellowtail y no se puede
 * revisar lo que importa: que la cola de la «y» no toque la linea de abajo.
 *
 * Para verlo de verdad hay que bajarlas una vez y servirlas en local:
 *
 *     cd apps/pos && mkdir -p public/fuentes
 *     curl -sS -A "Mozilla/5.0 ... Chrome/120" \
 *       "https://fonts.googleapis.com/css2?family=Yellowtail&family=Jost:wght@300;400;500&family=DM+Mono:wght@400;500&family=Karla:wght@400;700&display=swap" \
 *       > mirar/fuentes/origen.css
 *     # bajar cada woff2 del css y reescribir las url a /fuentes/...
 *     # el resultado va como <style> en ticket.html, NO como <link>: Vite
 *     # convierte los .css en modulos JS y un <link> recibiria JavaScript.
 *
 * Esa carpeta esta en .gitignore: son unos 300 KB que no tienen por que vivir
 * en el repo.
 */
import { createRoot } from 'react-dom/client'
import { ticketHTML, imprimirTicket, NEGOCIO_DEFAULT, type TicketData } from '../../../packages/ui/src/ticket'

const mostrador: TicketData = {
  folio: 1042,
  fecha: new Date('2026-10-05T14:26:00'),
  cajero: 'Rosa M.',
  canal: 'Caja',
  items: [
    { cantidad: 1, nombre: 'Jamón y Queso · Chica · 24 cuadros', precioUnitario: 310 },
    { cantidad: 2, nombre: 'Pastelitos de Lomo · 5 pzas', precioUnitario: 140 },
    {
      cantidad: 1,
      nombre: 'Hojaldra de Corazón · Pasta de Guayaba, Philadelphia y Nuez',
      precioUnitario: 440,
      personalizacion: 'Sin azúcar glass encima',
    },
  ],
  metodoPago: 'Efectivo',
  recibido: 1200,
}

const encargo: TicketData = {
  folio: 1043,
  fecha: new Date('2026-10-05T14:31:00'),
  cajero: 'Rosa M.',
  canal: 'Kiosko autoservicio',
  clienteNombre: 'María Fernanda Cáceres Pech',
  items: [
    { cantidad: 1, nombre: 'Jamón y Queso · Grande · 48 cuadros', precioUnitario: 540 },
    {
      cantidad: 1,
      nombre: 'Hojaldra de Corazón · Pasta de Guayaba, Philadelphia y Nuez',
      precioUnitario: 440,
      personalizacion: 'Entrega sábado 10:00. Escribir «Felicidades Abue»',
    },
    { cantidad: 13, nombre: 'Pastelitos solo queso · 1 pza', precioUnitario: 26 },
  ],
  descuento: 38,
  metodoPago: 'Efectivo + Terminal',
  partes: [
    { metodo: 'Efectivo', monto: 600 },
    { metodo: 'Terminal', monto: 680 },
  ],
  referenciaPago: 'CLIP-884213',
}

const Muestra = ({ t, rotulo }: { t: TicketData; rotulo: string }) => (
  <div>
    <p style={{
      fontFamily: 'Jost, sans-serif', fontSize: 11, letterSpacing: '.22em',
      textTransform: 'uppercase', color: '#C4463C', margin: '0 0 10px',
    }}>{rotulo}</p>
    <div style={{ width: '80mm', background: '#fff', boxShadow: '0 6px 24px rgba(46,36,32,.14)' }}
      dangerouslySetInnerHTML={{ __html: ticketHTML(t, NEGOCIO_DEFAULT) }} />
  </div>
)

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 28, background: '#F8EDD5', minHeight: '100vh', fontFamily: 'sans-serif' }}>
    <p style={{ margin: '0 0 18px' }}>
      <button onClick={() => imprimirTicket(mostrador)} style={{ padding: '8px 16px', fontSize: 14 }}>
        Imprimir el de mostrador
      </button>
    </p>
    <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Muestra t={mostrador} rotulo="Venta en mostrador · Efectivo" />
      <Muestra t={encargo} rotulo="Encargo · Pago mixto" />
    </div>
  </div>,
)
