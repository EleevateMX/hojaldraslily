import type { ClienteLily } from '../client'

export interface SaludSistema {
  pagosPendientes: number
  pagosDesconocidos: number
  ordenesEsperandoCaja: number
  ordenesExpiradas24h: number
  impresorasActivas: number
  impresorasConectadas: number
  trabajosImpresionFallidos: number
  pedidosSinComanda: number
  ventasSinMovimientoInventario: number
}

/**
 * Indicadores operativos para el panel de Admin, en una sola llamada
 * (fn_salud_sistema, SQL puro del lado servidor — "ventas sin movimiento
 * de inventario" no se puede resolver con el embedding automático de
 * PostgREST porque `inventario_movimientos.referencia_id` no tiene FK
 * formal a `ordenes`, así que se calcula ahí). Ver docs/checklist-produccion.md.
 */
export async function obtenerSaludSistema(sb: ClienteLily): Promise<SaludSistema> {
  const { data, error } = await sb.rpc('fn_salud_sistema')
  if (error) throw error
  const fila = Array.isArray(data) ? data[0] : data
  return {
    pagosPendientes: fila?.pagos_pendientes ?? 0,
    pagosDesconocidos: fila?.pagos_desconocidos ?? 0,
    ordenesEsperandoCaja: fila?.ordenes_esperando_caja ?? 0,
    ordenesExpiradas24h: fila?.ordenes_expiradas_24h ?? 0,
    impresorasActivas: fila?.impresoras_activas ?? 0,
    impresorasConectadas: fila?.impresoras_conectadas ?? 0,
    trabajosImpresionFallidos: fila?.trabajos_impresion_fallidos ?? 0,
    pedidosSinComanda: fila?.pedidos_sin_comanda ?? 0,
    ventasSinMovimientoInventario: fila?.ventas_sin_movimiento_inventario ?? 0,
  }
}

// --------------------------- diagnóstico -----------------------------

export interface HallazgoDiagnostico {
  area: string
  severidad: 'alta' | 'media' | 'baja'
  cuantos: number
  titulo: string
  detalle: string
  que_hacer: string
}

export interface Diagnostico {
  revisado_en: string
  hallazgos: HallazgoDiagnostico[]
}

/**
 * El chequeo médico del sistema (RPC `fn_diagnostico_sistema`): no cuántos
 * problemas hay, sino CUÁLES, con ejemplos concretos y qué hacer con cada
 * uno — incluido lo que pasa fuera del punto de venta (Rewards).
 *
 * Exige gerencia del lado del servidor.
 */
export async function diagnosticoSistema(sb: ClienteLily): Promise<Diagnostico> {
  const { data, error } = await (sb.rpc as unknown as
    (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  )('fn_diagnostico_sistema', {})
  if (error) throw error
  return data as Diagnostico
}

// ----------------------- ventas sin internet --------------------------

export interface VentaSinInternetRevisar {
  id: string
  folio_local: string | null
  folio: number | null
  vendida_en: string
  recibida_en: string
  metodo: string
  total_pantalla: number
  total_servidor: number | null
  diferencia: number | null
  estado: 'ok' | 'revisar'
  comanda_suprimida: boolean
  cajero: string | null
}

/**
 * Las ventas que se cobraron sin internet, de los últimos días.
 *
 * Existe por la lección de los indicadores: una diferencia de precio que se
 * guarda y nadie puede ver es exactamente un número que no sirve. Lleva
 * ventana de tiempo (7 días por omisión) para que el renglón pueda **volver
 * a verde** — un contador histórico que nunca baja deja de leerse.
 */
export async function ventasSinInternet(
  sb: ClienteLily,
  dias = 7,
): Promise<VentaSinInternetRevisar[]> {
  const { data, error } = await (sb.rpc as unknown as
    (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  )('fn_ventas_sin_internet_revisar', { p_dias: dias })
  if (error) throw error
  return (data as VentaSinInternetRevisar[] | null) ?? []
}
