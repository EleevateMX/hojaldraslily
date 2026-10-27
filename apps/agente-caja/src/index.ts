/**
 * El agente de tickets de caja.
 *
 * Corre en la PC de la tienda, reclama de la cola los trabajos de tipo
 * `ticket` que le tocan a su impresora, los imprime por ESC/POS en el puerto
 * 9100 y los confirma. Late cada medio minuto con su versión.
 *
 * ## Por qué es un programa aparte del de etiquetas
 *
 * Los dos corren en la misma PC al mismo tiempo sin estorbarse: si uno se
 * cae, el otro sigue imprimiendo. Esa separación es deliberada — una
 * etiquetadora atorada no puede dejar al mostrador sin tickets, ni al revés.
 *
 * ## Qué resuelve respecto a `window.print()`
 *
 * Hoy el ticket va de Chrome a la impresora predeterminada de Windows. Eso
 * funciona, pero si la predeterminada es la equivocada **no hay ningún
 * error**: la venta queda bien cobrada y el papel se va a un PDF. Aquí el
 * trabajo se confirma contra la base solo cuando la impresora aceptó los
 * bytes, así que un ticket que no salió se ve en Admin.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
// Del submódulo sin DOM, no del índice de `@lily/ui`: ese arrastra React y
// el `imprimirTicket` que toca `document`, y aquí no hay navegador.
import { NEGOCIO_DEFAULT, type TicketNegocio } from '@lily/ui/tipos'
import { COLUMNAS_80MM, COLUMNAS_58MM } from '@lily/ui/papel'
import { construirDocumento, type TrabajoCaja } from './render.js'
import { enviar, estaViva } from './socket.js'
import { imprimirWindows } from './windows.js'
import { revisarActualizacion } from './autoactualizar.js'

const VERSION = '1.1.2'

function requerido(clave: string): string {
  const v = process.env[clave]?.trim()
  if (!v) {
    console.error(`Falta ${clave} en el .env. Copia .env.example y llenalo.`)
    process.exit(1)
  }
  return v
}

const SUPABASE_URL = requerido('SUPABASE_URL')
const SUPABASE_ANON_KEY = requerido('SUPABASE_ANON_KEY')
const TOKEN = requerido('IMPRESORA_TOKEN')
// Dos formas de salida: por RED (host:9100) o por USB a una impresora de
// WINDOWS por su nombre (p. ej. "POS-58"). Si IMPRESORA_WINDOWS está puesto,
// ese manda y HOST ya no hace falta.
const WINDOWS = process.env.IMPRESORA_WINDOWS?.trim() || ''
const HOST = WINDOWS ? '' : requerido('IMPRESORA_HOST')
const PUERTO = Number(process.env.IMPRESORA_PUERTO || 9100)
// La casa pidió imprimir la original para el cliente y una copia (27/10/26).
// Solo aplica al ticket de venta; una prueba o un corte salen una vez.
const COPIAS_TICKET = Math.max(1, Math.round(Number(process.env.TICKET_COPIAS || 2)))
// El ancho del papel decide las columnas, y equivocarse no da error: el
// sobrante se tira al siguiente renglón y el ticket se desalinea entero.
const ANCHO = process.env.IMPRESORA_ANCHO?.trim() === '58mm' ? COLUMNAS_58MM : COLUMNAS_80MM
const AGENTE_ID = process.env.AGENTE_ID?.trim() || 'agente-caja-01'
const POLL_MS = Number(process.env.POLL_INTERVALO_SEGUNDOS || 3) * 1000
const LATIDO_MS = Number(process.env.LATIDO_INTERVALO_SEGUNDOS || 30) * 1000

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const hora = () => new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Merida' })
const log = {
  info: (m: string) => console.log(`[${hora()}] ${m}`),
  error: (m: string) => console.error(`[${hora()}] ERROR  ${m}`),
}

/**
 * Los datos del negocio que van impresos.
 *
 * Por ahora salen del código (`NEGOCIO_DEFAULT`), igual que en la pantalla.
 * Cuando haya una pantalla en Admin para editarlos, esto lee de la base y
 * cachea — pero NO antes: una tabla de configuración que nadie puede editar
 * es una tabla que se queda vieja sin que nadie lo note.
 */
function datosDelNegocio(): TicketNegocio {
  return NEGOCIO_DEFAULT
}

let imprimiendo = false

