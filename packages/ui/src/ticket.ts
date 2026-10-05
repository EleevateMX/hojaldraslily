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
  /** Una línea por renglón: se parte por salto, no por ancho. */
  direccion?: string
  telefono?: string
  /** Vacío = no se imprime. Solo hace falta si van a facturar. */
  rfc?: string
  /** Primera línea del pie, en Jost: el agradecimiento. */
  leyenda?: string
  /** Segunda línea, más chica: aviso de encargos, redes, horario. */
  pieSecundario?: string
  /** `false` imprime el nombre en versalitas en vez del logotipo. */
  mostrarLogo?: boolean
  /** `false` esconde quién cobró. Sirve para aclaraciones, así que viene encendido. */
  mostrarCajero?: boolean
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
  /**
   * El desglose cuando se cobró con dos formas de pago.
   *
   * Va como DATOS y no como texto ya armado («Efectivo $400 + Terminal
   * $238»), porque esa línea sola no se lee: en el papel quedaba el desglose
   * a la izquierda y el total a la derecha, y el cliente tiene que poder
   * comprobar que las dos partes suman lo que pagó. Con datos se pinta un
   * renglón por parte, cada uno con su importe.
   */
  partes?: { metodo: string; monto: number }[]
  referenciaPago?: string | null // voucher/autorización Clip
  recibido?: number // efectivo entregado (para el cambio)
  // Lealtad
  /** A nombre de quién va el pedido. No es una ficha de cliente: es lo que
   *  se grita en el mostrador y lo que lleva la etiqueta. */
  clienteNombre?: string | null
}

/** Datos del negocio por defecto — REEMPLAZAR con los reales de Hojaldras Lily. */
export const NEGOCIO_DEFAULT: TicketNegocio = {
  nombre: 'Hojaldras Lily',
  sucursal: 'Miguel Alemán',
  direccion: 'Calle 29-A #183 por Av. 22\nCol. Miguel Alemán, Mérida, Yuc.',
  telefono: '999 926 71 51',
  // Vacío, NO un guion: `'—'` es texto, así que la plantilla lo daba por
  // bueno e imprimía «RFC —» en el papel, a la vista del cliente. Vacío no se
  // imprime nada, que es lo honesto mientras no esté el dato.
  rfc: '',
  // Decía «Consérvelo en refrigeración», que venía de la heladería del motor
  // original: una hojaldra no se refrigera. Es el mismo caso que el bloque de
  // los puntos que ya se quitó del pie del ticket.
  leyenda: '¡Gracias por su compra!',
  pieSecundario: 'Encarga con 2 días de anticipación · 999 926 71 51',
  mostrarLogo: true,
  mostrarCajero: true,
}

const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/**
 * Las tres tipografías de la marca, pedidas DENTRO del ticket.
 *
 * El ticket se imprime en un marco aislado: no hereda ni una línea del CSS de
 * la caja, así que si no las pide aquí sale todo en la monoespaciada del
 * sistema y el logotipo pierde la Yellowtail. Es el mismo `<link>` que ya usan
 * `packages/brand` y `apps/web`, así que el navegador lo sirve de su caché y
 * no hay una segunda descarga por venta.
 *
 * Si la tienda se queda sin internet, cae a las de respaldo y el ticket sale
 * igual: más feo, pero sale. Eso es deliberado — un ticket sin logotipo es
 * mejor que un cliente esperando a que cargue una fuente.
 */
const FUENTES_MARCA =
  'https://fonts.googleapis.com/css2?family=Yellowtail&family=Jost:wght@300;400;500&family=DM+Mono:wght@400;500&family=Karla:wght@400;700&display=swap'

/**
 * Construye el HTML del ticket (80 mm de papel, 72 mm útiles).
 *
 * El diseño es el que definió la casa, y sus decisiones no son decorativas:
 *
 * - **El folio va en blanco sobre negro.** Es lo único del ticket que gasta
 *   calor de más, y se lo gana: es lo que se canta en el mostrador y lo que
 *   se busca en una aclaración.
 * - **El total manda**, con una regla gruesa encima y a 24 px. Es lo primero
 *   que el cliente busca.
 * - **El nombre del encargo va en su propio recuadro.** En una panadería casi
 *   todo lo grande es encargo, y ese nombre decide a quién se le entrega.
 * - Nada de color: la térmica solo quema negro. La jerarquía la cargan el
 *   tamaño, el peso y las reglas.
 */
