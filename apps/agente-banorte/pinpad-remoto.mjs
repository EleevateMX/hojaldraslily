// Ejecuta una operación de la pinpad en un PROCESO HIJO de vida corta
// (`pinpad-hijo.mjs`) y devuelve su resultado.
//
// El DLL rompe la red (Winsock) del proceso que lo carga; aislándolo en un hijo
// que muere al terminar, el proceso principal —el que habla con Supabase— nunca
// toca el DLL y su red sigue sana. Beneficio extra: como `PPSendTxn` es
// síncrono y bloquea hasta 90 s, meterlo en el hijo deja el latido del padre
// vivo durante un cobro.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const HIJO = join(aqui, 'pinpad-hijo.mjs')

/**
 * @param {{op:'llave'|'venta'|'verificar'|'cancelar', controlNumber?:string, monto?:string|number, paywReference?:string, authCode?:string}} op
 * @param {{timeout?:string|number}} cfg
 * @returns {Promise<{resultado:string, aprobado:boolean, campos:object}>}
 */
export function ejecutarEnPinpad(op, cfg) {
  return new Promise((resolve, reject) => {
    // El DLL espera la tarjeta hasta `timeout` (90 s); se le da un margen para
    // arrancar el proceso y leer la respuesta.
    const timeoutMs = (Number(cfg?.timeout || 90) + 15) * 1000

    const hijo = spawn(process.execPath, [HIJO], {
      cwd: aqui,
      // stderr del hijo va directo a la consola del padre (para ver errores del DLL).
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    let salida = ''
    let terminado = false
    const unaVez = (fn) => (...a) => { if (!terminado) { terminado = true; clearTimeout(reloj); fn(...a) } }
    const ok = unaVez(resolve)
    const falla = unaVez(reject)

    const reloj = setTimeout(() => {
      try { hijo.kill('SIGKILL') } catch { /* ya salió */ }
      falla(new Error(`la pinpad no contestó en ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    hijo.stdout.on('data', (c) => { salida += c })
    hijo.on('error', (e) => falla(new Error('no se pudo lanzar el proceso de la pinpad: ' + e.message)))
    hijo.on('close', (code) => {
      // La última línea no vacía de stdout es la respuesta JSON.
      const linea = salida.split('\n').map((s) => s.trim()).filter(Boolean).pop()
      let obj = null
      if (linea) { try { obj = JSON.parse(linea) } catch { /* no era JSON */ } }
      if (obj && obj.error) return falla(new Error(obj.error))
      if (code !== 0 || !obj || typeof obj.resultado === 'undefined') {
        return falla(new Error(`el proceso de la pinpad terminó sin respuesta válida (código ${code})`))
      }
      ok({ resultado: obj.resultado, aprobado: !!obj.aprobado, campos: obj.campos || {} })
    })

    // La operación va por stdin. La contraseña NO viaja aquí: el hijo la lee del .env.
    try {
      hijo.stdin.write(JSON.stringify(op))
      hijo.stdin.end()
    } catch (e) {
      falla(new Error('no se pudo enviar la operación a la pinpad: ' + e.message))
    }
  })
}
