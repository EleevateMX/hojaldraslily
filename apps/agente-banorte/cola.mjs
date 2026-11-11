// El agente de Banorte en modo COLA: cobra lo que la caja (en la nube) le
// manda, sin exponer ningún puerto a internet.
//
//     node index.mjs cola
//
// Es el mismo patrón del agente de tickets: reclama trabajos de SU terminal
// (por su token), los cobra en la pinpad por DLL, y reporta el resultado. Al
// aprobar, el SERVIDOR registra la venta por el camino de siempre
// (`fn_terminal_cobro_resultado` → `fn_cobrar_orden`/`_mixto`/encargo); aquí
// solo se habla con la pinpad. Si la venta no se pudo registrar con la tarjeta
// ya cobrada, el servidor responde `anular=true` y este agente la ANULA en la
// pinpad (la anulación del DLL vive en la PC).
//
// ## El DLL va en un PROCESO HIJO (no en este)
//
// El DLL rompe la red (Winsock) del proceso que lo carga: tras un `PPSendTxn`,
// todo `fetch` de ESE proceso falla para siempre. Por eso este proceso —el que
// habla con Supabase— NUNCA carga el DLL: cada operación de la pinpad corre en
// `pinpad-hijo.mjs` vía `ejecutarEnPinpad`, un hijo que se abre, cobra y muere.
// Así la red del agente nunca se cae, y el latido sigue vivo durante un cobro.
//
// Config adicional en `.env` (además de la de la pinpad):
//   SUPABASE_URL, SUPABASE_ANON_KEY  — el proyecto (la llave publicable, pública)
//   TERMINAL_TOKEN                   — el token de la terminal (Admin → Terminal)
//   AGENTE_ID                        — un nombre para esta PC (opcional)
//   COLA_POLL_SEGUNDOS (3), COLA_LATIDO_SEGUNDOS (30)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { voucherDesde, numeroDeControl } from './pinpad.mjs'
import { ejecutarEnPinpad } from './pinpad-remoto.mjs'

export const VERSION_COLA = '1.2.0'

// Dónde se guardan los cobros APROBADOS que no se pudieron reportar, para
// reenviarlos al arrancar. El dinero ya se cobró: esto evita que se pierda.
const PENDIENTES = join(dirname(fileURLToPath(import.meta.url)), 'pendientes.json')
// Cuántos fallos de RED seguidos (reclamar/latido) antes de reiniciar el
// proceso, para que correr-cola.bat lo levante limpio y reenvíe pendientes.
const MAX_FALLOS_RED = 10

function leerPendientes() {
  try { return existsSync(PENDIENTES) ? JSON.parse(readFileSync(PENDIENTES, 'utf8')) : [] } catch { return [] }
}
function escribirPendientes(lista) {
  try { writeFileSync(PENDIENTES, JSON.stringify(lista, null, 2)) } catch { /* disco lleno: ni modo */ }
}
function guardarPendiente(p) {
  const lista = leerPendientes()
  if (!lista.some((x) => x.cobro_id === p.cobro_id)) lista.push(p)
  escribirPendientes(lista)
}

