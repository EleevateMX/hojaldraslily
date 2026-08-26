import { createClient } from '@supabase/supabase-js'
import { cargarConfig } from './config.js'
import { PrinterWorker } from './worker.js'
import { iniciarStatusHttp } from './statusHttp.js'
import { log } from './log.js'

async function main(): Promise<void> {
  const cfg = cargarConfig()
  log.info(`Hojaldras Lily — agente de impresión "${cfg.agenteId}" iniciando…`)
  log.info(`Impresoras configuradas: ${cfg.printers.map((p) => p.id).join(', ')}`)

  const workers: PrinterWorker[] = cfg.printers.map((printerCfg) => {
    // Un cliente Supabase independiente por impresora: cada uno usa SOLO
    // el token de SU impresora en las llamadas RPC — un fallo o token
    // revocado en una no afecta a las demás.
    const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 5 } },
    })
    return new PrinterWorker(sb, printerCfg, cfg.agenteId)
  })

  for (const w of workers) w.iniciar(cfg.pollIntervaloMs, cfg.latidoIntervaloMs)

  iniciarStatusHttp(cfg.statusHttpPuerto, () => workers.map((w) => w.estado))

  const apagar = (señal: string) => {
    log.info(`Recibida ${señal}, cerrando agente…`)
    for (const w of workers) w.detener()
    process.exit(0)
  }
  process.on('SIGINT', () => apagar('SIGINT'))
  process.on('SIGTERM', () => apagar('SIGTERM'))
  process.on('uncaughtException', (e) => log.error(`Excepción no capturada: ${e.stack ?? e.message}`))
  process.on('unhandledRejection', (e) => log.error(`Promesa rechazada sin capturar: ${String(e)}`))
}

main().catch((e) => {
  log.error(`No se pudo iniciar el agente: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
  process.exit(1)
})
