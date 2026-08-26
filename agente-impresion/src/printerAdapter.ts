import type { printer as ThermalPrinter } from 'node-thermal-printer'
import { crearImpresora, escribirComanda } from './comanda.js'
import { etiquetasDeTrabajo } from './etiquetas.js'
import { generarTSPL } from './tspl.js'
import { enviarTSPL, estaViva, parsearDestino } from './tsplSocket.js'
import type { PrinterConfig, TrabajoImpresion } from './types.js'
import { log } from './log.js'

/**
 * Imprime un trabajo en la impresora física, respetando `copias` y
 * `corteAutomatico`/`buzzer` de la config. Lanza si la impresora no
 * responde — el llamante (worker.ts) decide qué hacer con eso (reintento).
 *
 * El lenguaje decide el camino entero, no solo el formato: ESC/POS pasa por
 * node-thermal-printer, TSPL escribe al socket directo. Ver `LenguajeImpresora`
 * en types.ts para por qué esto no puede quedar en manos de una heurística.
 */
export async function imprimirTrabajo(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  if ((cfg.lenguaje ?? 'escpos') === 'tspl') {
    await imprimirEtiquetas(cfg, trabajo)
    return
  }
  await imprimirRecibo(cfg, trabajo)
}

/** Etiquetadoras TSC / 3nstar: una etiqueta por unidad pedida. */
async function imprimirEtiquetas(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  const destino = parsearDestino(cfg.interface)

  // Se pregunta ANTES de generar nada. Una etiquetadora apagada acepta el
  // trabajo en silencio si uno se limita a escribir al vacío, y entonces la
  // comanda se da por impresa y nunca llega a barra.
  if (!(await estaViva(destino))) {
    throw new Error(
      `Etiquetadora "${cfg.id}" (${destino.ip}:${destino.puerto}) no responde — revisa red/encendido/tapa.`,
    )
  }

  const copias = Math.max(1, cfg.copias || 1)
  for (let copia = 1; copia <= copias; copia++) {
    const etiquetas = etiquetasDeTrabajo(trabajo, copia)
    if (etiquetas.length === 0) {
      // Se LANZA, no se registra y sigue. Un trabajo que no produce ninguna
      // etiqueta y aun así se confirma queda "impreso" en la cola con nada
      // en la mano: en Admin todo verde y la comanda perdida. Que falle y
      // se reintente es incómodo; que mienta es peor.
      throw new Error(
        `El trabajo ${trabajo.id} no produjo ninguna etiqueta (payload sin productos).`,
      )
    }
    // Una etiqueta por envío: si falla la tercera de cinco, las dos primeras
    // ya salieron y el error dice exactamente dónde se quedó.
    for (const etiqueta of etiquetas) {
      await enviarTSPL(generarTSPL(etiqueta), destino)
    }
    log.info(
      `Impresas ${etiquetas.length} etiquetas del trabajo ${trabajo.id} (copia ${copia}/${copias})`,
      cfg.id,
    )
  }
}

/** Impresoras de recibos ESC/POS: una comanda larga con todos los productos. */
async function imprimirRecibo(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  const printer: ThermalPrinter = crearImpresora(cfg)

  const conectada = await printer.isPrinterConnected().catch(() => false)
  if (!conectada) {
    throw new Error(`Impresora "${cfg.id}" (${cfg.interface}) no responde — revisa cable/red/encendido.`)
  }

  const copias = Math.max(1, cfg.copias || 1)
  for (let copia = 1; copia <= copias; copia++) {
    printer.clear()
    escribirComanda(printer, trabajo, copia)
    if (cfg.corteAutomatico) printer.cut()
    if (cfg.buzzer) printer.beep()
    await printer.execute()
    log.info(`Impreso trabajo ${trabajo.id} (copia ${copia}/${copias})`, cfg.id)
  }
}
