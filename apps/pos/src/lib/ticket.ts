import { encolarTicketCaja, datosDelTicket } from '@lily/supabase'
import { imprimirTicket, NEGOCIO_DEFAULT, type TicketData, type TicketNegocio } from '@lily/ui'
import { sb } from './sb'
import { conRespaldo } from './respaldo'

/**
 * Los datos del negocio para el papel del navegador.
 *
 * Son los de Admin → Sistema («Lo que dice el ticket»), completados con los
 * del código. Van con respaldo para que sin internet el ticket salga igual
 * con el teléfono de siempre, y se cargan al abrir la caja —no al cobrar—
 * para no meter una consulta entre el cobro y el papel.
 */
let negocioCargado: TicketNegocio = NEGOCIO_DEFAULT

export async function cargarDatosDelTicket(): Promise<void> {
  try {
    const d = await conRespaldo('datos_ticket', () => datosDelTicket(sb))
    if (d) {
      const limpio = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined))
      negocioCargado = { ...NEGOCIO_DEFAULT, ...limpio } as TicketNegocio
    }
  } catch {
    // Se queda con lo del código: un ticket con el teléfono de siempre es
    // mejor que un cobro que espera a una consulta.
  }
}

/**
 * Sacar el ticket del cliente, por donde se pueda.
 *
 * Hay dos caminos y el orden importa:
 *
 * 1. **La térmica del mostrador**, por la cola: `fn_imprimir_ticket_caja`
 *    encola el trabajo y `apps/agente-caja` lo imprime por ESC/POS. Este es
 *    el bueno, porque el trabajo se confirma contra la base solo cuando la
 *    impresora aceptó los bytes — así un ticket que no salió **se ve en
 *    Admin**.
 * 2. **El navegador** (`window.print()`), si la tienda todavía no tiene
 *    térmica dada de alta o si la cola falló. Funciona, pero manda el papel
 *    a la impresora predeterminada de Windows: si es la equivocada, la venta
 *    queda bien cobrada y el ticket se va callado a un PDF.
 *
 * Nunca las dos. Y nunca ninguna: si encolar revienta, se imprime por el
 * navegador igual. Quedarse sin ticket por un error de red del lado de la
 * impresión sería castigar al cliente por algo que ya se cobró bien.
 */
export async function sacarTicket(ordenId: string | null, ticket: TicketData): Promise<void> {
  if (ordenId) {
    try {
      const trabajo = await encolarTicketCaja(sb, ordenId, ticket)
      // Con trabajo en la cola, la térmica lo saca. Imprimir además por el
      // navegador daría dos tickets de la misma venta.
      if (trabajo) return
    } catch {
      // Da igual por qué falló: el cliente tiene que llevarse su papel.
    }
  }
  // Dos copias: la original para el cliente y una copia (la casa lo pidió,
  // 27/10/26). Cada una va en su propia página; con el autocorte "por página"
  // del driver de la térmica, salen cortadas por separado. Por el agente
  // ESC/POS esto será cosa del agente; por ahora la caja imprime por navegador.
  imprimirTicket(ticket, negocioCargado, 2)
}

/**
 * Comprobante de que la Terminal 1 (Banorte) RECHAZÓ el cobro.
 *
 * No es un ticket de venta —no hubo venta—: es el respaldo que se le da al
 * cliente para que vea que su tarjeta salió declinada y por qué, y que la
 * tienda no se quedó con su dinero. Sale por el navegador (no hay orden que
 * encolar) con la cabecera del negocio de siempre.
 */
