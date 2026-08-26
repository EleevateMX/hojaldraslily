import { readFileSync } from 'node:fs'
import 'dotenv/config'
import type { PrinterConfig } from './types.js'

export interface AgenteConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  agenteId: string
  pollIntervaloMs: number
  latidoIntervaloMs: number
  statusHttpPuerto: number
  printers: PrinterConfig[]
}

function requerido(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env y llénalo.`,
    )
  }
  return valor
}

/**
 * Solo las impresoras, sin exigir credenciales de Supabase.
 *
 * Se separa de `cargarConfig()` porque revisar el diseño de una etiqueta
 * (`--vista-previa`) o mandarla a la impresora de prueba no habla con la base
 * para nada — y pedir SUPABASE_URL para dibujar un recuadro deja a quien está
 * instalando atascado por un motivo que no tiene que ver con lo que hace.
 */
export function cargarPrinters(): PrinterConfig[] {
  const printersPath = process.env.PRINTERS_CONFIG_PATH ?? './printers.config.json'

  let printers: PrinterConfig[]
  try {
    // El BOM se quita a mano: el Bloc de notas de Windows lo antepone al
    // guardar, y `JSON.parse` revienta en el primer byte con un mensaje que
    // no dice nada útil ("Unexpected token"). Quien edita el archivo en la
    // sucursal no tiene por qué saber qué es un BOM.
    const raw = readFileSync(printersPath, 'utf8').replace(/^\uFEFF/, '')
    printers = JSON.parse(raw) as PrinterConfig[]
  } catch (e) {
    throw new Error(
      `No se pudo leer ${printersPath}. Copia printers.config.example.json a ` +
        `printers.config.json y configura al menos una impresora. (${e instanceof Error ? e.message : String(e)})`,
    )
  }

  if (!Array.isArray(printers) || printers.length === 0) {
    throw new Error(`${printersPath} debe tener al menos una impresora configurada.`)
  }
  for (const p of printers) {
    if (!p.id || !p.token || !p.interface) {
      throw new Error(`Impresora inválida en ${printersPath}: faltan id/token/interface — ${JSON.stringify(p)}`)
    }
    // Una etiquetadora solo se alcanza por socket: si aquí hubiera un
    // "printer:NombreDeWindows" el agente fallaría al primer trabajo real,
    // en plena venta. Mejor que no arranque.
    if (p.lenguaje === 'tspl' && !/^(tcp:\/\/)?\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(p.interface)) {
      throw new Error(
        `La impresora "${p.id}" es TSPL, así que su interface tiene que ser tcp://IP:PUERTO — ` +
          `y dice "${p.interface}".`,
      )
    }
  }
  return printers
}

export function cargarConfig(): AgenteConfig {
  const supabaseUrl = requerido('SUPABASE_URL')
  const supabaseAnonKey = requerido('SUPABASE_ANON_KEY')
  const agenteId = process.env.AGENTE_ID ?? `agente-${process.pid}`
  const pollIntervaloMs = Number(process.env.POLL_INTERVALO_SEGUNDOS ?? '10') * 1000
  const latidoIntervaloMs = Number(process.env.LATIDO_INTERVALO_SEGUNDOS ?? '30') * 1000
  const statusHttpPuerto = Number(process.env.STATUS_HTTP_PUERTO ?? '7777')

  return {
    supabaseUrl,
    supabaseAnonKey,
    agenteId,
    pollIntervaloMs,
    latidoIntervaloMs,
    statusHttpPuerto,
    printers: cargarPrinters(),
  }
}
