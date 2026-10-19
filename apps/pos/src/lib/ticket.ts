import { encolarTicketCaja } from '@lily/supabase'
import { imprimirTicket, type TicketData } from '@lily/ui'
import { sb } from './sb'

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
  imprimirTicket(ticket)
}
