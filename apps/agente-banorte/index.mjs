// Agente de Banorte por DLL — línea de comandos y servidor local.
//
// Corre en la PC de la tienda (Windows), junto a PINPAD.TPV. Sirve para dos
// cosas:
//
//   1. PROBAR que la pinpad conecta y transacciona, sin escribir código:
//        node index.mjs llave          (carga de llaves; no cobra)
//        node index.mjs venta 10.00    (una venta; en modo AUT no cobra)
//        node index.mjs verificar L...
//        node index.mjs cancelar <paywReference> <authCode> <monto>
//
//   2. Quedar escuchando en la red local para que la caja le pida cobros:
//        node index.mjs serve
//      Levanta un servidor en PUERTO_HTTP con POST /llave, /venta, /cancelar,
//      /verificar. Es para pruebas desde la misma red; la integración final
//      con la caja en la nube conviene hacerla por cola (como el agente de
//      tickets), no exponiendo este puerto a internet.
//
// La configuración vive en `.env` (ver `.env.example`). Empieza SIEMPRE en
// PAYWORKS_MODE=AUT: en AUT la transacción se aprueba sin cobrarle a ninguna
// tarjeta. Solo se pasa a PRD cuando la prueba de punta a punta sale bien.

import 'dotenv/config'
import { createServer } from 'node:http'
import { abrirPinpad, numeroDeControl, voucherDesde } from './pinpad.mjs'

function cfgDesdeEnv() {
  const falta = []
  const req = (k) => { const v = process.env[k]?.trim(); if (!v) falta.push(k); return v }
  const cfg = {
    dllPath: process.env.DLL_PATH?.trim() || './PINPAD.TPV',
    ip: process.env.PINPAD_IP?.trim() || null,
    port: process.env.PINPAD_PORT?.trim() || '1818',
    com: process.env.PINPAD_COM?.trim() || null,
    user: req('PAYWORKS_USER'),
    password: req('PAYWORKS_PASSWORD'),
    group: req('PAYWORKS_GROUP'),
    mode: (process.env.PAYWORKS_MODE?.trim() || 'AUT').toUpperCase(),
    getterStyle: (process.env.GETTER_STYLE?.trim() || 'buffer').toLowerCase(),
    timeout: process.env.TIMEOUT?.trim() || '90',
    puertoHttp: Number(process.env.PUERTO_HTTP?.trim() || '8099'),
  }
  if (!cfg.com && !cfg.ip) falta.push('PINPAD_IP (o PINPAD_COM)')
  if (!['PRD', 'AUT', 'DEC', 'RND'].includes(cfg.mode)) falta.push('PAYWORKS_MODE (PRD|AUT|DEC|RND)')
  if (falta.length) {
    console.error('Faltan datos en .env: ' + falta.join(', '))
    process.exit(1)
  }
  return cfg
}

function resumen(cfg, op, r) {
  const c = r.campos
  const linea = (k, v) => (v ? `  ${k.padEnd(16)} ${v}\n` : '')
  const sello = { A: 'APROBADA', D: 'DECLINADA', R: 'RECHAZADA', T: 'SIN RESPUESTA', '?': 'NO ENTENDIDA' }[r.resultado]
  return (
    `\n[${op}] modo ${cfg.mode} -> ${sello} (${r.resultado})\n` +
    linea('Mensaje', c.text) +
    linea('Motivo', c.paywCode) +
    linea('Afiliacion', c.affiliation) +
    linea('No. control', c.controlNumber) +
    linea('Autorizacion', c.authCode) +
    linea('Referencia', c.authResult) +
    linea('Tarjeta', [c.cardBrand, c.cardType, c.pan].filter(Boolean).join(' ')) +
    linea('Emisor', c.issuingBank) +
    linea('Entrada', c.entryMode) +
    linea('AID', c.appId) +
    linea('Aplicacion', c.appPrefName || c.appLabel) +
    linea('TVR', c.tvr)
  )
}

