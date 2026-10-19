import { create } from 'zustand'
import { folioSinInternet, hoyEnMerida, mensajeDeError } from '@lily/utils'
import { sb } from '../lib/sb'
import { esErrorDeRed, revisarAhora, useConexion } from '../lib/conexion'

/**
 * Ventas cobradas SIN internet.
 *
 * Sin conexión la caja sigue cobrando efectivo (o registra lo que ya se cobró
 * en la terminal del banco): la venta se guarda en ESTE navegador con un
 * folio provisional («S-03»), el ticket sale por el navegador, y en cuanto
 * vuelve el internet cada venta se manda a `fn_venta_sin_internet`, que la
 * registra con su hora real usando el camino del dinero de siempre.
 *
 * Reglas que no son de estilo:
 *
 * - **Se escribe en localStorage ANTES de imprimir y antes de cambiar de
 *   pantalla.** Si la PC se apaga a media venta, lo cobrado no se pierde. Y
 *   si el navegador NO pudo guardar, la venta no se da por cobrada: mejor
 *   volver a teclearla que tenerla en el cajón y en ningún registro.
 * - **El id lo pone el navegador** y el servidor es idempotente con él: si la
 *   respuesta se corta a media vuelta, el reintento no crea otra orden.
 * - **Se manda de una en una**, y nunca dos envíos a la vez.
 * - **Un error de RED detiene la vuelta** (sigue sin internet); un error del
 *   SERVIDOR deja esa venta marcada y sigue con las demás — una venta rara no
 *   puede atorar a las otras quince.
 */

export interface ItemSinInternet {
  producto_id: string
  cantidad: number
  personalizacion: string | null
}

export interface VentaSinInternet {
  id: string
  folio_local: string
  vendida_en: string
  sucursal_id: string
  almacen_id: string
  corte_id: string | null
  empleado_id: string | null
  nombre_cliente: string | null
  descuento: number
  referencia: string | null
  metodo: 'efectivo' | 'tarjeta' | 'mixto'
  efectivo: number
  tarjeta: number
  total_pantalla: number
  items: ItemSinInternet[]
  /** Solo para la pantalla: qué se vendió. No viaja al servidor. */
  resumen: { nombre: string; cantidad: number }[]
  intentos: number
  ultimoError: string | null
}

export interface VentaRegistrada {
  folio_local: string
  folio: number
  vendida_en: string
  diferencia: number
}

const CLAVE = 'lily_pos_ventas_sin_internet_v1'
const CLAVE_ENVIADAS = 'lily_pos_ventas_sin_internet_enviadas_v1'
const CLAVE_FOLIO = 'lily_pos_folio_sin_internet_v1'

function leer<T>(clave: string, porOmision: T): T {
  try {
    return (JSON.parse(localStorage.getItem(clave) ?? 'null') as T) ?? porOmision
  } catch {
    return porOmision
  }
}