export async function servirCola(cfg) {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_ANON_KEY?.trim()
  const token = process.env.TERMINAL_TOKEN?.trim()
  const falta = [!url && 'SUPABASE_URL', !key && 'SUPABASE_ANON_KEY', !token && 'TERMINAL_TOKEN'].filter(Boolean)
  if (falta.length) {
    console.error('Faltan datos en .env para la cola: ' + falta.join(', '))
    console.error('El token sale de Admin → Impresoras/Terminal → «Conectar la terminal».')
    process.exit(1)
  }
  const agente = process.env.AGENTE_ID?.trim() || 'agente-banorte-01'
  const pollMs = Number(process.env.COLA_POLL_SEGUNDOS?.trim() || '3') * 1000
  const latidoMs = Number(process.env.COLA_LATIDO_SEGUNDOS?.trim() || '30') * 1000

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const hora = () => new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Merida' })
  const log = (m) => console.log(`[${hora()}] ${m}`)
  const err = (m) => console.error(`[${hora()}] ERROR  ${m}`)

  // Ya NO se carga el DLL aquí: cada operación va en su proceso hijo.
  console.log('')
  console.log('  Hojaldras Lily — agente de Banorte (cola)')
  console.log(`  version ${VERSION_COLA} · modo ${cfg.mode} · pinpad ${cfg.com || `${cfg.ip}:${cfg.port}`}`)
  console.log('')
  if (cfg.mode !== 'PRD') log(`OJO: modo ${cfg.mode} — las ventas se APRUEBAN sin cobrar de verdad.`)

  // La red del agente ya no se rompe sola (el DLL vive en el hijo), pero si
  // internet se cae de verdad, se cuentan los fallos y se reinicia el proceso.
  let fallosRed = 0
  const exitoRed = () => { fallosRed = 0 }
  const falloRed = () => {
    if (++fallosRed >= MAX_FALLOS_RED) {
      err(`${MAX_FALLOS_RED} fallos de red seguidos: reinicio el agente (correr-cola.bat lo levanta).`)
      process.exit(1)
    }
  }

  const ctx = { log, err }

  // Al arrancar, reenvía cobros aprobados que quedaron sin reportar.
  await reenviarPendientes(sb, token, ctx)

  const latir = async () => {
    const { error } = await sb.rpc('fn_terminal_latido', { p_token: token, p_version: VERSION_COLA, p_modo: cfg.mode })
    if (error) { err(`latido: ${error.message}`); falloRed() } else exitoRed()
  }

  let ocupado = false
  const ciclo = async () => {
    if (ocupado) return
    ocupado = true
    try {
      // 1) Cobros de la caja (el camino del dinero).
      const { data, error } = await sb.rpc('fn_terminal_cola_reclamar', { p_token: token, p_agente: agente, p_limite: 1 })
      if (error) { err(`reclamando: ${error.message}`); falloRed() }
      else {
        exitoRed()
        for (const job of data ?? []) await cobrarUno(sb, cfg, token, job, ctx)
      }
      // 2) Diagnósticos de la matriz (verificación), que NO cobran ni registran
      //    venta: solo consultan la pinpad y guardan el voucher.
      const { data: diag, error: e2 } = await sb.rpc('fn_terminal_diag_reclamar', { p_token: token, p_agente: agente, p_limite: 1 })
      if (e2) { err(`reclamando diagnóstico: ${e2.message}`); falloRed() }
      else {
        exitoRed()
        for (const job of diag ?? []) await diagUno(sb, cfg, token, job, ctx)
      }
    } finally {
      ocupado = false
    }
  }

  await latir()
  setInterval(() => void latir(), latidoMs)
  log('conectado. Esperando cobros de la caja…')
  await ciclo()
  setInterval(() => void ciclo(), pollMs)
}

/** Reenvía al servidor los cobros aprobados que quedaron sin reportar. */
async function reenviarPendientes(sb, token, { log, err }) {
  const lista = leerPendientes()
  if (!lista.length) return
  log(`reenviando ${lista.length} cobro(s) aprobado(s) pendiente(s) de registrar…`)
  const quedan = []
  for (const p of lista) {
    const resp = await reportar(sb, token, p.cobro_id, p)
    if (resp) log(`pendiente ${p.cobro_id}: ${resp.registrada ? 'registrada ✓' : (resp.mensaje || 'reportada')}`)
    else { err(`pendiente ${p.cobro_id}: sigue sin poder reportarse`); quedan.push(p) }
  }
  escribirPendientes(quedan)
}

/** Cobra un trabajo en la pinpad (proceso hijo) y reporta el resultado. */
async function cobrarUno(sb, cfg, token, job, { log, err }) {
  const { cobro_id, monto, control_number } = job
  log(`cobrando ${Number(monto).toFixed(2)} (control ${control_number})…`)

  let r
  try {
    // El importe en PESOS con centavos; el número de control lo puso el servidor.
    r = await ejecutarEnPinpad({ op: 'venta', controlNumber: control_number, monto: String(monto) }, cfg)
  } catch (e) {
    // La pinpad no contestó. Se reporta como SIN RESPUESTA ('T'): la caja dirá
    // «revisa la pinpad», no «rechazada». Pudo cobrar o no; no se reintenta solo.
    err(`la pinpad falló: ${e.message}`)
    await reportar(sb, token, cobro_id, { aprobado: false, codigo: 'T', texto: e.message })
    return
  }

  const voucher = voucherDesde(r.campos)
  if (!r.aprobado) {
    const texto = r.campos.text || r.campos.paywCode || 'La tarjeta no se aprobó'
    log(`no aprobada (${r.resultado}): ${texto}`)
    await reportar(sb, token, cobro_id, { aprobado: false, voucher, crudo: r.campos, codigo: r.resultado, texto })
    return
  }

  // APROBADA: la tarjeta YA se cobró, así que reportar es crítico. Se reintenta
  // con espera creciente y, si aun así no entra, se guarda para reenviar al
  // arrancar — nunca se pierde en silencio.
  const payload = { aprobado: true, voucher, crudo: r.campos, codigo: r.resultado, texto: r.campos.text }
  const resp = await reportarConReintento(sb, token, cobro_id, payload, { log, err })
  if (!resp) return

  if (resp.registrada) {
    log(`aprobada y registrada ✓ (ref ${resp.referencia ?? '—'})`)
    return
  }

  // La tarjeta se cobró y la venta NO se registró: el servidor pide ANULAR en
  // la pinpad. Es el rollback distribuido: nunca un cobro sin venta.
  if (resp.anular) {
    err(`la venta no se registró (${resp.mensaje}). Anulando el cobro en la pinpad…`)
    if (resp.referencia && resp.autorizacion) {
      try {
        const a = await ejecutarEnPinpad({
          op: 'cancelar', controlNumber: numeroDeControl('V'),
          monto: String(resp.monto ?? monto), paywReference: resp.referencia, authCode: resp.autorizacion,
        }, cfg)
        err(a.aprobado ? 'anulación APROBADA. Avísale a gerencia.' : `la anulación NO entró (${a.campos.text || a.resultado}). Avísale a gerencia URGENTE.`)
      } catch (e) {
        err(`la anulación falló: ${e.message}. Avísale a gerencia URGENTE: hay un cobro sin venta (control ${control_number}).`)
      }
    } else {
      err(`no hay referencia/autorización para anular. Avísale a gerencia: cobro sin venta (control ${control_number}).`)
    }
  }
}

