import type { Caja, CajaCorte, CorteResumen } from '@lily/types'
import type { Conteo } from '@lily/utils'
import type { ClienteLily } from '../client'

export async function listarCajas(sb: ClienteLily): Promise<Caja[]> {
  const { data, error } = await sb.from('cajas').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

/** Corte abierto de una caja, o null si está cerrada. */
export async function corteAbierto(sb: ClienteLily, cajaId: string): Promise<CajaCorte | null> {
  const { data, error } = await sb
    .from('caja_cortes')
    .select('*')
    .eq('caja_id', cajaId)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data
}

// rpc no está en los tipos generados para estas dos; mismo cast que el
// resto de los módulos.
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ClienteLily, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Abre el turno. La base garantiza un solo corte abierto por caja.
 *
 * Con `conteo` manda el desglose del cajón y el **servidor** saca el fondo;
 * sin él, el número suelto. Lo segundo existe para no obligar a contar
 * moneda por moneda un fondo que siempre es el mismo, pero lo primero es lo
 * que se quiere: «faltan $340» no le sirve a nadie, «falta un billete de
 * $200 y tres de $50» sí.
 *
 * Quién abre sale de la SESIÓN, no de aquí. Antes esto era un `insert`
 * directo a la tabla, o sea que cualquiera con la llave publicable podía
 * abrir turnos.
 */
export async function abrirCaja(
  sb: ClienteLily,
  cajaId: string,
  opts: { conteo?: Conteo | null; fondo?: number } = {},
): Promise<CajaCorte> {
  return rpc<CajaCorte>(sb, 'fn_abrir_caja', {
    p_caja_id: cajaId,
    p_conteo: opts.conteo ?? null,
    p_fondo: opts.conteo ? null : (opts.fondo ?? 0),
  })
}

/**
 * Cierra el turno contra lo que hay en el cajón.
 *
 * El efectivo contado **no viaja desde la pantalla**: lo calcula el servidor
 * desde el desglose. Es la misma regla que `fn_cobrar_orden` — si el total
 * lo mandara el cliente, el desglose y el número podrían no coincidir, y
 * entonces hay dos verdades y ninguna sirve.
 */
export async function cerrarCaja(
  sb: ClienteLily,
  corteId: string,
  opts: { conteo?: Conteo | null; efectivo?: number; notas?: string } = {},
): Promise<CajaCorte> {
  return rpc<CajaCorte>(sb, 'fn_cerrar_caja', {
    p_corte_id: corteId,
    p_conteo: opts.conteo ?? null,
    p_notas: opts.notas ?? null,
    p_efectivo: opts.conteo ? null : (opts.efectivo ?? 0),
  })
}

/** Totales del corte por método de pago (vw_corte_resumen). */
export async function resumenCorte(sb: ClienteLily, corteId: string): Promise<CorteResumen> {
  const { data, error } = await sb
    .from('vw_corte_resumen')
    .select('*')
    .eq('corte_id', corteId)
    .single()
  if (error) throw error
  return data
}

// ------------------------------ los cortes -------------------------------

/** Un turno, tal cual lo devuelve `fn_cortes_de_caja`: resumen + desglose + quién. */
export interface CorteDeCaja {
  corte_id: string
  folio: number
  caja: string | null
  estado: 'abierta' | 'cerrada'
  abierto_en: string
  cerrado_en: string | null
  abrio: string | null
  cerro: string | null
  fondo_inicial: number
  num_ordenes: number
  total_efectivo: number
  total_tarjeta: number
  total_clip: number
  total_cortesia: number
  total_otro: number
  total_pagado: number
  efectivo_esperado: number
  efectivo_contado: number | null
  diferencia: number | null
  conteo_apertura: unknown
  conteo_cierre: unknown
  notas: string | null
}

/**
 * El historial de cortes entre dos fechas (del negocio, en Mérida).
 *
 * Hasta hoy se cerraba el turno y no había dónde mirarlo: el arqueo existía
 * en la pantalla de la caja y desaparecía al dar «Seguir». Aquí queda, con
 * la diferencia y —lo que de verdad sirve para reclamar— cuántos billetes de
 * cada denominación había.
 */
export async function cortesDeCaja(sb: ClienteLily, desde: string, hasta: string): Promise<CorteDeCaja[]> {
  return (await rpc<CorteDeCaja[] | null>(sb, 'fn_cortes_de_caja', { p_desde: desde, p_hasta: hasta })) ?? []
}

/**
 * Manda el corte a la térmica del mostrador desde Admin —desde el teléfono,
 * sin nadie frente a la PC—. Devuelve el id del trabajo, o `null` si la
 * tienda no tiene térmica dada de alta: Admin lo dice en vez de fingir.
 */
export async function imprimirCorteEnCaja(sb: ClienteLily, corteId: string): Promise<string | null> {
  return rpc<string | null>(sb, 'fn_corte_imprimir_caja', { p_corte_id: corteId, p_clave: null })
}
