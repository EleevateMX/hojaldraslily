import type { StockAlmacen, Almacen, TipoMovimiento } from '@shake/types'
import type { ShakeClient } from '../client'

export async function listarAlmacenes(sb: ShakeClient): Promise<Almacen[]> {
  const { data, error } = await sb.from('almacenes').select('*').eq('activo', true).order('nombre')
  if (error) throw error
  return data
}

export async function stockPorAlmacen(
  sb: ShakeClient,
  almacenId?: string,
): Promise<StockAlmacen[]> {
  let q = sb.from('vw_stock_almacen').select('*').order('insumo')
  if (almacenId) q = q.eq('almacen_id', almacenId)
  const { data, error } = await q
  if (error) throw error
  return data
}

/**
 * Registra un movimiento y actualiza el stock del almacén.
 * cantidad: positiva = entrada, negativa = salida.
 */
export async function registrarMovimiento(
  sb: ShakeClient,
  params: {
    insumoId: string
    almacenId: string
    cantidad: number
    tipo: TipoMovimiento
    costoUnitario?: number
    nota?: string
    referenciaId?: string
  },
): Promise<void> {
  const { error } = await sb.from('inventario_movimientos').insert({
    insumo_id: params.insumoId,
    almacen_id: params.almacenId,
    cantidad: params.cantidad,
    tipo: params.tipo,
    costo_unitario: params.costoUnitario ?? null,
    nota: params.nota ?? null,
    referencia_id: params.referenciaId ?? null,
  })
  if (error) throw error

  // upsert de stock (existencia por insumo+almacén)
  const { data: fila, error: selError } = await sb
    .from('inventario_stock')
    .select('id, stock_actual')
    .eq('insumo_id', params.insumoId)
    .eq('almacen_id', params.almacenId)
    .maybeSingle()
  if (selError) throw selError

  if (fila) {
    const { error: updError } = await sb
      .from('inventario_stock')
      .update({ stock_actual: fila.stock_actual + params.cantidad })
      .eq('id', fila.id)
    if (updError) throw updError
  } else {
    const { error: insError } = await sb.from('inventario_stock').insert({
      insumo_id: params.insumoId,
      almacen_id: params.almacenId,
      stock_actual: params.cantidad,
    })
    if (insError) throw insError
  }
}

/** Transferencia Bodega → Kiosko: salida en origen, entrada en destino. */
export async function transferir(
  sb: ShakeClient,
  params: {
    origenId: string
    destinoId: string
    items: { insumoId: string; cantidad: number }[]
    firma?: string
  },
): Promise<void> {
  const { data: transferencia, error } = await sb
    .from('transferencias')
    .insert({ origen_id: params.origenId, destino_id: params.destinoId, firma: params.firma ?? null })
    .select()
    .single()
  if (error) throw error

  const { error: itemsError } = await sb.from('transferencia_items').insert(
    params.items.map((i) => ({
      transferencia_id: transferencia.id,
      insumo_id: i.insumoId,
      cantidad: i.cantidad,
    })),
  )
  if (itemsError) throw itemsError

  for (const item of params.items) {
    await registrarMovimiento(sb, {
      insumoId: item.insumoId,
      almacenId: params.origenId,
      cantidad: -item.cantidad,
      tipo: 'traspaso',
      referenciaId: transferencia.id,
    })
    await registrarMovimiento(sb, {
      insumoId: item.insumoId,
      almacenId: params.destinoId,
      cantidad: item.cantidad,
      tipo: 'traspaso',
      referenciaId: transferencia.id,
    })
  }
}
