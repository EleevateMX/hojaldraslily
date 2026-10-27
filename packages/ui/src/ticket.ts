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

import { NEGOCIO_DEFAULT } from './ticketTipos'
import { LOGO_TICKET } from './logoTicket'
import type { TicketNegocio, TicketItem, TicketData, CorteData } from './ticketTipos'
import { lineasDeAvisos, parejasDeVoucher, validacionDeVoucher } from './ticketLineas'

export type { TicketNegocio, TicketItem, TicketData, CorteData } from './ticketTipos'
export { NEGOCIO_DEFAULT } from './ticketTipos'

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
export function ticketHTML(data: TicketData, negocio: TicketNegocio = NEGOCIO_DEFAULT, copias = 1): string {
  const fecha = typeof data.fecha === 'string' ? new Date(data.fecha) : data.fecha
  // La zona va fija en Mérida, no la del navegador.
  //
  // La fecha del negocio no es la de quien mira: Admin se abre desde el
  // teléfono, y una reimpresión hecha en otra zona salía con otra hora que la
  // original. Y sobre todo, el agente de tickets imprime desde la PC de la
  // tienda con Mérida fija: sin esto, el papel y la pantalla darían horas
  // distintas del mismo cobro.
  const fechaTxt = fecha.toLocaleDateString('es-MX', {
    timeZone: 'America/Merida',
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const horaTxt = fecha.toLocaleTimeString('es-MX', {
    timeZone: 'America/Merida', hour: '2-digit', minute: '2-digit',
  })

  const subtotal = data.items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0)
  const descuento = data.descuento ?? 0
  const anticipo = data.anticipo ?? 0
  // El total del papel es lo que se paga HOY. Lo anticipado ya se pagó otro
  // día y en otro ticket.
  const total = Math.max(0, subtotal - descuento - anticipo)
  const cambio = data.recibido != null && data.recibido >= total ? data.recibido - total : null

  // Quién cobró va pegado al canal, y solo si la casa lo quiere ver.
  // Los avisos del pie, ya limpios: un renglón en blanco no gasta papel.
  const avisos = lineasDeAvisos(negocio)

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

  // El voucher de la terminal, si el cobro pasó por ella. Las parejas y la
  // validación salen de `ticketLineas`, para que el papel y esto digan lo
  // mismo (Anexo VII de Interredes).
  const voucher = data.tarjeta
    ? (() => {
        const parejas = parejasDeVoucher(data.tarjeta)
        const validacion = validacionDeVoucher(data.tarjeta.pin)
        return `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed #000;font-size:9px;line-height:1.4">
    <div style="text-align:center;font-weight:600;letter-spacing:.12em">BANORTE</div>
    <div class="cuentas" style="margin-top:3px">
      ${parejas.map(([k, v]) => `<div>${esc(k)}</div><div style="text-align:right">${esc(v)}</div>`).join('')}
    </div>
    ${
      validacion === 'nip'
        ? `<div style="text-align:center;margin-top:6px;font-weight:600">AUTORIZADO CON FIRMA ELECTRÓNICA</div>`
        : validacion === 'firma'
          ? `<div style="margin-top:18px;border-top:1px solid #000;text-align:center;padding-top:2px">Firma</div>`
          : ''
    }
  </div>`
      })()
    : ''

  const direccion = (negocio.direccion ?? '')
    .split('\n')
    .filter(Boolean)
    .map((t) => esc(t))
    .join('<br />')

  const logo =
    negocio.mostrarLogo === false
      ? `<div style="font-family:Jost,sans-serif;font-weight:500;font-size:14px;letter-spacing:.24em;text-transform:uppercase;line-height:1">${esc(negocio.nombre)}</div>`
      : `<img src="${LOGO_TICKET}" alt="${esc(negocio.nombre)}" style="width:210px;max-width:85%;height:auto;display:block;margin:0 auto" />`
  // El logotipo es la imagen real de la marca (negro sobre blanco, recortada al
  // trazo), incrustada como data URI para que imprima sin red. Antes se
  // recreaba con Jost + Yellowtail; una imagen sale igual en cualquier equipo y
  // no depende de que carguen las fuentes de Google. Con `mostrarLogo = false`
  // se cae al nombre en versalitas, como antes.

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
  /* La copia va en su propia página: con autocorte "por página" en el driver,
     la térmica corta entre el original y la copia y salen dos tickets. */
  .copia { page-break-before: always; }
  .sello { text-align:center; font-size:9px; letter-spacing:.3em; border:1px solid #000; padding:3px 2px; margin-bottom:6px; }
</style></head><body onload="window.print()">
${Array.from({ length: Math.max(1, Math.round(copias)) }, (_u, __i) => `<div class="t${__i > 0 ? ' copia' : ''}">
  ${__i > 0 ? '<div class="sello">COPIA</div>' : ''}

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
    ${anticipo ? `<div>Anticipo ya pagado</div><div style="text-align:right">-${money(anticipo)}</div>` : ''}
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
  ${voucher}

  <div class="regla" style="margin:8px 0 7px"></div>

  <div class="center">
    ${negocio.leyenda ? `<div style="font-family:Jost,sans-serif;font-weight:500;font-size:11px">${esc(negocio.leyenda)}</div>` : ''}
    ${negocio.pieSecundario ? `<div style="font-size:9px;line-height:1.4;margin-top:3px">${esc(negocio.pieSecundario)}</div>` : ''}
    ${
      avisos.length > 0
        ? `<div style="border-top:1px solid #000;margin-top:6px;padding-top:5px;font-size:9px;line-height:1.5">${avisos
            .map((a) => `<div>${esc(a)}</div>`)
            .join('')}</div>`
        : ''
    }
  </div>

</div>`).join('')}
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
export function imprimirTicket(
  data: TicketData,
  negocio: TicketNegocio = NEGOCIO_DEFAULT,
  copias = 1,
): boolean {
  return imprimirHTML(ticketHTML(data, negocio, copias), 'Ticket')
}

/** El corte de caja por el navegador: Admin lo manda a la impresora de donde esté, o a PDF. */
export function imprimirCorte(c: CorteData, negocio: TicketNegocio = NEGOCIO_DEFAULT): boolean {
  return imprimirHTML(corteHTML(c, negocio), 'Corte de caja')
}

function imprimirHTML(html: string, titulo: string): boolean {
  if (typeof document === 'undefined') return false

  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  marco.setAttribute('title', titulo)
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
  doc.write(html)
  doc.close()
  return true
}

/**
 * El corte de caja en HTML, con la misma piel que la nota.
 *
 * Es el comprobante del turno: el que Admin imprime desde donde esté o guarda
 * en PDF. El papel térmico lo arma `armarCorte`; este y aquel comen el mismo
 * `CorteData` que escribe `fn_corte_payload`, así que dicen lo mismo.
 */
export function corteHTML(c: CorteData, negocio: TicketNegocio = NEGOCIO_DEFAULT): string {
  const n = (v: number | null | undefined) => Number(v ?? 0)
  const cuando = (iso: string | null | undefined) => {
    if (!iso) return '—'
    const f = new Date(iso)
    return Number.isNaN(f.getTime())
      ? '—'
      : f.toLocaleString('es-MX', { timeZone: 'America/Merida', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  const renglones = (raw: unknown): string => {
    if (!raw || typeof raw !== 'object') return ''
    const o = raw as { billetes?: Record<string, unknown>; monedas?: Record<string, unknown> }
    const lado = (v: Record<string, unknown> | undefined, nombre: string) =>
      Object.entries(v && typeof v === 'object' ? v : {})
        .map(([den, p]) => [Number(den), Math.max(0, Math.trunc(Number(p) || 0))] as const)
        .filter(([den, p]) => Number.isFinite(den) && den > 0 && p > 0)
        .sort((a, b) => b[0] - a[0])
        .map(([den, p]) => `<div>${nombre} $${den} × ${p}</div><div style="text-align:right">${money(den * p)}</div>`)
        .join('')
    return lado(o.billetes, 'Billete') + lado(o.monedas, 'Moneda')
  }
  const dif = n(c.diferencia)
  const palabra = dif === 0 ? 'CUADRA' : dif > 0 ? 'SOBRANTE' : 'FALTANTE'
  const metodo = (nombre: string, v: number | null | undefined) =>
    n(v) > 0 ? `<div>${nombre}</div><div style="text-align:right">${money(n(v))}</div>` : ''
  const direccion = (negocio.direccion ?? '').split('\n').filter(Boolean).map((t) => esc(t)).join('<br />')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Corte de caja ${c.folio ?? ''}</title>
<link rel="stylesheet" href="${FUENTES_MARCA}">
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html,body { margin: 0; padding: 0; }
  body { width: 80mm; color: #000; background: #fff; font-family: "DM Mono", ui-monospace, "Courier New", monospace; font-size: 11px; line-height: 1.35; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .t { padding: 5mm 4mm 7mm; }
  .center { text-align: center; }
  .regla { border-top: 1px solid #000; }
  .mini { font-size: 8px; letter-spacing: .18em; text-transform: uppercase; }
  .cuentas { display: grid; grid-template-columns: minmax(0,1fr) 78px; gap: 3px 4px; font-size: 10px; }
</style></head><body onload="window.print()">
<div class="t">
  <div class="center">
    <div style="display:flex;justify-content:center;align-items:baseline;line-height:1">
      <span style="font-family:Jost,sans-serif;font-weight:300;font-size:17px">Hojaldras</span><span style="font-family:Yellowtail,cursive;font-size:30px;margin-left:-5px;transform:translateY(4px);display:inline-block">Lily</span>
    </div>
    ${negocio.sucursal ? `<div style="font-size:10px;margin-top:10px">Sucursal ${esc(negocio.sucursal)}</div>` : ''}
    <div style="font-size:9px;line-height:1.4;margin-top:2px">${direccion}</div>
  </div>
  <div class="regla" style="margin:8px 0 6px"></div>
  <div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:end">
    <div>
      <div class="mini" style="margin-bottom:2px">Corte de caja</div>
      <div style="display:inline-block;background:#000;color:#fff;font-weight:500;font-size:22px;line-height:1;padding:4px 7px 3px">#${esc(String(c.folio ?? '—'))}</div>
    </div>
    <div style="text-align:right;font-size:9.5px;line-height:1.45">
      ${c.caja ? `<div>${esc(c.caja)}</div>` : ''}
      <div>Abrió ${esc(cuando(c.abierto_en))}${c.abrio ? ' · ' + esc(c.abrio) : ''}</div>
      <div>Cerró ${esc(cuando(c.cerrado_en))}${c.cerro ? ' · ' + esc(c.cerro) : ''}</div>
    </div>
  </div>
  <div class="regla" style="margin:8px 0 5px"></div>
  <div class="mini" style="margin-bottom:3px">Ventas · ${n(c.num_ordenes)} órdenes</div>
  <div class="cuentas">
    ${metodo('Efectivo', c.total_efectivo)}${metodo('Terminal', c.total_tarjeta)}${metodo('Inbursa', c.total_inbursa)}${metodo('Transferencia', c.total_transferencia)}${metodo('Clip', c.total_clip)}${metodo('Cortesía', c.total_cortesia)}${metodo('Otro', c.total_otro)}
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;border-top:1px solid #000;margin-top:5px;padding-top:4px">
    <div style="font-weight:500;font-size:11px;letter-spacing:.08em">TOTAL VENDIDO</div>
    <div style="font-weight:500;font-size:16px;line-height:1">${money(n(c.total_pagado))}</div>
  </div>
  <div class="regla" style="margin:8px 0 5px"></div>
  <div class="mini" style="margin-bottom:3px">El cajón</div>
  <div class="cuentas">
    <div>Fondo inicial</div><div style="text-align:right">${money(n(c.fondo_inicial))}</div>
    <div>+ Efectivo vendido</div><div style="text-align:right">${money(n(c.total_efectivo))}</div>
    <div style="font-weight:500">= Debía haber</div><div style="text-align:right;font-weight:500">${money(n(c.efectivo_esperado))}</div>
    <div style="font-weight:500;margin-top:3px">Se contó</div><div style="text-align:right;font-weight:500;margin-top:3px">${money(n(c.efectivo_contado))}</div>
    ${renglones(c.conteo_cierre)}
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;border-top:2px solid #000;margin-top:6px;padding-top:5px">
    <div style="font-weight:500;font-size:12px;letter-spacing:.08em">${palabra}</div>
    <div style="font-weight:500;font-size:24px;line-height:1">${dif < 0 ? '-' : ''}${money(Math.abs(dif))}</div>
  </div>
  ${c.notas ? `<div style="font-size:9px;line-height:1.4;margin-top:8px;padding-left:8px;border-left:1px solid #000">${esc(c.notas)}</div>` : ''}
  <div class="regla" style="margin:14px 0 4px"></div>
  <div class="center" style="font-size:9px">Firma de quien cerró</div>
</div>
</body></html>`
}
