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
// Config adicional en `.env` (además de la de la pinpad):
//   SUPABASE_URL, SUPABASE_ANON_KEY  — el proyecto (la llave publicable, pública)
//   TERMINAL_TOKEN                   — el token de la terminal (Admin → Terminal)
//   AGENTE_ID                        — un nombre para esta PC (opcional)
//   COLA_POLL_SEGUNDOS (3), COLA_LATIDO_SEGUNDOS (30)

import { createClient } from '@supabase/supabase-js'
import { abrirPinpad, numeroDeControl, voucherDesde } from './pinpad.mjs'

export const VERSION_COLA = '1.1.0'

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

  // El DLL se carga UNA vez (el archivo siempre está; hablar con la pinpad es
  // lo que puede fallar, y eso pasa dentro de cada venta). Si ni el DLL carga,
  // no hay nada que hacer: se avisa y se sale.
  let pinpad
  try {
    pinpad = abrirPinpad(cfg)
  } catch (e) {
    err('no se pudo cargar el DLL: ' + e.message)
    process.exit(1)
  }

  console.log('')
  console.log('  Hojaldras Lily — agente de Banorte (cola)')
  console.log(`  version ${VERSION_COLA} · modo ${cfg.mode} · pinpad ${cfg.com || `${cfg.ip}:${cfg.port}`}`)
  console.log('')
  if (cfg.mode !== 'PRD') log(`OJO: modo ${cfg.mode} — las ventas se APRUEBAN sin cobrar de verdad.`)

  const latir = async () => {
    const { error } = await sb.rpc('fn_terminal_latido', { p_token: token, p_version: VERSION_COLA, p_modo: cfg.mode })
    if (error) err(`latido: ${error.message}`)
  }

  let ocupado = false
  const ciclo = async () => {
    if (ocupado) return
    ocupado = true
    try {
      // 1) Cobros de la caja (el camino del dinero, sin cambios).
      const { data, error } = await sb.rpc('fn_terminal_cola_reclamar', { p_token: token, p_agente: agente, p_limite: 1 })
      if (error) err(`reclamando: ${error.message}`)
      else for (const job of data ?? []) {
        await cobrarUno(sb, pinpad, token, job, { log, err })
      }
      // 2) Diagnósticos de la matriz (verificación), que NO cobran ni registran
      //    venta: solo consultan la pinpad y guardan el voucher.
      const { data: diag, error: e2 } = await sb.rpc('fn_terminal_diag_reclamar', { p_token: token, p_agente: agente, p_limite: 1 })
      if (e2) err(`reclamando diagnóstico: ${e2.message}`)
      else for (const job of diag ?? []) {
        await diagUno(sb, pinpad, token, job, { log, err })
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

/** Cobra un trabajo en la pinpad y reporta el resultado al servidor. */
async function cobrarUno(sb, pinpad, token, job, { log, err }) {
  const { cobro_id, monto, control_number } = job
  log(`cobrando ${Number(monto).toFixed(2)} (control ${control_number})…`)

  let r
  try {
    // El importe en PESOS con centavos; el número de control lo puso el servidor.
    r = pinpad.venta(control_number, String(monto))
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

  // Aprobada: el servidor registra la venta en el mismo acto.
  const resp = await reportar(sb, token, cobro_id, { aprobado: true, voucher, crudo: r.campos, codigo: r.resultado, texto: r.campos.text })
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
        const a = pinpad.cancelar(numeroDeControl('V'), String(resp.monto ?? monto), resp.referencia, resp.autorizacion)
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
 * y guarda su voucher con `fn_terminal_diag_resultado`. La caja lo sondea con
 * `fn_terminal_cobro_estado` (la misma que el cobro) y saca el voucher por la
 * térmica.
 */
async function diagUno(sb, pinpad, token, job, { log, err }) {
  const { cobro_id, operacion, monto, control_number } = job
  log(`${operacion} (control ${control_number})…`)

  let r
  try {
    if (operacion === 'verificacion') {
      r = pinpad.verificar(control_number)
    } else if (operacion === 'cancelacion') {
      // La cancelación lleva la referencia y la autorización de la venta (van en
      // el voucher del trabajo); el control es uno nuevo, como en el rollback.
      r = pinpad.cancelar(numeroDeControl('V'), String(monto), job.referencia, job.autorizacion)
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
