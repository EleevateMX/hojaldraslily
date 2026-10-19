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
  imprimirTicket(ticket, negocioCargado)
}
