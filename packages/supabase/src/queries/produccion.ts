import type { ShakeClient } from '../client'

/**
 * Órdenes de producción y encargos.
 *
 * Dos cosas que la panadería necesita y que el motor original no tenía,
 * porque allá todo se preparaba al momento contra el pedido del cliente:
 *
 * - **Mandar a hacer**: gerencia pide «30 hojaldras de guayaba mini», eso sale
 *   en la pantalla de producción, y cuando la gente lo marca hecho **entra
 *   solo al inventario**. Nadie captura lo mismo dos veces.
 * - **Apartar**: un cliente encarga 20 piezas. Se separan en almacén —dejan de
 *   estar libres para el mostrador— pero **no se descuentan hasta que se
 *   pagan**. Apartar no es vender.
 *
 * Todo pasa por funciones del servidor, no por INSERT sueltos: el precio y el
 * estado los pone la base. Un encargo es dinero apartado, y si el navegador
 * pudiera mandar el precio, apartar sería la puerta para cobrarse lo que uno
 * quiera.
 */

// ------------------------------- producción -------------------------------

export interface ItemDeProduccion {
  id: string
  producto_id: string
  producto: string
  imagen_url: string | null
  cantidad_pedida: number
  cantidad_hecha: number
  terminado_por: string | null
}

export interface OrdenDeProduccion {
  id: string
  folio: number
  fecha: string
  estado: 'pendiente' | 'en_proceso' | 'terminada' | 'cancelada'
  nota: string | null
  creada_por: string | null
  created_at: string
  items: ItemDeProduccion[]
}

/** Fila cruda del join; se aplana en `listarOrdenesDeProduccion`. */
interface FilaOrden {
  id: string
  folio: number
  fecha: string
  estado: OrdenDeProduccion['estado']
  nota: string | null
  creada_por: string | null
  created_at: string
  orden_produccion_items: {
    id: string
    producto_id: string
    cantidad_pedida: number
    cantidad_hecha: number
    terminado_por: string | null
    productos: { nombre: string; imagen_url: string | null } | null
  }[]
}

/**
 * Lo que hay que hacer. Por omisión trae solo lo que sigue abierto, que es lo
 * que la pantalla de producción tiene que mostrar; `incluirTerminadas` es para
 * la vista de gerencia, donde sí interesa lo que ya salió.
 */
