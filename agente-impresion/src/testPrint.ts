/**
 * Prueba de impresora SIN pasar por Supabase — solo hardware. Útil para
 * confirmar cable/red/driver antes de conectar todo lo demás.
 *
 *   npm run test-print -- <printerId>                imprime de verdad
 *   npm run test-print -- <printerId> --vista-previa dibuja, no imprime
 *   npm run test-print -- <printerId> --tspl         muestra el TSPL crudo
 *
 * Las dos últimas no tocan la impresora ni la red: sirven para revisar el
 * diseño (y para copiar el TSPL a otro sistema) sin gastar una etiqueta.
 *
 * `<printerId>` debe existir en printers.config.json.
 */
import { cargarPrinters } from './config.js'
import { crearImpresora, escribirComanda } from './comanda.js'
import { etiquetasDeTrabajo } from './etiquetas.js'
import { generarTSPL, vistaPrevia } from './tspl.js'
import { enviarTSPL, estaViva, parsearDestino } from './tsplSocket.js'
import type { PrinterConfig, TrabajoImpresion } from './types.js'

function trabajoDePrueba(cfg: PrinterConfig): TrabajoImpresion {
  const esBebidas = /bebida|barra/i.test(`${cfg.id} ${cfg.descripcion ?? ''}`)
  return {
    id: 'prueba-local',
    orden_id: null,
    pedido_id: null,
    estacion_id: null,
    printer_id: null,
    tipo_documento: 'comanda',
    payload: {
      folio: 156490945,
      canal: 'pos',
      estacion: esBebidas ? 'Bebidas' : 'Alimentos',
      creado_en: new Date().toISOString(),
      cajero: 'Prueba local',
      cliente: 'PRUEBA',
      items: esBebidas
        ? [
            {
              cantidad: 2,
              nombre: 'Shake Oreo',
              tamano: '20 OZ',
              proteina: 'Whey chocolate',
              leche: 'Deslactosada',
              extras: ['extra galleta', 'sin crema'],
            },
            { cantidad: 1, nombre: 'Smoothie mango fresa', tamano: '16 OZ', extras: ['sin azucar'] },
          ]
        : [{ cantidad: 1, nombre: 'Waffle con fresas', notas: 'Alergica a la nuez' }],
    },
    estado: 'claimed',
    intentos: 0,
    max_intentos: 5,
    numero_copia: 1,
    created_at: new Date().toISOString(),
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const soloVistaPrevia = args.includes('--vista-previa')
  const soloTspl = args.includes('--tspl')
  const printerId = args.find((a) => !a.startsWith('--'))

  if (!printerId) {
    console.error('Uso: npm run test-print -- <printerId> [--vista-previa|--tspl]')
    process.exit(1)
  }

  const printers = cargarPrinters()
  const printerCfg = printers.find((p) => p.id === printerId)
  if (!printerCfg) {
    console.error(
      `No existe la impresora "${printerId}" en printers.config.json. ` +
        `Hay: ${printers.map((p) => p.id).join(', ')}`,
    )
    process.exit(1)
  }

  const trabajo = trabajoDePrueba(printerCfg)
  const lenguaje = printerCfg.lenguaje ?? 'escpos'

  // ---- Caminos que NO tocan la impresora --------------------------------
  if (soloVistaPrevia || soloTspl) {
    if (lenguaje !== 'tspl') {
      console.error(`--vista-previa y --tspl solo aplican a impresoras con lenguaje "tspl". ` +
        `"${printerId}" está como "${lenguaje}".`)
      process.exit(1)
    }
    for (const etiqueta of etiquetasDeTrabajo(trabajo)) {
      console.log(soloTspl ? generarTSPL(etiqueta) : vistaPrevia(etiqueta))
      console.log('')
    }
    return
  }

  // ---- Impresión real ----------------------------------------------------
  if (lenguaje === 'tspl') {
    const destino = parsearDestino(printerCfg.interface)
    console.log(`Conectando a ${destino.ip}:${destino.puerto} (TSPL)…`)
    if (!(await estaViva(destino))) {
      console.error('No responde. Revisa red/IP/puerto/encendido, y que la tapa esté bien cerrada.')
      process.exit(1)
    }
    const etiquetas = etiquetasDeTrabajo(trabajo)
    console.log(`Conectada. Imprimiendo ${etiquetas.length} etiquetas…`)
    for (const etiqueta of etiquetas) await enviarTSPL(generarTSPL(etiqueta), destino)
    console.log('Listo. Si no salió nada, la impresora casi seguro no es TSPL: revisa el modelo.')
    return
  }

  const printer = crearImpresora(printerCfg)
  console.log(`Conectando a ${printerCfg.interface} (ESC/POS)…`)
  if (!(await printer.isPrinterConnected())) {
    console.error('No responde. Revisa cable/IP/puerto/encendido.')
    process.exit(1)
  }
  console.log('Conectada. Imprimiendo prueba…')
  printer.clear()
  escribirComanda(printer, trabajo, 1)
  if (printerCfg.corteAutomatico) printer.cut()
  if (printerCfg.buzzer) printer.beep()
  await printer.execute()
  console.log('Listo. Si no salió nada, revisa characterSet/ancho en comanda.ts para tu modelo.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
