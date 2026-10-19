/**
 * De un trabajo de la cola a bytes listos para la impresora.
 *
 * **El texto NO se arma aquí**: sale de `@lily/ui`, el mismo módulo que pinta
 * el ticket en pantalla. Esa es la razón de que este agente viva en `apps/`
 * y no junto al de etiquetas — si cada uno tuviera su propio formateador, la
 * vista previa dejaría de coincidir con el papel a la primera modificación, y
 * nadie se enteraría hasta que un cliente reclame.
 *
 * (El de etiquetas sí vive aparte, y está bien: habla TSPL con las
 * etiquetadoras y no comparte ni una línea de formato con esto.)
 */

// Se importa el submódulo del papel y NO el índice de `@lily/ui`: ese
// arrastra los componentes de React y el `imprimirTicket` que toca
// `document`, y aquí no hay navegador. `tsc` lo caza aunque el import sea
// solo de tipos.
import { armarTicket, COLUMNAS_80MM } from '@lily/ui/papel'
import type { TicketData, TicketNegocio } from '@lily/ui/tipos'
import { ConstructorEscPos, type LogoRaster } from './escpos.js'

export type TipoDocumento = 'ticket' | 'comanda' | 'corte'

export interface TrabajoCaja {
  id: string
  tipo_documento: TipoDocumento
  payload: Record<string, unknown>
}

/**
 * Qué es un payload de ticket.
 *
 * Se valida lo mínimo que hace falta para no imprimir basura: el resto lo
 * comprueba `armarTicket`, que tolera campos ausentes. Un payload roto es un
 * trabajo que falla **ruidosamente** y se marca como tal, no uno que saca
 * papel en blanco.
 */
export function esPayloadDeTicket(p: unknown): p is TicketData {
  if (!p || typeof p !== 'object') return false
  const d = p as Partial<TicketData>
  return (
    (typeof d.folio === 'number' || typeof d.folio === 'string') &&
    Array.isArray(d.items) &&
    typeof d.metodoPago === 'string'
  )
}

/**
 * La prueba de impresión de Admin.
 *
 * Es el MISMO payload `prueba: true` que el agente de etiquetas ya sabe
 * dibujar. Inventarle un tipo propio obligaría a actualizar el agente de la
 * tienda antes de poder probar nada — y esa conversación («tu agente es
 * viejo y no sabe imprimir esto») es justo la que una prueba de impresión
 * viene a evitar.
 */
export interface PayloadPrueba {
  prueba: true
  impresora?: string
  hora?: string
}

export function esPayloadDePrueba(p: unknown): p is PayloadPrueba {
  return !!p && typeof p === 'object' && (p as { prueba?: unknown }).prueba === true
}

function construirPrueba(p: PayloadPrueba, ancho: number): Buffer {
  const b = new ConstructorEscPos().inicializar().alinear(1)
  const centrar = (s: string) =>
    s.length >= ancho ? s.slice(0, ancho) : ' '.repeat(Math.floor((ancho - s.length) / 2)) + s

  b.linea('='.repeat(ancho))
  b.linea(centrar('PRUEBA DE IMPRESION'))
  b.linea('='.repeat(ancho))
  b.linea()
  if (p.impresora) b.linea(centrar(p.impresora))
  b.linea(centrar(new Date(p.hora ?? Date.now()).toLocaleString('es-MX', { timeZone: 'America/Merida' })))
  b.linea()
  // Las acentuadas van a propósito: si salen con basura, la página de
  // códigos está mal y se ve AQUÍ, no en el ticket de un cliente.
  b.linea(centrar('Si lees esto, la cadena completa sirve:'))
  b.linea(centrar('base, cola, agente, red e impresora.'))
  b.linea()
  b.linea(centrar('Acentos: áéíóú ñÑ ¿? ¡! °'))
  return b.cortar().construir()
}

export function construirDocumento(
  trabajo: TrabajoCaja,
  negocio: TicketNegocio,
  logo: LogoRaster | null,
  ancho: number = COLUMNAS_80MM,
): Buffer {
  if (esPayloadDePrueba(trabajo.payload)) return construirPrueba(trabajo.payload, ancho)

  if (!esPayloadDeTicket(trabajo.payload)) {
    throw new Error(
      `El trabajo ${trabajo.id} no trae un ticket que se pueda imprimir ` +
        '(falta folio, items o metodoPago).',
    )
  }

  const b = new ConstructorEscPos().inicializar()
  if (logo) b.alinear(1).logo(logo).linea()

  b.alinear(0)
  for (const l of armarTicket(trabajo.payload, negocio, ancho)) {
    if (typeof l === 'string') { b.linea(l); continue }
    // Marca de QR: la impresora lo genera nativamente, así no hay que
    // rasterizarlo de este lado y mandarlo por un buffer chico.
    b.alinear(1)
    qr(b, l.contenido)
    b.alinear(0)
  }

  return b.cortar().construir()
}

/** QR nativo ESC/POS: `GS ( k`. Modelo 2, corrección M. */
function qr(b: ConstructorEscPos, contenido: string): void {
  const datos = Buffer.from(contenido, 'latin1')
  const n = datos.length + 3
  b.crudo(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00) // modelo 2
  b.crudo(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06)       // tamaño de módulo
  b.crudo(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31)       // corrección M
  b.crudo(0x1d, 0x28, 0x6b, n & 0xff, (n >> 8) & 0xff, 0x31, 0x50, 0x30)
  b.crudo(...datos)
  b.crudo(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)       // imprimir
  b.crudo(0x0a)
}
