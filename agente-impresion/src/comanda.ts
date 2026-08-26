import { printer as ThermalPrinter, types as PrinterTypes, CharacterSet } from 'node-thermal-printer'
import type { PayloadComanda, PrinterConfig, TrabajoImpresion } from './types.js'

/**
 * Arma una instancia de impresora ESC/POS lista para usar. `characterSet`
 * afecta acentos/eñes — PC858_EURO cubre la mayoría de impresoras clonadas
 * ESC/POS vendidas en México; si una impresora en particular muestra
 * caracteres raros, es el primer parámetro a cambiar (ver
 * docs/configuracion-impresoras.md).
 */
export function crearImpresora(cfg: PrinterConfig): ThermalPrinter {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: cfg.interface,
    width: cfg.anchoPapel === '58mm' ? 32 : 42,
    characterSet: CharacterSet.PC858_EURO,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 5000 },
  })
}

const CANAL_LEGIBLE: Record<string, string> = {
  kiosko: 'AUTOSERVICIO',
  pos: 'CAJA',
  delivery: 'ENTREGA',
}

function formatearFecha(iso: string | undefined): { fecha: string; hora: string } {
  const d = iso ? new Date(iso) : new Date()
  return {
    fecha: d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

/**
 * Escribe el contenido de UNA comanda en el buffer de la impresora
 * (no imprime todavía — eso lo hace `execute()` en printerAdapter.ts). Se
 * llama una vez por copia solicitada.
 *
 * Reglas del formato (ver docs/impresion-comandas.md):
 *  - Sin precios.
 *  - Folio grande y estación bien visibles (lo primero que se ve al
 *    arrancar el papel).
 *  - Personalización/notas con más énfasis que el nombre del producto
 *    (texto en mayúsculas + flecha, línea aparte).
 *  - Marca REIMPRESIÓN y el número de copia cuando no es la primera.
 */
export function escribirComanda(printer: ThermalPrinter, trabajo: TrabajoImpresion, numeroDeCopia: number): void {
  const p: PayloadComanda = trabajo.payload

  if (p.prueba) {
    printer.alignCenter()
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.println('HOJALDRAS LILY')
    printer.println('IMPRESIÓN DE PRUEBA')
    printer.bold(false)
    printer.setTextSize(0, 0)
    printer.println(p.impresora ?? '')
    printer.println(new Date().toLocaleString('es-MX'))
    printer.newLine()
    return
  }

  const { fecha, hora } = formatearFecha(p.creado_en)

  printer.alignCenter()
  printer.bold(true)
  printer.setTextSize(0, 1)
  printer.println('HOJALDRAS LILY')
  printer.setTextSize(0, 0)

  if (numeroDeCopia > 1 || trabajo.numero_copia > 1) {
    printer.println('*** REIMPRESIÓN ***')
  }

  printer.setTextSize(1, 2)
  printer.println((p.estacion ?? 'COCINA').toUpperCase())
  printer.setTextSize(2, 3)
  printer.println(`#${p.folio ?? '—'}`)
  printer.setTextSize(0, 0)
  printer.bold(false)

  printer.alignLeft()
  printer.drawLine()
  printer.println(`${fecha}  ${hora}`)
  printer.println(`Tipo: ${CANAL_LEGIBLE[p.canal ?? ''] ?? (p.canal ?? '—').toUpperCase()}`)
  if (p.cajero) printer.println(`Cajero/dispositivo: ${p.cajero}`)
  if (p.cliente) printer.println(`Cliente: ${p.cliente}`)
  printer.drawLine()
  printer.newLine()

  const items = p.items ?? []
  if (items.length === 0) {
    printer.bold(true)
    printer.println('(sin productos — revisar la orden en el sistema)')
    printer.bold(false)
  }
  for (const item of items) {
    printer.bold(true)
    printer.setTextSize(0, 1)
    printer.println(`${item.cantidad}x  ${item.nombre}`)
    printer.setTextSize(0, 0)
    printer.bold(false)
    if (item.personalizacion && item.personalizacion.trim()) {
      // La personalización/nota pesa más que el nombre del producto: en
      // negritas, mayúsculas y con flecha, para que no se pierda de vista.
      printer.bold(true)
      printer.println(`   >> ${item.personalizacion.trim().toUpperCase()}`)
      printer.bold(false)
    }
    printer.newLine()
  }

  printer.drawLine()
  printer.alignCenter()
  printer.println(`Copia ${numeroDeCopia > 1 ? numeroDeCopia : trabajo.numero_copia}`)
  printer.newLine()
}