async function main() {
  const cfg = cfgDesdeEnv()
  const [comando, ...args] = process.argv.slice(2)

  // El servidor local no abre el DLL hasta que llega una petición, para que
  // levantar el servicio no falle si la pinpad está apagada en ese momento.
  if (comando === 'serve') return servir(cfg)

  console.log(`DLL: ${cfg.dllPath} · pinpad: ${cfg.com || `${cfg.ip}:${cfg.port}`} · getters: ${cfg.getterStyle}`)
  let pinpad
  try {
    pinpad = abrirPinpad(cfg)
  } catch (e) {
    console.error('No se pudo cargar el DLL:', e.message)
    console.error('Revisa que PINPAD.TPV esté junto a este programa y que Node sea de 32 o 64 bits según el DLL.')
    process.exit(1)
  }

  try {
    if (comando === 'llave') {
      console.log(resumen(cfg, 'OBTENER_LLAVE', pinpad.cargarLlave(numeroDeControl('LLAVE'))))
    } else if (comando === 'venta') {
      const monto = args[0]
      if (!monto) { console.error('Uso: node index.mjs venta <monto en pesos, ej 10.00>'); process.exit(1) }
      const r = pinpad.venta(numeroDeControl('L'), monto)
      console.log(resumen(cfg, 'VENTA', r))
      if (r.aprobado) console.log('Voucher:', JSON.stringify(voucherDesde(r.campos), null, 2))
    } else if (comando === 'verificar') {
      if (!args[0]) { console.error('Uso: node index.mjs verificar <numeroDeControl>'); process.exit(1) }
      console.log(resumen(cfg, 'VERIFICACION', pinpad.verificar(args[0])))
    } else if (comando === 'cancelar') {
      const [ref, auth, monto] = args
      if (!ref || !auth || !monto) { console.error('Uso: node index.mjs cancelar <paywReference> <authCode> <monto>'); process.exit(1) }
      console.log(resumen(cfg, 'CANCELACION', pinpad.cancelar(numeroDeControl('V'), monto, ref, auth)))
    } else {
      console.log('Comandos: llave | venta <monto> | verificar <control> | cancelar <ref> <auth> <monto> | serve')
      process.exit(1)
    }
  } catch (e) {
    console.error('La transacción falló:', e.message)
    process.exit(1)
  }
}

function servir(cfg) {
  const srv = createServer((req, res) => {
    const responder = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    if (req.method !== 'POST') return responder(405, { ok: false, error: 'usa POST' })
    let cuerpo = ''
    req.on('data', (c) => { cuerpo += c; if (cuerpo.length > 1e5) req.destroy() })
    req.on('end', () => {
      let body = {}
      try { body = cuerpo ? JSON.parse(cuerpo) : {} } catch { return responder(400, { ok: false, error: 'JSON inválido' }) }
      let pinpad
      try { pinpad = abrirPinpad(cfg) } catch (e) { return responder(500, { ok: false, error: 'no se pudo cargar el DLL: ' + e.message }) }
      try {
        const ruta = req.url?.replace(/\/+$/, '')
        let r
        if (ruta === '/llave') r = pinpad.cargarLlave(numeroDeControl('LLAVE'))
        else if (ruta === '/venta') r = pinpad.venta(numeroDeControl('L'), body.monto)
        else if (ruta === '/verificar') r = pinpad.verificar(body.controlNumber)
        else if (ruta === '/cancelar') r = pinpad.cancelar(numeroDeControl('V'), body.monto, body.paywReference, body.authCode)
        else return responder(404, { ok: false, error: 'ruta desconocida' })
        responder(200, { ok: r.aprobado, estado: r.resultado, modo: cfg.mode, voucher: voucherDesde(r.campos), campos: r.campos })
      } catch (e) {
        responder(500, { ok: false, error: e.message })
      }
    })
  })
  // Solo escucha en la red local; nunca se expone a internet (el DLL cobra).
  srv.listen(cfg.puertoHttp, () => {
    console.log(`Agente de Banorte escuchando en http://localhost:${cfg.puertoHttp}`)
    console.log('POST /llave · /venta {monto} · /verificar {controlNumber} · /cancelar {paywReference, authCode, monto}')
    console.log(`Modo ${cfg.mode} · pinpad ${cfg.com || `${cfg.ip}:${cfg.port}`}`)
  })
}

main()
