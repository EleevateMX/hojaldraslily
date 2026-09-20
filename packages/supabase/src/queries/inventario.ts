import type { StockAlmacen, Almacen, TipoMovimiento } from '@lily/types'
import type { ClienteLily } from '../client'

export async function listarAlmacenes(sb: ClienteLily): Promise<Almacen[]> {
  const { data, error } = await sb.from('almacenes').select('*').eq('activo', true).order('nombre')
  if (error) throw error
  return data
}

export async function stockPorAlmacen(
  sb: ClienteLily,
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
  sb: ClienteLily,
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
  sb: ClienteLily,
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

// ---------------------------------------------------------------------------
// El inventario que se lleva a mano: contar, recibir, tirar y comprar.
//
// Lo de arriba (`registrarMovimiento`, `transferir`) arma el movimiento desde
// el navegador: varios INSERT sueltos que, si se corta la luz a la mitad, dejan
// el movimiento apuntado y la existencia sin mover. Lo de aquí abajo llama a
// una sola función del servidor, que hace todo o no hace nada.
//
// Se quedan las dos porque `transferir` todavía escribe la tabla de
// `transferencias` con su firma, que esto no cubre.
// ---------------------------------------------------------------------------

export type EstadoDeInsumo = 'agotado' | 'bajo' | 'ok'

export interface InsumoEnAlmacen {
  insumo_id: string
  nombre: string
  unidad: string
  /** Cómo se compra: «Saco 25 kg», «Cartón 30 pzas». Es lo que se cuenta. */
  presentacion: string | null
  stock: number
  minimo: number
  estado: EstadoDeInsumo
  /** Null = nunca se ha contado. Un número sin fecha no se puede creer. */
  contado_at: string | null
  contado_por: string | null
}

export interface GrupoDeInventario {
  grupo: string
  total: number
  agotados: number
  bajos: number
  items: InsumoEnAlmacen[]
}

export interface ResumenDeInventario {
  almacen_id: string
  almacen: string
  total: number
  agotados: number
  bajos: number
  sin_contar: number
  contado_al_dia: number
  grupos: GrupoDeInventario[]
}

export async function resumenDeInventario(
  sb: ClienteLily,
  almacenId?: string,
): Promise<ResumenDeInventario> {
  const { data, error } = await sb.rpc('fn_inventario_resumen', {
    p_almacen_id: almacenId ?? undefined,
  })
  if (error) throw error
  return data as unknown as ResumenDeInventario
}

export interface DiferenciaDeConteo {
  insumo: string
  habia: number
  conte: number
  diferencia: number
}

export interface ResultadoDeConteo {
  contados: number
  cuadraron: number
  ajustados: number
  diferencias: DiferenciaDeConteo[]
}

/**
 * Conteo físico: se manda **lo contado**, no la diferencia.
 *
 * Quien cuenta ve ocho sacos y escribe ocho. La resta contra lo que el sistema
 * creía la hace el servidor, que es el único que sabe ese número: pedirle a
 * alguien que teclee «−2» es pedirle que haga la cuenta dos veces.
 */
export async function contarInventario(
  sb: ClienteLily,
  lineas: { insumoId: string; contado: number }[],
  almacenId?: string,
): Promise<ResultadoDeConteo> {
  const { data, error } = await sb.rpc('fn_inventario_contar', {
    p_lineas: lineas.map((l) => ({ insumo_id: l.insumoId, contado: l.contado })),
    p_almacen_id: almacenId ?? undefined,
  })
  if (error) throw error
  return data as unknown as ResultadoDeConteo
}

/** Llegó mercancía (`compra`) o se trajo de la bodega (`bodega`). */
export async function recibirMercancia(
  sb: ClienteLily,
  lineas: { insumoId: string; piezas: number }[],
  origen: 'compra' | 'bodega' = 'compra',
  almacenDestinoId?: string,
): Promise<{ lineas: number; piezas: number }> {
  const { data, error } = await sb.rpc('fn_inventario_entrada', {
    p_lineas: lineas.map((l) => ({ insumo_id: l.insumoId, piezas: l.piezas })),
    p_origen: origen,
    p_almacen_destino: almacenDestinoId ?? undefined,
  })
  if (error) throw error
  return data as unknown as { lineas: number; piezas: number }
}

/**
 * Se tiró algo, y por qué.
 *
 * Sin esto la merma aparece en el siguiente conteo como un faltante sin
 * explicación, y un faltante que nadie puede explicar es lo que hace que se
 * deje de confiar en el inventario.
 */
export async function registrarMerma(
  sb: ClienteLily,
  params: { insumoId: string; cantidad: number; motivo?: string; almacenId?: string },
): Promise<void> {
  const { error } = await sb.rpc('fn_inventario_merma', {
    p_insumo_id: params.insumoId,
    p_cantidad: params.cantidad,
    p_motivo: params.motivo ?? undefined,
    p_almacen_id: params.almacenId ?? undefined,
  })
  if (error) throw error
}

/** De cuánto para abajo hay que volver a comprar. */
export async function fijarMinimo(
  sb: ClienteLily,
  params: { insumoId: string; minimo: number; almacenId?: string },
): Promise<void> {
  const { error } = await sb.rpc('fn_inventario_minimo', {
    p_insumo_id: params.insumoId,
    p_minimo: params.minimo,
    p_almacen_id: params.almacenId ?? undefined,
  })
  if (error) throw error
}

export interface PorComprar {
  insumo_id: string
  nombre: string
  presentacion: string | null
  unidad: string
  proveedor: string | null
  hay: number
  minimo: number
  faltan: number
  agotado: boolean
}

export interface ListaDeCompra {
  almacen: string
  items: number
  agotados: number
  grupos: { grupo: string; items: PorComprar[] }[]
}

export async function listaDeCompra(
  sb: ClienteLily,
  almacenId?: string,
): Promise<ListaDeCompra> {
  const { data, error } = await sb.rpc('fn_inventario_lista_de_compra', {
    p_almacen_id: almacenId ?? undefined,
  })
  if (error) throw error
  return data as unknown as ListaDeCompra
}

/**
 * Hace cuántos días se contó esto. `null` si nunca.
 *
 * Vive aquí y no en la pantalla porque la misma pregunta la va a hacer el
 * diagnóstico, y dos restas de fechas escritas por separado se desincronizan.
 */
export function diasSinContar(contadoAt: string | null, ahora = new Date()): number | null {
  if (!contadoAt) return null
  const antes = new Date(contadoAt)
  if (Number.isNaN(antes.getTime())) return null
  // Se compara a mediodía de cada día: si no, contar a las 11 p.m. y mirar a
  // la 1 a.m. daría «0 días» y contar a la 1 a.m. y mirar a las 11 p.m. del
  // mismo día también, pero por caminos distintos. Al mediodía, un día es un
  // día. (La misma corrección que hubo que hacerle a los encargos.)
  const mediodia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  return Math.round((mediodia(ahora) - mediodia(antes)) / 86_400_000)
}