export function ticketHTML(data: TicketData, negocio: TicketNegocio = NEGOCIO_DEFAULT): string {
  const fecha = typeof data.fecha === 'string' ? new Date(data.fecha) : data.fecha
  const fechaTxt = fecha.toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const horaTxt = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  const subtotal = data.items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0)
  const descuento = data.descuento ?? 0
  const total = Math.max(0, subtotal - descuento)
  const cambio = data.recibido != null && data.recibido >= total ? data.recibido - total : null

  // Quién cobró va pegado al canal, y solo si la casa lo quiere ver.
  const canalLinea = [data.canal, negocio.mostrarCajero === false ? null : data.cajero]
    .filter(Boolean)
    .join(' · ')

  const filas = data.items
    .map((i) => {
      const importe = i.cantidad * i.precioUnitario
      // La nota ocupa las dos columnas de la derecha y lleva una barra: así se
      // lee como lo que es, una aclaración DE ese renglón y no otro producto.
      const nota = i.personalizacion
        ? `<div></div><div style="grid-column:2 / 4;font-size:9px;line-height:1.35;margin-top:1px;padding-left:8px;border-left:1px solid #000;overflow-wrap:anywhere">${esc(i.personalizacion)}</div>`
        : ''
      return `<div class="ln">
        <div style="font-weight:500">${i.cantidad}</div>
        <div style="overflow-wrap:anywhere">${esc(i.nombre)}</div>
        <div style="text-align:right">${money(importe)}</div>
        ${nota}
      </div>`
    })
    .join('')

  // Una forma de pago o dos: el mismo bloque. Con dos, cada una con su importe,
  // porque el cliente tiene que poder comprobar que suman lo que pagó.
  const pagos =
    data.partes && data.partes.length > 0
      ? data.partes
      : [{ metodo: data.metodoPago, monto: total }]

  const filasPago = pagos
    .map(
      (x) =>
        `<div>${esc(x.metodo)}</div><div style="text-align:right">${money(x.monto)}</div>`,
    )
    .join('')

  const direccion = (negocio.direccion ?? '')
    .split('\n')
    .filter(Boolean)
    .map((t) => esc(t))
    .join('<br />')

  const logo =
    negocio.mostrarLogo === false
      ? `<div style="font-family:Jost,sans-serif;font-weight:500;font-size:14px;letter-spacing:.24em;text-transform:uppercase;line-height:1">${esc(negocio.nombre)}</div>`
      : `<div style="display:flex;justify-content:center;align-items:baseline;line-height:1">
           <span style="font-family:Jost,sans-serif;font-weight:300;font-size:17px">Hojaldras</span><span style="font-family:Yellowtail,cursive;font-size:30px;margin-left:-5px;transform:translateY(4px);display:inline-block">Lily</span>
         </div>`
  // Ojo con el aire de abajo: la cola de la «y» de Yellowtail baja fuera de su
  // caja y, con los 6 px del diseño, tocaba la línea de la sucursal. En
  // pantalla se perdona; en térmica a 203 dpi los dos trazos se funden y sale
  // una mancha. Por eso ese margen es de 10 px y no de 6.

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Ticket ${esc(data.folio)}</title>
<link rel="stylesheet" href="${FUENTES_MARCA}">
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html,body { margin: 0; padding: 0; }
  body {
    width: 80mm; color: #000; background: #fff;
    font-family: "DM Mono", ui-monospace, "Courier New", monospace;
    font-size: 11px; line-height: 1.35;
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .t { padding: 5mm 4mm 7mm; }
  .center { text-align: center; }
  .regla { border-top: 1px solid #000; }
  .mini { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; }
  /* Cantidad · producto · importe. El importe no se parte nunca. */
  .ln { display: grid; grid-template-columns: 22px minmax(0,1fr) 58px; gap: 0 4px; padding: 3px 0; align-items: start; }
  .cuentas { display: grid; grid-template-columns: minmax(0,1fr) 70px; gap: 3px 4px; font-size: 10px; }
</style></head><body onload="window.print()">
<div class="t">

  <div class="center">
    ${logo}
    ${negocio.sucursal ? `<div style="font-size:10px;margin-top:10px">Sucursal ${esc(negocio.sucursal)}</div>` : ''}
    <div style="font-size:9px;line-height:1.4;margin-top:2px">
      ${direccion}${direccion && negocio.telefono ? '<br />' : ''}${negocio.telefono ? `Tel. ${esc(negocio.telefono)}` : ''}
    </div>
    ${negocio.rfc ? `<div style="font-size:9px;margin-top:2px">RFC ${esc(negocio.rfc)}</div>` : ''}
  </div>

  <div class="regla" style="margin:8px 0 6px"></div>

  <div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:end">
    <div>
      <div class="mini" style="margin-bottom:2px">Folio</div>
      <div style="display:inline-block;background:#000;color:#fff;font-weight:500;font-size:22px;line-height:1;padding:4px 7px 3px">#${esc(data.folio)}</div>
    </div>
    <div style="text-align:right;font-size:9.5px;line-height:1.45">
      <div>${esc(fechaTxt)}</div>
      <div>${esc(horaTxt)}</div>
      ${canalLinea ? `<div>${esc(canalLinea)}</div>` : ''}
    </div>
  </div>

  ${
    data.clienteNombre
      ? `<div style="margin-top:8px;border:1px solid #000;padding:5px 7px 6px">
           <div class="mini">Encargo para</div>
           <div style="font-family:Karla,sans-serif;font-weight:700;font-size:15px;line-height:1.15;margin-top:2px;overflow-wrap:anywhere">${esc(data.clienteNombre)}</div>
         </div>`
      : ''
  }

  <div class="regla" style="margin:8px 0 5px"></div>

  ${filas}

  <div class="regla" style="margin:5px 0 6px"></div>

  <div class="cuentas">
    <div>Subtotal</div><div style="text-align:right">${money(subtotal)}</div>
    ${descuento ? `<div>Descuento</div><div style="text-align:right">-${money(descuento)}</div>` : ''}
  </div>

  <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;border-top:2px solid #000;margin-top:6px;padding-top:5px">
    <div style="font-weight:500;font-size:12px;letter-spacing:.08em">TOTAL</div>
    <div style="font-weight:500;font-size:24px;line-height:1">${money(total)}</div>
  </div>

  <div class="cuentas" style="margin-top:8px">
    ${filasPago}
    ${data.referenciaPago ? `<div style="grid-column:1 / 3;font-size:9px;margin-top:-2px">Ref. ${esc(data.referenciaPago)}</div>` : ''}
    ${data.recibido != null ? `<div>Recibido</div><div style="text-align:right">${money(data.recibido)}</div>` : ''}
    ${cambio != null ? `<div style="font-weight:500">Cambio</div><div style="text-align:right;font-weight:500">${money(cambio)}</div>` : ''}
  </div>

  <div class="regla" style="margin:8px 0 7px"></div>

  <div class="center">
    ${negocio.leyenda ? `<div style="font-family:Jost,sans-serif;font-weight:500;font-size:11px">${esc(negocio.leyenda)}</div>` : ''}
    ${negocio.pieSecundario ? `<div style="font-size:9px;line-height:1.4;margin-top:3px">${esc(negocio.pieSecundario)}</div>` : ''}
  </div>

</div>
</body></html>`
}

/**
 * Imprime el ticket desde un marco oculto en la misma pestaña.
 *
 * **Antes abría una ventana emergente, y eso fallaba en silencio.** Si Chrome
 * bloqueaba el `window.open` —que es lo que hace por omisión en cuanto la
 * impresión no nace de un clic directo— la venta se cobraba igual y el ticket
 * no salía: nadie se enteraba hasta que el cliente lo pedía. Un `<iframe>` no
 * se puede bloquear.
 *
 * Y de paso habilita lo que la caja de verdad necesita: con Chrome abierto en
 * `--kiosk-printing` esto imprime **sin el diálogo** de «Imprimir», que son
 * dos clics menos por cliente. Sin esa bandera sale el diálogo, pero sale.
 *
 * El marco se retira solo: al terminar de imprimir, y con una red de
 * seguridad por si `afterprint` no llega (en impresión silenciosa a veces no
 * dispara). Quitarlo antes de tiempo cancela la impresión, así que el margen
 * es generoso: un marco de 0×0 invisible no le estorba a nadie.
 */
export function imprimirTicket(data: TicketData, negocio: TicketNegocio = NEGOCIO_DEFAULT): boolean {
  if (typeof document === 'undefined') return false

  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  marco.setAttribute('title', 'Ticket')
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(marco)

  const doc = marco.contentWindow?.document
  if (!doc) {
    marco.remove()
    return false
  }

  const quitar = () => marco.parentNode && marco.remove()
  marco.contentWindow?.addEventListener('afterprint', () => setTimeout(quitar, 500))
  setTimeout(quitar, 60_000)

  // El `<body onload="window.print()">` de la plantilla corre DENTRO del
  // marco, así que imprime el marco y no la caja que quedó atrás.
  doc.open()
  doc.write(ticketHTML(data, negocio))
  doc.close()
  return true
}
