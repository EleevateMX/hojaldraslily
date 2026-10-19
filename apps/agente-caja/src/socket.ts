/**
 * Envío crudo al puerto 9100.
 *
 * **Portado tal cual del agente de caja de Shakeaholic.** La lección que
 * vale está en el comentario del `write`: el callback solo dice que el
 * kernel aceptó los bytes, NO que la impresora los imprimió.
 *
 * Es el mismo modo de fallo silencioso que ya tiene anotado el ticket por
 * `window.print()` — la venta queda bien cobrada y el papel nunca salió.
 */
import net from 'node:net'

/**
 * Envio crudo al puerto 9100.
 *
 * Se comprueba que la impresora acepte la conexion ANTES de dar el trabajo
 * por bueno. Un socket a una impresora apagada falla rapido, pero escribir
 * "al vacio" sin verificar es como se pierde un ticket sin que nadie se
 * entere: la cola lo marca impreso y el papel nunca salio.
 */
export function enviar(datos: Buffer, host: string, puerto: number, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = new net.Socket()
    let listo = false
    const fallar = (e: Error) => { if (!listo) { listo = true; s.destroy(); reject(e) } }

    s.setTimeout(timeoutMs)
    s.on('timeout', () => fallar(new Error(`Timeout hablando con ${host}:${puerto}`)))
    s.on('error', (e) => fallar(new Error(`${host}:${puerto} — ${e.message}`)))
    s.on('connect', () => {
      s.write(datos, () => {
        // El callback de write solo dice que el kernel acepto los bytes, NO
        // que la impresora los imprimio. Estos modulos Ethernut descartan lo
        // que tengan pendiente cuando les llega el FIN, asi que cerrar de
        // inmediato corta el ticket por donde se quedo.
        //
        // La espera se calcula sobre el tamaño real: una térmica de 80 mm imprime a
        // 260 mm/s y su buffer es chico, asi que ~1 ms por cada 20 bytes
        // cubre con holgura, con un piso de medio segundo. Un ticket de
        // 10 KB con logo espera ~1 s; uno de texto suelto, el minimo.
        const espera = Math.min(8000, Math.max(500, Math.ceil(datos.length / 20)))
        setTimeout(() => s.end(), espera)
      })
    })
    s.on('close', () => { if (!listo) { listo = true; resolve() } })
    s.connect(puerto, host)
  })
}

/** ¿Acepta conexiones? No garantiza papel, pero descarta apagada/desconectada. */
export function estaViva(host: string, puerto: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket()
    const cerrar = (v: boolean) => { s.destroy(); resolve(v) }
    s.setTimeout(timeoutMs)
    s.on('timeout', () => cerrar(false))
    s.on('error', () => cerrar(false))
    s.on('connect', () => cerrar(true))
    s.connect(puerto, host)
  })
}