/**
 * Un DIAGNÓSTICO de la matriz (verificación de una transacción). No cobra ni
 * registra venta: consulta la pinpad por el número de control de una venta real
 * y guarda su voucher con `fn_terminal_diag_resultado`.
 */
async function diagUno(sb, cfg, token, job, { log, err }) {
  const { cobro_id, operacion, monto, control_number } = job
  log(`${operacion} (control ${control_number})…`)

  let r
  try {
    if (operacion === 'verificacion') {
      r = await ejecutarEnPinpad({ op: 'verificar', controlNumber: control_number }, cfg)
    } else if (operacion === 'cancelacion') {
      // La cancelación lleva la referencia y la autorización de la venta (van en
      // el voucher del trabajo); el control es uno nuevo, como en el rollback.
      r = await ejecutarEnPinpad({
        op: 'cancelar', controlNumber: numeroDeControl('V'),
        monto: String(monto), paywReference: job.referencia, authCode: job.autorizacion,
      }, cfg)
    } else {
      err(`operación de diagnóstico no soportada: ${operacion}`)
      return
    }
  } catch (e) {
    err(`la pinpad falló en ${operacion}: ${e.message}`)
    await reportarDiag(sb, token, cobro_id, { aprobado: false, codigo: 'T', texto: e.message })
    return
  }

  const voucher = voucherDesde(r.campos)
  await reportarDiag(sb, token, cobro_id, {
    aprobado: r.aprobado, voucher, crudo: r.campos, codigo: r.resultado,
    texto: r.campos.text ?? r.campos.paywCode ?? null,
  })
  log(`${operacion}: ${r.aprobado ? 'APROBADA' : (r.campos.text || r.resultado)}`)
}

/** Reporta el resultado de un diagnóstico (no mueve dinero). */
async function reportarDiag(sb, token, cobroId, { aprobado, voucher = null, crudo = null, codigo = null, texto = null }) {
  const { error } = await sb.rpc('fn_terminal_diag_resultado', {
    p_token: token, p_cobro_id: cobroId, p_aprobado: aprobado,
    p_voucher: voucher, p_crudo: crudo, p_codigo: codigo, p_texto: texto,
  })
  if (error) console.error(`reportando diagnóstico de ${cobroId}: ${error.message}`)
}

/**
 * Reporta un cobro APROBADO con reintentos (espera creciente). Si tras todos no
 * entra, lo guarda en pendientes para reenviarlo al arrancar. Idempotente: el
 * servidor devuelve lo de la primera vez si ya se había registrado, así que
 * reintentar nunca cobra dos veces.
 */
async function reportarConReintento(sb, token, cobroId, payload, { err }) {
  const esperas = [0, 1000, 2000, 4000, 8000]
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i]) await new Promise((r) => setTimeout(r, esperas[i]))
    const resp = await reportar(sb, token, cobroId, payload)
    if (resp) return resp
    err(`no se pudo reportar el cobro APROBADO ${cobroId} (intento ${i + 1}/${esperas.length})…`)
  }
  guardarPendiente({ cobro_id: cobroId, ...payload })
  err(`cobro ${cobroId} APROBADO sin poder reportar: guardado en pendientes.json para reenviar al reiniciar.`)
  return null
}

/** Reporta al servidor y devuelve su respuesta (o null si falló la llamada). */
async function reportar(sb, token, cobroId, { aprobado, voucher = null, crudo = null, codigo = null, texto = null }) {
  const { data, error } = await sb.rpc('fn_terminal_cobro_resultado', {
    p_token: token, p_cobro_id: cobroId, p_aprobado: aprobado,
    p_voucher: voucher, p_crudo: crudo, p_codigo: codigo, p_texto: texto,
  })
  if (error) {
    console.error(`reportando resultado de ${cobroId}: ${error.message}`)
    return null
  }
  return (data ?? [])[0] ?? { registrada: aprobado, anular: false }
}
