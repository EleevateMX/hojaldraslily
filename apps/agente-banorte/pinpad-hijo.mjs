// Proceso HIJO de vida corta: carga el DLL, hace UNA operación en la pinpad y
// termina.
//
// ## Por qué existe
//
// El DLL de Banorte (cargado con koffi) ROMPE la red del proceso que lo usa:
// después de cualquier `PPSendTxn` (llave, venta, verificación), todo `fetch`
// del proceso falla con «TypeError: fetch failed» y no se recupera —es
// consistente con que el DLL cierre Winsock (WSACleanup) al terminar—. En el
// modo cola eso dejaba la tarjeta cobrada pero la venta sin registrar, y el
// agente sordo.
//
// La cura: cada operación del DLL corre AQUÍ, en un proceso aparte que se abre,
// cobra y muere. El proceso principal —el que habla con Supabase— nunca carga
// el DLL, así que su red nunca se rompe.
//
// Protocolo: recibe la operación por stdin como JSON
//   { op:'llave'|'venta'|'verificar'|'cancelar', controlNumber?, monto?, paywReference?, authCode? }
// y escribe por stdout UNA línea JSON: { resultado, aprobado, campos } (o
// { error } si algo falló), y sale. La contraseña de Payworks NO entra por
// argumentos: se lee del .env (dotenv), igual que el padre.

import 'dotenv/config'
import { abrirPinpad, numeroDeControl } from './pinpad.mjs'
import { cfgDesdeEnv } from './config.mjs'

/** Escribe la respuesta y sale SOLO cuando stdout terminó de vaciarse (en
 *  Windows, `process.exit` justo tras `write` puede cortar la salida). */
function salir(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n', () => process.exit(code))
}

function leerStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { data += c })
    process.stdin.on('end', () => resolve(data))
    // Si nadie manda nada, no nos colgamos para siempre: el padre tiene su
    // propio timeout, pero esto evita un hijo huérfano esperando stdin.
    setTimeout(() => resolve(data), 5000).unref?.()
  })
}

async function main() {
  const entrada = (await leerStdin()).trim()
  let op
  try { op = JSON.parse(entrada || '{}') } catch {
    return salir({ error: 'JSON de entrada inválido' }, 1)
  }

  const cfg = cfgDesdeEnv()

  let pinpad
  try {
    pinpad = abrirPinpad(cfg)
  } catch (e) {
    return salir({ error: 'no se pudo cargar el DLL: ' + (e?.message || String(e)) }, 1)
  }

  try {
    const ctrl = op.controlNumber
    let r
    switch (op.op) {
      case 'llave':     r = pinpad.cargarLlave(ctrl || numeroDeControl('LLAVE')); break
      case 'venta':     r = pinpad.venta(ctrl || numeroDeControl('L'), String(op.monto)); break
      case 'verificar': r = pinpad.verificar(ctrl); break
      case 'cancelar':  r = pinpad.cancelar(ctrl || numeroDeControl('V'), String(op.monto), op.paywReference, op.authCode); break
      default:          return salir({ error: 'operación desconocida: ' + op.op }, 1)
    }
    return salir({ resultado: r.resultado, aprobado: r.aprobado, campos: r.campos }, 0)
  } catch (e) {
    return salir({ error: 'La transacción falló: ' + (e?.message || String(e)) }, 1)
  }
}

main()
