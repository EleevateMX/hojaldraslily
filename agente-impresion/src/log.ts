import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const LOG_DIR = join(process.cwd(), 'logs')
let dirListo = false

async function asegurarDir(): Promise<void> {
  if (dirListo) return
  await mkdir(LOG_DIR, { recursive: true })
  dirListo = true
}

function archivoDeHoy(): string {
  const hoy = new Date().toISOString().slice(0, 10)
  return join(LOG_DIR, `agente-${hoy}.log`)
}

async function escribir(nivel: string, printerId: string | null, mensaje: string): Promise<void> {
  const linea = `[${new Date().toISOString()}] [${nivel}]${printerId ? ` [${printerId}]` : ''} ${mensaje}\n`
  process.stdout.write(linea)
  try {
    await asegurarDir()
    await appendFile(archivoDeHoy(), linea, 'utf8')
  } catch {
    // El log en disco es una comodidad; si falla (permisos, disco lleno) no
    // debe tumbar el agente — ya se imprimió en consola.
  }
}

export const log = {
  info: (mensaje: string, printerId: string | null = null) => void escribir('INFO', printerId, mensaje),
  warn: (mensaje: string, printerId: string | null = null) => void escribir('WARN', printerId, mensaje),
  error: (mensaje: string, printerId: string | null = null) => void escribir('ERROR', printerId, mensaje),
}
