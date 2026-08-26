/**
 * Diagnóstico del agente de impresión — pensado para que un operador en
 * sitio (no necesariamente quien programó esto) pueda correr un comando y
 * saber exactamente qué funciona y qué no, antes de dar por buena una
 * instalación.
 *
 *   pnpm diagnose                 → revisa TODAS las impresoras de printers.config.json
 *   pnpm diagnose <printerId>     → revisa solo esa
 *   pnpm diagnose --imprimir      → además intenta una impresión física de prueba
 *                                    (caracteres especiales + corte) en cada impresora
 *
 * IMPORTANTE — honestidad sobre qué se validó y qué no:
 * Este comando prueba automáticamente la conexión a Supabase, la
 * autenticación del token, que la sucursal/estación coincidan con lo que
 * dice el servidor, y el estado de la cola. Eso es "prueba automatizada".
 * La conexión USB/red a la impresora física y la impresión de prueba
 * (--imprimir) SOLO se ejecutan y SOLO significan algo si hay hardware real
 * u otro emulador conectado en esta máquina — nunca se marcan como "ok" sin
 * intentarlo de verdad, y si no hay --imprimir, quedan explícitamente
 * marcadas como "pendiente de hardware", no como si ya se hubieran probado.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cargarConfig } from './config.js'
import { crearImpresora, escribirComanda } from './comanda.js'
import type { PrinterConfig, TrabajoImpresion } from './types.js'
import { log } from './log.js'

type Estado = 'ok' | 'warn' | 'fail' | 'skip'

interface Chequeo {
  nombre: string
  estado: Estado
  detalle: string
}

const SIMBOLO: Record<Estado, string> = { ok: '✔', warn: '⚠', fail: '✘', skip: '·' }

function agregar(lista: Chequeo[], nombre: string, estado: Estado, detalle: string): void {
  lista.push({ nombre, estado, detalle })
  console.log(`  ${SIMBOLO[estado]} ${nombre}: ${detalle}`)
}

interface FilaDiagnostico {
  id: string
  sucursal_id: string | null
  sucursal_nombre: string | null
  nombre: string
  cocina_id: string | null
  cocina_nombre: string | null
  tipo_conexion: 'red' | 'usb'
  ip: string | null
  puerto: number | null
  nombre_dispositivo: string | null
  ancho_papel: '58mm' | '80mm'
  copias: number
  corte_automatico: boolean
  buzzer: boolean
  activa: boolean
  ultima_conexion: string | null
  ultima_impresion: string | null
}

async function diagnosticarImpresora(
  sb: SupabaseClient,
  cfg: PrinterConfig,
  intentarImprimir: boolean,
): Promise<Chequeo[]> {
  const chequeos: Chequeo[] = []
  console.log(`\n— Impresora "${cfg.id}" (${cfg.descripcion ?? 'sin descripción'}) —`)

  // 1) Conexión a Supabase + autenticación del token + sucursal/estación,
  // todo en una sola llamada de solo-lectura escopada al propio token.
  let fila: FilaDiagnostico | null = null
  try {
    const { data, error } = await sb.rpc('fn_diagnostico_impresora', { p_token: cfg.token })
    if (error) {
      agregar(chequeos, 'Conexión a Supabase', 'fail', `Error de red o RPC: ${error.message}`)
      return chequeos
    }
    agregar(chequeos, 'Conexión a Supabase', 'ok', 'Respuesta recibida del proyecto')

    const filas = (data ?? []) as FilaDiagnostico[]
    if (filas.length === 0) {
      agregar(
        chequeos,
        'Autenticación (token)',
        'fail',
        'El token no corresponde a ninguna impresora en la base — revisa printers.config.json contra Admin → Impresoras',
      )
      return chequeos
    }
    fila = filas[0]
    agregar(chequeos, 'Autenticación (token)', 'ok', 'Token válido y reconocido por el servidor')
  } catch (e) {
    agregar(chequeos, 'Conexión a Supabase', 'fail', e instanceof Error ? e.message : String(e))
    return chequeos
  }

  agregar(
    chequeos,
    'Sucursal',
    fila.sucursal_nombre ? 'ok' : 'warn',
    fila.sucursal_nombre ? `${fila.sucursal_nombre} (${fila.sucursal_id})` : 'La impresora no tiene sucursal asignada',
  )
  agregar(
    chequeos,
    'Estación (cocina/barra)',
    fila.cocina_nombre ? 'ok' : 'warn',
    fila.cocina_nombre ? fila.cocina_nombre : 'Sin estación asignada — no recibirá comandas de ningún pedido',
  )
  agregar(
    chequeos,
    'Impresora activa en Admin',
    fila.activa ? 'ok' : 'fail',
    fila.activa ? 'Sí' : 'NO — está desactivada; el agente no podrá reclamar trabajos hasta que se reactive en Admin → Impresoras',
  )

  // 2) Coherencia entre printers.config.json (local) y lo que dice el servidor.
  const discrepancias: string[] = []
  if (fila.tipo_conexion !== (cfg.interface.startsWith('tcp://') ? 'red' : 'usb')) {
    discrepancias.push(`tipo de conexión: servidor="${fila.tipo_conexion}" vs interface local="${cfg.interface}"`)
  }
  if (fila.ancho_papel !== cfg.anchoPapel) {
    discrepancias.push(`ancho de papel: servidor="${fila.ancho_papel}" vs local="${cfg.anchoPapel}"`)
  }
  if (fila.corte_automatico !== cfg.corteAutomatico) {
    discrepancias.push(`corte automático: servidor=${fila.corte_automatico} vs local=${cfg.corteAutomatico}`)
  }
  if (fila.copias !== cfg.copias) {
    discrepancias.push(`copias: servidor=${fila.copias} vs local=${cfg.copias}`)
  }
  agregar(
    chequeos,
    'Config local vs. servidor',
    discrepancias.length === 0 ? 'ok' : 'warn',
    discrepancias.length === 0
      ? 'printers.config.json coincide con Admin → Impresoras'
      : discrepancias.join('; '),
  )

  // 3) Latido — confirma escritura real (no solo lectura) con este token.
  try {
    const { error } = await sb.rpc('fn_imprimir_latido', { p_token: cfg.token })
    agregar(chequeos, 'Latido (escritura autenticada)', error ? 'fail' : 'ok', error ? error.message : 'fn_imprimir_latido respondió correctamente')
  } catch (e) {
    agregar(chequeos, 'Latido (escritura autenticada)', 'fail', e instanceof Error ? e.message : String(e))
  }

  // 4) Estado de la cola de ESTA impresora (lectura directa, tabla pública de solo-lectura).
  try {
    const { data, error } = await sb
      .from('trabajos_impresion')
      .select('estado')
      .eq('printer_id', fila.id)
      .in('estado', ['pending', 'claimed', 'printing', 'retry', 'failed'])
    if (error) {
      agregar(chequeos, 'Cola de impresión', 'warn', `No se pudo leer: ${error.message}`)
    } else {
      const conteos: Record<string, number> = {}
      for (const t of data ?? []) conteos[t.estado] = (conteos[t.estado] ?? 0) + 1
      const fallidos = conteos.failed ?? 0
      const detalle =
        Object.keys(conteos).length === 0
          ? 'Sin trabajos pendientes'
          : Object.entries(conteos).map(([estado, n]) => `${estado}=${n}`).join(', ')
      agregar(chequeos, 'Cola de impresión', fallidos > 0 ? 'warn' : 'ok', detalle)
    }
  } catch (e) {
    agregar(chequeos, 'Cola de impresión', 'warn', e instanceof Error ? e.message : String(e))
  }

  // 5) Conexión física USB/red — esto SÍ requiere hardware real conectado
  // en esta máquina; si no hay nada conectado, se reporta como fail, no
  // como "pendiente" (si el comando corrió, sí lo intentó).
  const printer = crearImpresora(cfg)
  let conectada = false
  try {
    conectada = await printer.isPrinterConnected()
  } catch {
    conectada = false
  }
  agregar(
    chequeos,
    `Conexión física (${cfg.interface})`,
    conectada ? 'ok' : 'fail',
    conectada ? 'La impresora respondió' : 'No responde — revisa cable/IP/puerto/encendido',
  )

  // 6) Impresión de prueba (caracteres especiales + corte) — solo con
  // --imprimir, y solo tiene sentido si el paso anterior conectó de verdad.
  if (!intentarImprimir) {
    agregar(
      chequeos,
      'Impresión física de prueba',
      'skip',
      'No solicitada (usa --imprimir). PENDIENTE DE HARDWARE: no se ha validado que esta impresora imprima correctamente acentos/eñes ni que corte el papel.',
    )
  } else if (!conectada) {
    agregar(chequeos, 'Impresión física de prueba', 'fail', 'No se intentó: la impresora no está conectada')
  } else {
    try {
      const trabajoDePrueba: TrabajoImpresion = {
        id: 'diagnostico-local',
        orden_id: null,
        pedido_id: null,
        estacion_id: null,
        printer_id: null,
        tipo_documento: 'comanda',
        payload: {
          folio: 0,
          canal: 'pos',
          estacion: cfg.descripcion ?? cfg.id,
          creado_en: new Date().toISOString(),
          cajero: 'Diagnóstico',
          items: [
            { cantidad: 1, nombre: 'Prueba de acentuación: ñoño, café, corazón' },
            { cantidad: 2, nombre: 'Shake de Piña', personalizacion: 'sin azúcar, extra fresa' },
          ],
        },
        estado: 'claimed',
        intentos: 0,
        max_intentos: 5,
        numero_copia: 1,
        created_at: new Date().toISOString(),
      }
      printer.clear()
      escribirComanda(printer, trabajoDePrueba, 1)
      if (cfg.corteAutomatico) printer.cut()
      await printer.execute()
      agregar(
        chequeos,
        'Impresión física de prueba',
        'ok',
        'Se envió el trabajo — VERIFICA VISUALMENTE en el papel que los acentos/eñes salgan legibles y que haya cortado',
      )
    } catch (e) {
      agregar(chequeos, 'Impresión física de prueba', 'fail', e instanceof Error ? e.message : String(e))
    }
  }

  return chequeos
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const intentarImprimir = argv.includes('--imprimir')
  const printerIdArg = argv.find((a) => !a.startsWith('--'))

  console.log('Hojaldras Lily — diagnóstico del agente de impresión')
  console.log('='.repeat(50))

  const cfg = cargarConfig()
  console.log(`Agente: ${cfg.agenteId}`)
  console.log(`Supabase: ${cfg.supabaseUrl}`)

  const printers = printerIdArg ? cfg.printers.filter((p) => p.id === printerIdArg) : cfg.printers
  if (printers.length === 0) {
    console.error(`No existe la impresora "${printerIdArg}" en printers.config.json`)
    process.exit(1)
  }

  const sb: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)

  const reporte: { printerId: string; chequeos: Chequeo[] }[] = []
  for (const p of printers) {
    const chequeos = await diagnosticarImpresora(sb, p, intentarImprimir)
    reporte.push({ printerId: p.id, chequeos })
  }

  const totalFail = reporte.flatMap((r) => r.chequeos).filter((c) => c.estado === 'fail').length
  const totalWarn = reporte.flatMap((r) => r.chequeos).filter((c) => c.estado === 'warn').length

  console.log('\n' + '='.repeat(50))
  console.log(`Resumen: ${totalFail} fallo(s), ${totalWarn} advertencia(s)`)
  if (!intentarImprimir) {
    console.log('Nota: no se probó impresión física (usa --imprimir). Ningún resultado de esta corrida certifica que el papel salga bien.')
  }

  await exportarDiagnostico(cfg.agenteId, reporte)

  for (const r of reporte) {
    for (const c of r.chequeos) log.info(`[diagnose] ${r.printerId} — ${c.nombre}: ${c.estado} — ${c.detalle}`)
  }

  process.exit(totalFail > 0 ? 1 : 0)
}

/**
 * Exporta el diagnóstico a un archivo de texto plano, fácil de mandar por
 * WhatsApp/correo a soporte. Nunca incluye el token del agente ni ningún
 * otro secreto — solo nombres, estados e IDs no sensibles.
 */
async function exportarDiagnostico(agenteId: string, reporte: { printerId: string; chequeos: Chequeo[] }[]): Promise<string> {
  const dir = join(process.cwd(), 'logs')
  await mkdir(dir, { recursive: true })
  const archivo = join(dir, `diagnostico-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`)

  const lineas: string[] = []
  lineas.push('Hojaldras Lily — diagnóstico del agente de impresión')
  lineas.push(`Agente: ${agenteId}`)
  lineas.push(`Fecha: ${new Date().toLocaleString('es-MX')}`)
  lineas.push('')
  for (const r of reporte) {
    lineas.push(`Impresora "${r.printerId}"`)
    for (const c of r.chequeos) lineas.push(`  ${SIMBOLO[c.estado]} ${c.nombre}: ${c.detalle}`)
    lineas.push('')
  }

  await writeFile(archivo, lineas.join('\n'), 'utf8')
  console.log(`\nDiagnóstico exportado (sin secretos) a: ${archivo}`)
  return archivo
}

main().catch((e) => {
  console.error('El diagnóstico falló inesperadamente:', e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
