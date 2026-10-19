import { create } from 'zustand'
import { urlBackend } from '@lily/supabase'

/**
 * ¿Hay internet?
 *
 * **`navigator.onLine` no sirve para esto.** Dice si la PC tiene red, no si
 * se llega a internet, y es exactamente el caso que se cae: el módem
 * prendido, las etiquetadoras contestando, la red local perfecta, y ninguna
 * salida. El navegador diría «en línea» todo el rato mientras cada cobro
 * falla. Así que se le PREGUNTA al servidor: una consulta chiquita cada 15 s
 * (cada 5 s mientras no hay).
 *
 * **Dos fallos seguidos** para declarar «sin internet» y **uno bueno** para
 * quitarlo. Un parpadeo de un segundo no debe cambiarle la pantalla al cajero
 * a media venta; la vuelta, en cambio, se avisa en cuanto se nota, porque de
 * eso depende que la cola se empiece a mandar.
 *
 * Lo que se mide es si se LLEGA al servidor, no si contesta bonito: un
 * servidor que responde con error ya no es «sin internet», y vender sin
 * registrar habiendo internet sería peor.
 */

interface EstadoConexion {
  enLinea: boolean
  /** Desde cuándo no hay internet (ISO), para el aviso de la cabecera. */
  desde: string | null
}

export const useConexion = create<EstadoConexion>(() => ({ enLinea: true, desde: null }))

const URL_SB = urlBackend()

let fallosSeguidos = 0
let timer: ReturnType<typeof setTimeout> | null = null
let revisando: Promise<boolean> | null = null
let arrancado = false

/**
 * `no-cors` y sin cabeceras, a propósito: solo se quiere saber si se LLEGA al
 * servidor. Con la llave en una cabecera el navegador tendría que pedir
 * permiso antes (preflight de CORS), y si ese permiso fallara por cualquier
 * motivo la caja creería que nunca hay internet — teniéndolo. Así la
 * respuesta llega opaca (no se puede leer) pero llega; sin internet, la
 * promesa falla y eso es la señal.
 */
async function sondear(): Promise<boolean> {
  if (!URL_SB) return true
  try {
    await fetch(`${URL_SB}/auth/v1/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch {
    return false
  }
}

function aplicar(ok: boolean) {
  const estado = useConexion.getState()
  if (ok) {
    fallosSeguidos = 0
    if (!estado.enLinea) useConexion.setState({ enLinea: true, desde: null })
    return
  }
  fallosSeguidos++
  if (estado.enLinea && fallosSeguidos >= 2) {
    useConexion.setState({ enLinea: false, desde: new Date().toISOString() })
  }
}

function programar() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void revisarAhora(), useConexion.getState().enLinea ? 15_000 : 5_000)
}

/**
 * Pregunta ya, sin esperar al siguiente turno. La llama quien vio fallar algo
 * por red (un cobro que no llegó), para que la pantalla se entere en segundos
 * y no a los quince.
 */
export function revisarAhora(): Promise<boolean> {
  if (revisando) return revisando
  revisando = (async () => {
    try {
      aplicar(await sondear())
      return useConexion.getState().enLinea
    } finally {
      revisando = null
      programar()
    }
  })()
  return revisando
}

/** Se arranca una sola vez al abrir la caja. */
export function vigilarConexion(): void {
  if (arrancado) return
  arrancado = true
  window.addEventListener('online', () => void revisarAhora())
  window.addEventListener('offline', () => {
    // Aquí sí se le cree al navegador: si dice que ni red hay, no hay. Es el
    // único caso en que `navigator.onLine` aporta algo.
    fallosSeguidos = 2
    aplicar(false)
    programar()
  })
  void revisarAhora()
}

/**
 * ¿Este error es de RED (no llegó al servidor) o del SERVIDOR (llegó y dijo
 * que no)?
 *
 * Solo los de red justifican pasar a vender sin internet: un «el monto no
 * coincide» no se arregla guardando la venta para después — se arregla
 * ahora, y guardarla dejaría una venta que va a fallar igual mañana.
 */
export function esErrorDeRed(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  return (
    e instanceof TypeError ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    m.includes('aborted')
  )
}

/** «Sin internet desde las 9:07», para el aviso. */
export function desdeQueHora(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('es-MX', {
      timeZone: 'America/Merida',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