async function cicloDeImpresion(): Promise<void> {
  if (imprimiendo) return
  imprimiendo = true
  try {
    const { data, error } = await sb.rpc('fn_imprimir_reclamar_trabajos', {
      p_token: TOKEN,
      p_agente: AGENTE_ID,
      p_limite: 5,
    })
    if (error) { log.error(`reclamando: ${error.message}`); return }

    const trabajos = (data ?? []) as TrabajoCaja[]
    for (const t of trabajos) {
      try {
        const uno = construirDocumento(t, datosDelNegocio(), null, ANCHO)
        // Ticket de venta: original + copia (cada copia trae su propio corte
        // ESC/POS, así que salen dos papeles cortados). Corte y prueba: una.
        const copias = t.tipo_documento === 'ticket' ? COPIAS_TICKET : 1
        const bytes = copias > 1 ? Buffer.concat(Array.from({ length: copias }, () => uno)) : uno
        if (WINDOWS) await imprimirWindows(bytes, WINDOWS)
        else await enviar(bytes, HOST, PUERTO)
        const { error: e } = await sb.rpc('fn_imprimir_confirmar', {
          p_token: TOKEN,
          p_trabajo_id: t.id,
        })
        if (e) log.error(`confirmando ${t.id}: ${e.message}`)
        else log.info(`impreso ${t.tipo_documento} ${t.id.slice(0, 8)}`)
      } catch (err) {
        // Un trabajo que falla se marca como fallido y la cola lo reintenta.
        // Lo que NO se hace es tragárselo en silencio: un ticket que no sale
        // y nadie reporta es exactamente el defecto que este agente viene a
        // cerrar.
        const msg = err instanceof Error ? err.message : String(err)
        log.error(`imprimiendo ${t.id.slice(0, 8)}: ${msg}`)
        await sb.rpc('fn_imprimir_fallar', {
          p_token: TOKEN,
          p_trabajo_id: t.id,
          p_error: msg.slice(0, 500),
        })
      }
    }
  } finally {
    imprimiendo = false
  }
}

async function latir(): Promise<void> {
  const { error } = await sb.rpc('fn_imprimir_latido', { p_token: TOKEN, p_version: VERSION })
  if (error) log.error(`latido: ${error.message}`)
}

async function arrancar(): Promise<void> {
  console.log('')
  console.log('  Hojaldras Lily — agente de tickets de caja')
  const destino = WINDOWS ? `${WINDOWS} (USB/Windows)` : `${HOST}:${PUERTO}`
  console.log(`  version ${VERSION} · impresora ${destino} · ${ANCHO} columnas`)
  console.log('')

  // Se comprueba la impresora ANTES de ponerse a reclamar trabajos. Arrancar
  // con la impresora apagada y descubrirlo al primer cobro —con el cliente
  // enfrente— es lo que hay que evitar. En modo USB/Windows no hay socket que
  // probar: el spooler acepta el trabajo aunque la impresora esté apagada, así
  // que el fallo se ve en el primer ticket (y queda en Admin, que es el punto).
  if (WINDOWS) {
    log.info(`imprime por USB a la impresora de Windows "${WINDOWS}"`)
  } else if (await estaViva(HOST, PUERTO)) {
    log.info('la impresora responde')
  } else {
    log.error(`la impresora ${HOST}:${PUERTO} NO responde. Se sigue intentando.`)
    log.error('Revisa que esté encendida, en red y con su IP fija reservada.')
  }

  await latir()
  setInterval(() => void latir(), LATIDO_MS)
  setInterval(() => void cicloDeImpresion(), POLL_MS)

  // Auto-actualización remota: cada tanto se revisa si el repo publicó una
  // versión nueva del agente. Si la hay, se baja encima y se reinicia —el
  // lanzador corre en bucle—, pero NUNCA a media impresión. Así se actualiza
  // sin ir a la PC, que es lo que pidió la casa.
  const REVISAR_MS = Math.max(5, Number(process.env.ACTUALIZAR_INTERVALO_MIN || 20)) * 60 * 1000
  setInterval(() => void revisarYReiniciar(), REVISAR_MS)
  void revisarYReiniciar()

  log.info('esperando tickets… corre oculto; se actualiza solo')
}

async function revisarYReiniciar(): Promise<void> {
  if (imprimiendo) return
  const nueva = await revisarActualizacion(VERSION)
  // Entre la revisión y aquí pudo entrar un cobro: si está imprimiendo, no se
  // reinicia. El .mjs nuevo ya quedó en disco, así que la próxima vuelta
  // ociosa lo estrena. Nada se pierde.
  if (nueva && !imprimiendo) {
    log.info(`Versión ${nueva} descargada (tenía ${VERSION}). Reiniciando para estrenarla…`)
    process.exit(0)
  }
}

void arrancar()