export function imprimirComprobanteRechazo(monto: number, motivo: string): void {
  const n = negocioCargado
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const dinero = '$' + Math.abs(monto).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Merida', hour12: true })
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0 }
  * { margin: 0; padding: 0; box-sizing: border-box }
  body { width: 80mm; padding: 6mm 4mm; font-family: 'Courier New', monospace; color: #000; text-align: center }
  .nom { font-weight: 700; font-size: 15px; letter-spacing: .04em }
  .sub { font-size: 10px; margin-top: 2px }
  .caja { border: 2px solid #000; border-radius: 4px; padding: 8px; margin: 12px 0 }
  .tit { font-weight: 700; font-size: 16px; text-transform: uppercase }
  .monto { font-weight: 700; font-size: 20px; margin: 8px 0 }
  .motivo { font-size: 12px; margin-top: 4px }
  .pie { font-size: 10px; margin-top: 10px; line-height: 1.4 }
</style></head><body onload="window.print()">
  <div class="nom">${esc(n.nombre)}</div>
  ${n.sucursal ? `<div class="sub">Sucursal ${esc(n.sucursal)}</div>` : ''}
  <div class="caja">
    <div class="tit">Pago rechazado</div>
    <div class="monto">${dinero}</div>
    <div class="sub">Terminal 1</div>
    <div class="motivo">Motivo: ${esc(motivo)}</div>
  </div>
  <div class="sub">${esc(hora)}</div>
  <div class="pie">La tarjeta fue DECLINADA. No se realizó ningún cargo.<br/>
  Intente con otra tarjeta u otra forma de pago.</div>
</body></html>`
  imprimirEnMarco(html)
}

/**
 * Comprobante de que una venta se CANCELÓ (se devolvió).
 *
 * Es el respaldo para el cliente y para la caja de que esa venta ya no cuenta
 * y se le devolvió su dinero. Sale por el navegador con la cabecera del
 * negocio; lleva el folio, el total devuelto, el motivo y quién lo autorizó.
 */
export function imprimirComprobanteCancelacion(
  folio: number | string,
  total: number,
  motivo: string,
  autorizadoPor: string,
): void {
  const n = negocioCargado
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const dinero = '$' + Math.abs(total).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Merida', hour12: true })
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0 }
  * { margin: 0; padding: 0; box-sizing: border-box }
  body { width: 80mm; padding: 6mm 4mm; font-family: 'Courier New', monospace; color: #000; text-align: center }
  .nom { font-weight: 700; font-size: 15px; letter-spacing: .04em }
  .sub { font-size: 10px; margin-top: 2px }
  .caja { border: 2px solid #000; border-radius: 4px; padding: 8px; margin: 12px 0 }
  .tit { font-weight: 700; font-size: 16px; text-transform: uppercase }
  .monto { font-weight: 700; font-size: 20px; margin: 8px 0 }
  .d { font-size: 11px; margin-top: 4px }
  .pie { font-size: 10px; margin-top: 10px; line-height: 1.4 }
</style></head><body onload="window.print()">
  <div class="nom">${esc(n.nombre)}</div>
  ${n.sucursal ? `<div class="sub">Sucursal ${esc(n.sucursal)}</div>` : ''}
  <div class="caja">
    <div class="tit">Venta cancelada</div>
    <div class="sub">Folio #${esc(String(folio))}</div>
    <div class="monto">${dinero}</div>
    <div class="d">Devuelto al cliente</div>
    ${motivo ? `<div class="d">Motivo: ${esc(motivo)}</div>` : ''}
    <div class="d">Autoriz&oacute;: ${esc(autorizadoPor)}</div>
  </div>
  <div class="sub">${esc(hora)}</div>
  <div class="pie">Esta venta ya no cuenta en el corte.</div>
</body></html>`
  imprimirEnMarco(html)
}

/** Imprime un HTML suelto en un marco oculto (lo mismo que hace el ticket). */
function imprimirEnMarco(html: string): void {
  const marco = document.createElement('iframe')
  marco.style.position = 'fixed'
  marco.style.right = '0'
  marco.style.bottom = '0'
  marco.style.width = '0'
  marco.style.height = '0'
  marco.style.border = '0'
  marco.srcdoc = html
  marco.onload = () => { setTimeout(() => marco.remove(), 2000) }
  document.body.appendChild(marco)
}
