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
  /** El sabor que hay que hornear. El tamaño se decide al vender, no aquí. */
  sabor: string
  imagen_url: string | null
  /** Moldes pedidos. Cada molde rinde `cuadros_por_molde` (48). */
  moldes: number
  /** Moldes ya hechos. Es un TOTAL, no un incremento. */
  hechos: number
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
    sabor: string | null
    moldes: number | null
    cantidad_hecha: number
    terminado_por: string | null
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
        ' orden_produccion_items(id, sabor, moldes, cantidad_hecha, terminado_por)',
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
      sabor: i.sabor ?? '—',
      imagen_url: null,
      moldes: i.moldes ?? 0,
      hechos: i.cantidad_hecha,
      terminado_por: i.terminado_por,
    })),
  }))
}

/**
 * Manda a hacer, en MOLDES de un sabor.
 *
 * Se pide por sabor y no por paquete porque así se hornea: sale un molde de
 * 48 cuadros y de ahí se cortan los paquetes conforme se venden. Pedir «10
 * paquetes de 12» obligaría a decidir en el horno algo que se decide en el
 * mostrador.
 */
export async function mandarAProducir(
  sb: ShakeClient,
  items: { sabor: string; moldes: number }[],
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
 * Marca cuántos MOLDES van hechos de un renglón. Es un TOTAL, no un
 * incremento: marcar «2» y luego «3» deja 3, no 5. El servidor apunta solo la
 * diferencia en el inventario, ya convertida a cuadros.
 *
 * Regresa cuántos cuadros quedan libres de ese sabor.
 */
export async function avanzarProduccion(
  sb: ShakeClient,
  itemId: string,
  moldes: number,
): Promise<number> {
  const { data, error } = await sb.rpc('fn_produccion_avanzar', {
    p_item_id: itemId,
    p_moldes: moldes,
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

// ------------------- el reloj del horno -------------------

export interface OrdenConTiempo {
  id: string
  folio: number
  estado: 'pendiente' | 'en_proceso' | 'terminada' | 'cancelada'
  nota: string | null
  creada_por: string | null
  created_at: string
  /** Cuánto se estima que tarda la orden entera (la pieza más lenta manda). */
  minutos: number
  listo_estimado: string
  piezas_pedidas: number
  piezas_hechas: number
}

/**
 * Las órdenes abiertas con su hora estimada de salida.
 *
 * Es lo que la caja necesita para contestar «¿a qué hora salen?» sin ir a
 * preguntar al horno. La estimación se calcula en la base al vuelo: si mañana
 * se ajusta el tiempo de un producto, las órdenes abiertas se recalculan
 * solas en vez de quedarse con una estimación vieja congelada.
 */
export async function listarOrdenesConTiempo(
  sb: ShakeClient,
  incluirTerminadas = false,
): Promise<OrdenConTiempo[]> {
  const { data, error } = await sb.rpc('fn_ordenes_de_produccion', {
    p_incluir_terminadas: incluirTerminadas,
  })
  if (error) throw error
  return (data ?? []) as OrdenConTiempo[]
}

/**
 * Cuánto falta para que salga, en palabras.
 *
 * Devuelve el texto y si ya se pasó del tiempo, para que la pantalla decida
 * el color. Se redondea a minutos: un contador al segundo en una pantalla de
 * cocina solo distrae, y nadie hornea con esa precisión.
 */
export function faltaPara(listoEstimado: string, ahora = new Date()): {
  texto: string
  minutos: number
  tarde: boolean
} {
  const objetivo = new Date(listoEstimado)
  const minutos = Math.round((objetivo.getTime() - ahora.getTime()) / 60000)
  if (minutos < 0) {
    const m = -minutos
    return {
      texto: m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min tarde` : `${m} min tarde`,
      minutos,
      tarde: true,
    }
  }
  if (minutos === 0) return { texto: 'ya mero', minutos, tarde: false }
  if (minutos >= 60) {
    return { texto: `en ${Math.floor(minutos / 60)} h ${minutos % 60} min`, minutos, tarde: false }
  }
  return { texto: `en ${minutos} min`, minutos, tarde: false }
}

/** La hora de salida, como se lee en un reloj. */
export function horaDeSalida(listoEstimado: string): string {
  return new Date(listoEstimado).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ------------------- precios por canal (Rappi) -------------------

/** `producto_id -> canal -> precio`. Solo trae las excepciones. */
export type PreciosDeCanal = Record<string, Record<string, number>>

/** Los canales que la caja sabe cobrar. */
export type CanalDeVenta = 'pos' | 'rappi'

/**
 * La lista de precios por canal.
 *
 * Lo que se vende por Rappi no cuesta lo mismo que en mostrador: la
 * plataforma se lleva su comisión, así que el precio de lista sube. La caja
 * tiene que MOSTRAR ese precio, no solo cobrarlo: `fn_cobrar_orden` valida el
 * importe contra el total que calculó el servidor, así que si la pantalla
 * dijera $160 y el servidor $190, el cobro se rechazaría.
 *
 * Solo se guardan las excepciones: un producto sin fila aquí vale su precio
 * de mostrador en todos los canales.
 */
export async function listarPreciosDeCanal(sb: ShakeClient): Promise<PreciosDeCanal> {
  const { data, error } = await sb.from('precios_canal').select('producto_id, canal, precio')
  if (error) throw error
  const mapa: PreciosDeCanal = {}
  for (const f of data ?? []) {
    const fila = f as { producto_id: string; canal: string; precio: number }
    mapa[fila.producto_id] ??= {}
    mapa[fila.producto_id][fila.canal] = Number(fila.precio)
  }
  return mapa
}

/**
 * Cuánto cuesta este producto en este canal.
 *
 * Es la MISMA regla que aplica `fn_precio_linea` en la base: si el producto
 * tiene precio para el canal, ese; si no, el de mostrador. Las dos tienen que
 * coincidir o el cobro se rechaza, así que si una cambia hay que cambiar la
 * otra.
 */
export function precioEnCanal(
  producto: { id: string; precio: number },
  canal: CanalDeVenta,
  precios: PreciosDeCanal,
): number {
  return precios[producto.id]?.[canal] ?? producto.precio
}

/** Guarda (o quita) el precio de un producto en un canal. */
export async function guardarPrecioDeCanal(
  sb: ShakeClient,
  productoId: string,
  canal: CanalDeVenta,
  precio: number | null,
): Promise<void> {
  if (precio == null) {
    const { error } = await sb
      .from('precios_canal')
      .delete()
      .eq('producto_id', productoId)
      .eq('canal', canal)
    if (error) throw error
    return
  }
  const { error } = await sb
    .from('precios_canal')
    .upsert({ producto_id: productoId, canal, precio, updated_at: new Date().toISOString() })
  if (error) throw error
}