function escribir(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

interface EstadoCola {
  pendientes: VentaSinInternet[]
  enviadas: VentaRegistrada[]
  enviando: boolean
}

export const useVentasSinInternet = create<EstadoCola>(() => ({
  pendientes: leer<VentaSinInternet[]>(CLAVE, []),
  enviadas: leer<VentaRegistrada[]>(CLAVE_ENVIADAS, []),
  enviando: false,
}))

function guardarPendientes(lista: VentaSinInternet[]): boolean {
  const ok = escribir(CLAVE, lista)
  useVentasSinInternet.setState({ pendientes: lista })
  return ok
}

/**
 * El siguiente folio provisional del día del negocio.
 *
 * Se reinicia con el día de **Mérida**, no con el de UTC: a las 7 de la noche
 * UTC ya dice mañana, y los folios de una misma noche se partirían en dos
 * series.
 */
export function siguienteFolioLocal(): string {
  const hoy = hoyEnMerida()
  const actual = leer<{ dia: string; n: number }>(CLAVE_FOLIO, { dia: hoy, n: 0 })
  const n = actual.dia === hoy ? actual.n + 1 : 1
  escribir(CLAVE_FOLIO, { dia: hoy, n })
  return folioSinInternet(n)
}

/**
 * Guarda una venta cobrada sin internet.
 *
 * Devuelve `false` si el navegador no la pudo guardar — y entonces NO se debe
 * dar por cobrada.
 */
export function guardarVentaSinInternet(v: VentaSinInternet): boolean {
  return guardarPendientes([...useVentasSinInternet.getState().pendientes, v])
}

function marcar(id: string, cambios: Partial<VentaSinInternet>) {
  guardarPendientes(
    useVentasSinInternet.getState().pendientes.map((v) => (v.id === id ? { ...v, ...cambios } : v)),
  )
}

/** Lo que el servidor necesita. Lo que es solo de esta pantalla no viaja. */
function paraElServidor(v: VentaSinInternet): Record<string, unknown> {
  const { resumen: _resumen, intentos: _intentos, ultimoError: _ultimoError, ...resto } = v
  return resto
}

// ---------------------------------------------------------------------------
// El envío, cuando vuelve el internet.
// ---------------------------------------------------------------------------

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{
  data: unknown
  error: { message: string } | null
}>

let enCurso: Promise<void> | null = null

export function enviarPendientes(): Promise<void> {
  if (enCurso) return enCurso
  enCurso = (async () => {
    useVentasSinInternet.setState({ enviando: true })
    try {
      for (const { id } of [...useVentasSinInternet.getState().pendientes]) {
        if (!useConexion.getState().enLinea) return
        // Se relee por id: la lista pudo cambiar mientras se mandaba la
        // anterior (otra venta nueva, o un reintento que la quitó).
        const v = useVentasSinInternet.getState().pendientes.find((x) => x.id === id)
        if (!v) continue
        try {
          const { data, error } = await (sb.rpc as unknown as RpcFn)('fn_venta_sin_internet', {
            p_venta: paraElServidor(v),
          })
          if (error) throw new Error(error.message)
          const r = data as { folio: number; diferencia: number }
          const enviadas = [
            {
              folio_local: v.folio_local,
              folio: r.folio,
              vendida_en: v.vendida_en,
              diferencia: Number(r.diferencia ?? 0),
            },
            ...useVentasSinInternet.getState().enviadas,
          ].slice(0, 50)
          escribir(CLAVE_ENVIADAS, enviadas)
          useVentasSinInternet.setState({ enviadas })
          guardarPendientes(
            useVentasSinInternet.getState().pendientes.filter((x) => x.id !== v.id),
          )
        } catch (e) {
          if (esErrorDeRed(e)) {
            // Volvió a irse: que la pantalla se entere ya, y se para la
            // vuelta. Reintentar contra una red muerta solo gasta batería.
            void revisarAhora()
            return
          }
          // El servidor contestó que no. Esa venta queda marcada y se sigue
          // con las demás: casi siempre es una caja que se cerró a medias o
          // un producto que cambió, y no tiene por qué atorar a las otras.
          marcar(v.id, { intentos: v.intentos + 1, ultimoError: mensajeDeError(e) })
        }
      }
    } finally {
      useVentasSinInternet.setState({ enviando: false })
      enCurso = null
    }
  })()
  return enCurso
}

let arrancado = false

/**
 * Manda lo pendiente en cuanto vuelve el internet, y luego cada 30 s mientras
 * quede algo.
 *
 * El reintento periódico existe porque lo que el servidor rechazó puede dejar
 * de estar rechazado: un corte que se reabre, un producto que se vuelve a
 * activar. Sin él, esas ventas se quedarían en el navegador para siempre.
 */
export function vigilarVentasSinInternet(): void {
  if (arrancado) return
  arrancado = true
  useConexion.subscribe((s, previo) => {
    if (s.enLinea && !previo.enLinea) void enviarPendientes()
  })
  setInterval(() => {
    if (useConexion.getState().enLinea && useVentasSinInternet.getState().pendientes.length > 0) {
      void enviarPendientes()
    }
  }, 30_000)
  if (useVentasSinInternet.getState().pendientes.length > 0) void enviarPendientes()
}
