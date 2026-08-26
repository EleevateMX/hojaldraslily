import type { Caja, CajaCorte, CorteResumen } from '@shake/types'
import type { ShakeClient } from '../client'

export async function listarCajas(sb: ShakeClient): Promise<Caja[]> {
  const { data, error } = await sb.from('cajas').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

/** Corte abierto de una caja, o null si está cerrada. */
export async function corteAbierto(sb: ShakeClient, cajaId: string): Promise<CajaCorte | null> {
  const { data, error } = await sb
    .from('caja_cortes')
    .select('*')
    .eq('caja_id', cajaId)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data
}

/** Abre caja. La base garantiza un solo corte abierto por caja. */
export async function abrirCaja(
  sb: ShakeClient,
  cajaId: string,
  fondoInicial: number,
  empleadoId?: string,
): Promise<CajaCorte> {
  const { data, error } = await sb
    .from('caja_cortes')
    .insert({
      caja_id: cajaId,
      fondo_inicial: fondoInicial,
      empleado_apertura_id: empleadoId ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cerrarCaja(
  sb: ShakeClient,
  corteId: string,
  efectivoContado: number,
  empleadoId?: string,
  notas?: string,
): Promise<void> {
  const { error } = await sb
    .from('caja_cortes')
    .update({
      estado: 'cerrada',
      cerrado_en: new Date().toISOString(),
      efectivo_contado: efectivoContado,
      empleado_cierre_id: empleadoId ?? null,
      notas: notas ?? null,
    })
    .eq('id', corteId)
  if (error) throw error
}

/** Totales del corte por método de pago (vw_corte_resumen). */
export async function resumenCorte(sb: ShakeClient, corteId: string): Promise<CorteResumen> {
  const { data, error } = await sb
    .from('vw_corte_resumen')
    .select('*')
    .eq('corte_id', corteId)
    .single()
  if (error) throw error
  return data
}
