import { createServer } from 'node:http'
import type { EstadoWorker } from './worker.js'
import { log } from './log.js'

/**
 * Endpoint local de solo lectura: http://localhost:PUERTO/status
 * Para ver de un vistazo si el agente sigue vivo y cómo van sus
 * impresoras, sin necesidad de una interfaz gráfica (Electron no aporta
 * suficiente valor extra para esta primera versión — ver
 * docs/instalacion-agente-impresion.md, sección "interfaz gráfica").
 */
export function iniciarStatusHttp(puerto: number, obtenerEstados: () => EstadoWorker[]): void {
  if (puerto <= 0) return

  const servidor = createServer((req, res) => {
    if (req.url !== '/status') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Solo existe /status' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ agente: process.pid, ahora: new Date().toISOString(), impresoras: obtenerEstados() }, null, 2))
  })

  servidor.listen(puerto, () => {
    log.info(`Estado disponible en http://localhost:${puerto}/status`)
  })
}