export async function listarOrdenesDeProduccion(
  sb: ShakeClient,
  incluirTerminadas = false,
): Promise<OrdenDeProduccion[]> {
  let q = sb
    .from('ordenes_produccion')
    .select(
      'id, folio, fecha, estado, nota, creada_por, created_at,' +
        ' orden_produccion_items(id, producto_id, cantidad_pedida, cantidad_hecha,' +
        ' terminado_por, productos(nombre, imagen_url))',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  if (!incluirTerminadas) q = q.in('estado', ['pendiente', 'en_proceso'])

  const { data, error } = await q
  if (error) throw error

  return ((data ?? []) as unknown as FilaOrden[]).map((o) => ({
    id: o.id,
    folio: o.folio,
    fecha: o.fecha,
    estado: o.estado,
    nota: o.nota,
    creada_por: o.creada_por,
    created_at: o.created_at,
    items: (o.orden_produccion_items ?? []).map((i) => ({
      id: i.id,
      producto_id: i.producto_id,
      producto: i.productos?.nombre ?? '—',
      imagen_url: i.productos?.imagen_url ?? null,
      cantidad_pedida: i.cantidad_pedida,
      cantidad_hecha: i.cantidad_hecha,
      terminado_por: i.terminado_por,
    })),
  }))
}

/** Manda a hacer. Regresa el id de la orden creada. */
export async function mandarAProducir(
  sb: ShakeClient,
  items: { producto_id: string; cantidad: number }[],
  nota?: string,
): Promise<string> {
  const { data, error } = await sb.rpc('fn_produccion_mandar_a_hacer', {
    p_items: items,
    p_nota: nota ?? undefined,
  })
  if (error) throw error
  return data as unknown as string
}

/**
 * Marca cuántas van hechas de un renglón. Es un TOTAL, no un incremento:
 * marcar «12» y luego «20» deja 20, no 32. El servidor apunta solo la
 * diferencia en el inventario.
 */
export async function avanzarProduccion(
  sb: ShakeClient,
  itemId: string,
  hechas: number,
): Promise<number> {
  const { data, error } = await sb.rpc('fn_produccion_avanzar', {
    p_item_id: itemId,
    p_hechas: hechas,
  })
  if (error) throw error
  return Number(data ?? 0)
}

// -------------------------------- encargos --------------------------------

export interface ItemDeEncargo {
  id: string
  producto_id: string
  producto: string
  imagen_url: string | null
  cantidad: number
  precio_unitario: number
}

export interface Encargo {
  id: string
  folio: number
  cliente: string
  telefono: string | null
  fecha_entrega: string | null
  hora_entrega: string | null
  estado: 'apartado' | 'pagado' | 'entregado' | 'cancelado'
  anticipo: number
  nota: string | null
  creado_por: string | null
  created_at: string
  items: ItemDeEncargo[]
  /** Lo que se le cotizó al cliente: suma de los precios congelados. */
  total: number
  piezas: number
}

interface FilaEncargo {
  id: string
  folio: number
  cliente: string
  telefono: string | null
  fecha_entrega: string | null
  hora_entrega: string | null
  estado: Encargo['estado']
  anticipo: number
  nota: string | null
  creado_por: string | null
  created_at: string
  encargo_items: {
    id: string
    producto_id: string
    cantidad: number
    precio_unitario: number
    productos: { nombre: string; imagen_url: string | null } | null
  }[]
}

/**
 * Los encargos. Por omisión solo los que siguen apartados —lo que de verdad
 * está separado en almacén—; `incluirCerrados` trae también los cobrados y
 * cancelados, para consultar.
 */
export async function listarEncargos(
  sb: ShakeClient,
  incluirCerrados = false,
): Promise<Encargo[]> {
  let q = sb
    .from('encargos')
    .select(
      'id, folio, cliente, telefono, fecha_entrega, hora_entrega, estado, anticipo,' +
        ' nota, creado_por, created_at,' +
        ' encargo_items(id, producto_id, cantidad, precio_unitario,' +
        ' productos(nombre, imagen_url))',
    )
    // Lo que se entrega primero, primero. Los que no traen fecha van al final:
    // son los de "paso más tarde", no los del sábado.
    .order('fecha_entrega', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(200)

  if (!incluirCerrados) q = q.eq('estado', 'apartado')

  const { data, error } = await q
  if (error) throw error

  return ((data ?? []) as unknown as FilaEncargo[]).map((e) => {
    const items = (e.encargo_items ?? []).map((i) => ({
      id: i.id,
      producto_id: i.producto_id,
      producto: i.productos?.nombre ?? '—',
      imagen_url: i.productos?.imagen_url ?? null,
      cantidad: i.cantidad,
      precio_unitario: Number(i.precio_unitario),
    }))
    return {
      id: e.id,
      folio: e.folio,
      cliente: e.cliente,
      telefono: e.telefono,
      fecha_entrega: e.fecha_entrega,
      hora_entrega: e.hora_entrega,
      estado: e.estado,
      anticipo: Number(e.anticipo),
      nota: e.nota,
      creado_por: e.creado_por,
      created_at: e.created_at,
      items,
      total: items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0),
      piezas: items.reduce((s, i) => s + i.cantidad, 0),
    }
  })
}

export interface NuevoEncargo {
  cliente: string
  items: { producto_id: string; cantidad: number }[]
  telefono?: string
  fecha_entrega?: string
  hora_entrega?: string
  nota?: string
  anticipo?: number
}

/** Aparta. NO descuenta del inventario: eso pasa al cobrar. */
export async function crearEncargo(sb: ShakeClient, e: NuevoEncargo): Promise<string> {
  const { data, error } = await sb.rpc('fn_encargo_crear', {
    p_cliente: e.cliente,
    p_items: e.items,
    p_telefono: e.telefono ?? undefined,
    p_fecha_entrega: e.fecha_entrega ?? undefined,
    p_hora_entrega: e.hora_entrega ?? undefined,
    p_nota: e.nota ?? undefined,
    p_anticipo: e.anticipo ?? 0,
  })
  if (error) throw error
  return data as unknown as string
}

/**
 * Cobra el encargo. Es lo único que lo descuenta del inventario.
 *
 * Pasa por el mismo camino que una venta de mostrador, así que cae en el corte
 * de caja y saca sus comandas. Es idempotente: dos toques no cobran dos veces.
 * Regresa el total cobrado, que se recalcula con el precio de hoy.
 */
export async function cobrarEncargo(
  sb: ShakeClient,
  encargoId: string,
  metodo: 'efectivo' | 'tarjeta' = 'efectivo',
): Promise<number> {
  const { data, error } = await sb.rpc('fn_encargo_cobrar', {
    p_encargo_id: encargoId,
    p_metodo: metodo,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function cancelarEncargo(
  sb: ShakeClient,
  encargoId: string,
  motivo?: string,
): Promise<void> {
  const { error } = await sb.rpc('fn_encargo_cancelar', {
    p_encargo_id: encargoId,
    p_motivo: motivo ?? undefined,
  })
  if (error) throw error
}
