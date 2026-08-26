import { Socket } from 'node:net'

/**
 * Envío de TSPL por socket TCP plano (puerto 9100, sin autenticación).
 *
 * No se usa `node-thermal-printer` aquí a propósito: esa librería envuelve
 * todo en ESC/POS, que es justo lo que estas etiquetadoras ignoran en
 * silencio. Aquí se escriben los bytes tal cual.
 *
 * Codificación: la impresora está en code page 850, pero el generador ya
 * quitó acentos y comillas dobles, así que lo que sale es ASCII de 7 bits —
 * idéntico byte a byte en cp850 y en latin1. Por eso `latin1` es correcto y
 * no hace falta arrastrar una dependencia de tablas de códigos. Si algún día
 * se quisieran imprimir acentos, ese es el punto exacto que hay que cambiar.
 */

export interface OpcionesEnvio {
  ip: string
  puerto: number
  /** Tiempo máximo para conectar Y para terminar de escribir. */
  timeoutMs?: number
}

/** Trocea `tcp://192.168.1.95:9100` (o `192.168.1.95:9100`). */
export function parsearDestino(interfaz: string): { ip: string; puerto: number } {
  const limpio = interfaz.replace(/^tcp:\/\//i, '')
  const [ip, puerto] = limpio.split(':')
  if (!ip) throw new Error(`Interface inválida para TSPL: "${interfaz}" (se espera tcp://IP:PUERTO)`)
  return { ip, puerto: Number(puerto || 9100) }
}

/**
 * Comprueba que la impresora acepte conexiones antes de mandarle nada.
 *
 * Una etiquetadora apagada o con la IP cambiada no rechaza la conexión: el
 * socket simplemente no llega a abrirse. Sin este chequeo el agente daría el
 * trabajo por impreso y la comanda se perdería sin rastro.
 */
export async function estaViva(opts: OpcionesEnvio): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket()
    const cerrar = (vivo: boolean) => {
      s.destroy()
      resolve(vivo)
    }
    s.setTimeout(opts.timeoutMs ?? 4000)
    s.once('connect', () => cerrar(true))
    s.once('timeout', () => cerrar(false))
    s.once('error', () => cerrar(false))
    s.connect(opts.puerto, opts.ip)
  })
}

/** Abre, escribe el TSPL, espera a que salga por el cable y cierra. */
export async function enviarTSPL(tspl: string, opts: OpcionesEnvio): Promise<void> {
  const timeout = opts.timeoutMs ?? 8000

  await new Promise<void>((resolve, reject) => {
    const s = new Socket()
    let terminado = false

    const fallar = (e: Error) => {
      if (terminado) return
      terminado = true
      s.destroy()
      reject(e)
    }
    const listo = () => {
      if (terminado) return
      terminado = true
      s.end()
      resolve()
    }

    s.setTimeout(timeout)
    s.once('error', (e) => fallar(new Error(`${opts.ip}:${opts.puerto} — ${e.message}`)))
    s.once('timeout', () => fallar(new Error(`${opts.ip}:${opts.puerto} no respondió en ${timeout} ms.`)))
    s.once('connect', () => {
      // El callback de write se dispara cuando el búfer del sistema aceptó
      // los bytes. Cerrar antes de eso trunca la etiqueta a media línea.
      s.write(Buffer.from(tspl, 'latin1'), (e) => (e ? fallar(e) : listo()))
    })
    s.connect(opts.puerto, opts.ip)
  })
}
