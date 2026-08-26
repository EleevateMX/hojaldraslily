/**
 * Plantilla de ticket de venta (impresión térmica 80 mm vía el diálogo del
 * navegador). Framework-agnóstico: genera HTML y lo manda a imprimir.
 *
 * El corte ESC/POS automático (sin diálogo) es una fase posterior; por ahora
 * esto sirve para caja y kiosko con cualquier impresora térmica USB.
 *
 * NOTA: los datos del negocio (nombre fiscal, dirección, RFC, etc.) son
 * PLACEHOLDER — se llenan después con la info real de Hojaldras Lily.
 */

export interface TicketNegocio {
  nombre: string
  sucursal?: string
  direccion?: string
  telefono?: string
  rfc?: string
  leyenda?: string // pie: agradecimiento / redes / aviso
}

export interface TicketItem {
  cantidad: number
  nombre: string
  precioUnitario: number
  personalizacion?: string | null
}

export interface TicketData {
  folio: number | string
  fecha: Date | string
  cajero?: string
  canal?: string // 'Caja' | 'Kiosko autoservicio' | ...
  items: TicketItem[]
  descuento?: number
  metodoPago: string // 'Efectivo' | 'Tarjeta' | 'Clip' | ...
  referenciaPago?: string | null // voucher/autorización Clip
  recibido?: number // efectivo entregado (para el cambio)
  // Lealtad
  clienteNombre?: string | null
  mancuernasGanadas?: number
  mancuernasSaldo?: number
  codigoRewards?: string | null // p. ej. SHK-xxxx (para reimprimir su QR)
}

/** Datos del negocio por defecto — REEMPLAZAR con los reales de Hojaldras Lily. */
export const NEGOCIO_DEFAULT: TicketNegocio = {
  nombre: 'Hojaldras Lily',
  sucursal: 'Miguel Alemán',
  direccion: 'Calle 29-A #183 por Av. 22, Col. Miguel Alemán, Mérida, Yuc.',
  telefono: '999 926 71 51',
  rfc: '—', // TODO: RFC real
  leyenda: 'Gracias por su compra. Consérvelo en refrigeración.',
}

const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Construye el HTML del ticket (80 mm). Autónomo, sin dependencias. */
export function ticketHTML(data: TicketData, negocio: TicketNegocio = NEGOCIO_DEFAULT): string {
  const fecha = typeof data.fecha === 'string' ? new Date(data.fecha) : data.fecha
  const fechaTxt = fecha.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const subtotal = data.items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0)
  const descuento = data.descuento ?? 0
  const total = Math.max(0, subtotal - descuento)
  const cambio =
    data.recibido != null && data.recibido >= total ? data.recibido - total : null

  const filas = data.items
    .map((i) => {
      const importe = i.cantidad * i.precioUnitario
      const perso = i.personalizacion
        ? `<div class="perso">↳ ${esc(i.personalizacion)}</div>`
        : ''
      return `<tr>
        <td class="c">${i.cantidad}</td>
        <td class="n">${esc(i.nombre)}${perso}</td>
        <td class="p">${money(importe)}</td>
      </tr>`
    })
    .join('')

  const lealtad =
    data.mancuernasGanadas || data.mancuernasSaldo || data.codigoRewards
      ? `<div class="sep"></div>
         <div class="loyal">
           <div class="loyal-t">SHAKE AHOLIC REWARDS</div>
           ${data.clienteNombre ? `<div>${esc(data.clienteNombre)}</div>` : ''}
           ${data.mancuernasGanadas != null ? `<div>Mancuernas ganadas: <b>+${data.mancuernasGanadas}</b></div>` : ''}
           ${data.mancuernasSaldo != null ? `<div>Saldo: <b>${data.mancuernasSaldo}</b> mancuernas</div>` : ''}
           ${data.codigoRewards ? `<div class="code">${esc(data.codigoRewards)}</div>` : ''}
         </div>`
      : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${esc(data.folio)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html,body { margin: 0; padding: 0; }
  body { width: 80mm; font-family: "DM Mono", ui-monospace, "Courier New", monospace; color: #000; }
  .t { padding: 6mm 4mm 8mm; font-size: 11px; line-height: 1.35; }
  .center { text-align: center; }
  .biz { font-weight: 700; font-size: 16px; letter-spacing: .5px; }
  .muted { color: #333; font-size: 10px; }
  .folio { font-size: 22px; font-weight: 700; margin: 6px 0 2px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  td.c { width: 8mm; }
  td.p { text-align: right; white-space: nowrap; }
  td.n { padding-right: 2mm; }
  .perso { font-size: 10px; color: #333; }
  .tot td { padding: 1px 0; }
  .tot .lbl { text-align: right; padding-right: 3mm; }
  .tot .big { font-size: 16px; font-weight: 700; }
  .loyal { text-align: center; font-size: 10px; }
  .loyal-t { font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
  .code { font-weight: 700; font-size: 13px; letter-spacing: 1px; margin-top: 2px; }
  .foot { text-align: center; font-size: 10px; margin-top: 8px; }
</style></head><body onload="window.print()">
<div class="t">
  <div class="center">
    <div class="biz">${esc(negocio.nombre)}</div>
    ${negocio.sucursal ? `<div class="muted">Sucursal ${esc(negocio.sucursal)}</div>` : ''}
    ${negocio.direccion ? `<div class="muted">${esc(negocio.direccion)}</div>` : ''}
    ${negocio.telefono ? `<div class="muted">Tel. ${esc(negocio.telefono)}</div>` : ''}
    ${negocio.rfc ? `<div class="muted">RFC ${esc(negocio.rfc)}</div>` : ''}
    <div class="folio">#${esc(data.folio)}</div>
    <div class="muted">${fechaTxt}</div>
    ${data.canal ? `<div class="muted">${esc(data.canal)}${data.cajero ? ' · ' + esc(data.cajero) : ''}</div>` : ''}
  </div>
  <div class="sep"></div>
  <table>${filas}</table>
  <div class="sep"></div>
  <table class="tot">
    <tr><td class="lbl">Subtotal</td><td class="p">${money(subtotal)}</td></tr>
    ${descuento ? `<tr><td class="lbl">Descuento</td><td class="p">-${money(descuento)}</td></tr>` : ''}
    <tr><td class="lbl big">TOTAL</td><td class="p big">${money(total)}</td></tr>
    <tr><td class="lbl">${esc(data.metodoPago)}</td><td class="p">${money(total)}</td></tr>
    ${data.recibido != null ? `<tr><td class="lbl">Recibido</td><td class="p">${money(data.recibido)}</td></tr>` : ''}
    ${cambio != null ? `<tr><td class="lbl">Cambio</td><td class="p">${money(cambio)}</td></tr>` : ''}
    ${data.referenciaPago ? `<tr><td class="lbl">Ref.</td><td class="p">${esc(data.referenciaPago)}</td></tr>` : ''}
  </table>
  ${lealtad}
  <div class="foot">${esc(negocio.leyenda ?? '')}</div>
</div>
</body></html>`
}

/**
 * Abre el ticket en una ventana y dispara la impresión del navegador.
 * Devuelve false si el navegador bloqueó la ventana emergente.
 */
export function imprimirTicket(data: TicketData, negocio: TicketNegocio = NEGOCIO_DEFAULT): boolean {
  const w = window.open('', '_blank', 'width=380,height=640')
  if (!w) return false
  w.document.write(ticketHTML(data, negocio))
  w.document.close()
  return true
}
