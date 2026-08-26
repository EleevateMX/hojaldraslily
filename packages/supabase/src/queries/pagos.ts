import type { Orden, ConfiguracionKiosko, ModoPagoKiosko, OrdenAuditoria } from '@shake/types'
import type { ShakeClient } from '../client'

export interface OrdenItemConProducto {
  id: string
  cantidad: number
  precio_unitario: number
  personalizacion: string | null
  productos: { nombre: string } | null
}

export interface OrdenConItems extends Orden {
  orden_items: OrdenItemConProducto[]
}

/**
 * Deja el criterio de búsqueda en su forma canónica.
 *
 * El QR del kiosko lleva la **liga** al resumen del pedido, para que el
 * cliente pueda abrirlo con la cámara de su celular. Pero un lector USB de
 * caja no abre nada: teclea lo que lee, así que en el buscador del POS
 * aparecería la URL completa. Aquí se le quita todo y se queda el código, de
 * modo que el mismo QR sirve para los dos sin obligar a imprimir dos.
 *
 *   https://kiosko.hojaldraslily.com/pedido/4E68C1  ->  4E68C1
 *   4E68C1                                       ->  4E68C1
 *   39                                           ->  39
 */
export function normalizarCriterioCaja(criterio: string): string {
  let c = criterio.trim()
  if (/^https?:\/\//i.test(c)) {
    try {
      c = new URL(c).pathname.split('/').filter(Boolean).pop() ?? c
    } catch {
      // URL malformada: se sigue con el texto tal cual.
    }
  }
  return c.trim().toUpperCase()
}

/**
 * Aplica el criterio de búsqueda de caja (folio o código corto).
 *
 * El código corto son 6 caracteres hexadecimales, así que **no** se puede
 * decidir con `Number(c)` si lo tecleado es un folio: `Number('4E6821')` da
 * `Infinity` y `Number('000123')` da `123`, y en ambos casos se acababa
 * buscando por folio un código perfectamente válido. Le pasa a ~8% de los
 * códigos posibles — uno de cada doce pedidos no aparecía al escanearlo.
 *
 * Ahora solo cuenta como folio lo que es *únicamente* dígitos, y aun así se
 * busca también por código: "000123" puede ser cualquiera de los dos.
 * El tope de 9 dígitos mantiene el valor dentro del rango de un `int4`.
 */
function aplicarCriterioCaja<T>(query: T, criterio?: string): T {
  if (!criterio || !criterio.trim()) return query
  const c = normalizarCriterioCaja(criterio)
  const q = query as unknown as {
    or: (f: string) => T
    eq: (col: string, val: string) => T
  }
  return /^\d{1,9}$/.test(c) ? q.or(`folio.eq.${c},codigo_corto.eq.${c}`) : q.eq('codigo_corto', c)
}

/** Órdenes de kiosko esperando cobro en caja, con sus items (para la lista de POS). */
export async function listarOrdenesPendientesCajaConItems(
  sb: ShakeClient,
  criterio?: string,
): Promise<OrdenConItems[]> {
  const base = sb
    .from('ordenes')
    .select('*, orden_items(id, cantidad, precio_unitario, personalizacion, productos(nombre))')
    .eq('estado_pago_orden', 'awaiting_counter_payment')
    .order('created_at', { ascending: true })
    .limit(50)

  const { data, error } = await aplicarCriterioCaja(base, criterio)
  if (error) throw error
  return data as OrdenConItems[]
}

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que empleados.ts/ordenes.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface NuevaOrdenItemCaja {
  producto_id: string
  cantidad: number
  personalizacion?: string | null
  /** Ver `NuevaOrdenItem` en ordenes.ts: liga los extras a su producto. */
  linea?: string
  padre_linea?: string | null
}

/**
 * Kiosko, modo "pagar en caja": crea la orden directo en
 * `awaiting_counter_payment`. NO cobra, NO descuenta inventario, NO
 * otorga mancuernas, NO genera pedidos de cocina ni comandas — eso solo
 * ocurre cuando el cajero la cobra desde POS (`cobrarOrden`).
 */
export async function crearOrdenKioskoCaja(
  sb: ShakeClient,
  datos: {
    sucursalId: string
    almacenId: string
    clienteId?: string | null
    descuento?: number
    /** A nombre de quién va el pedido (para la etiqueta y para gritar). */
    nombreCliente?: string | null
  },
  items: NuevaOrdenItemCaja[],
): Promise<Orden> {
  return rpc<Orden>(sb, 'fn_crear_orden_kiosko_caja', {
    p_sucursal_id: datos.sucursalId,
    p_almacen_id: datos.almacenId,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      personalizacion: i.personalizacion ?? null,
      ...(i.linea ? { linea: i.linea } : {}),
      ...(i.padre_linea ? { padre_linea: i.padre_linea } : {}),
    })),
    p_cliente_id: datos.clienteId ?? null,
    p_descuento: datos.descuento ?? 0,
    p_nombre_cliente: datos.nombreCliente ?? null,
  })
}

/**
 * Consulta pública de un pedido por su código corto — la que abre el cliente
 * al escanear el QR del kiosko con su celular.
 *
 * Solo pedidos recientes (2 horas): el código son 6 hexadecimales y no es un
 * secreto, así que se acota la ventana en la que sirve de algo. Pasado ese
 * rato el pedido ya se cobró o expiró, y no hay razón para seguir
 * exponiéndolo.
 */
export async function obtenerOrdenPorCodigo(
  sb: ShakeClient,
  codigo: string,
): Promise<OrdenConItems | null> {
  const c = codigo.trim().toUpperCase()
  if (!/^[0-9A-F]{4,12}$/.test(c)) return null
  const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('ordenes')
    .select('*, orden_items(id, cantidad, precio_unitario, personalizacion, productos(nombre))')
    .eq('codigo_corto', c)
    .gte('created_at', desde)
    .maybeSingle()
  if (error) throw error
  return (data as OrdenConItems | null) ?? null
}

/** POS: busca órdenes de kiosko esperando cobro en caja (folio o código corto). */
export async function buscarOrdenesPendientesCaja(
  sb: ShakeClient,
  criterio?: string,
): Promise<Orden[]> {
  const base = sb
    .from('ordenes')
    .select('*')
    .eq('estado_pago_orden', 'awaiting_counter_payment')
    .order('created_at', { ascending: true })
    .limit(50)

  const { data, error } = await aplicarCriterioCaja(base, criterio)
  if (error) throw error
  return data
}

/** Config de modo de pago del kiosko para una sucursal (fuente de verdad en BD). */
export async function obtenerConfiguracionKiosko(
  sb: ShakeClient,
  sucursalId: string,
): Promise<ConfiguracionKiosko | null> {
  const { data, error } = await sb
    .from('configuracion_kiosko')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listarConfiguracionesKiosko(sb: ShakeClient): Promise<ConfiguracionKiosko[]> {
  const { data, error } = await sb.from('configuracion_kiosko').select('*')
  if (error) throw error
  return data
}

/**
 * Actualiza el modo de pago del kiosko. Si la sucursal está marcada como
 * producción (`sucursales.es_produccion`, default true), la base
 * RECHAZA `modo_pago='demo'` sin importar quién lo pida — no es una
 * validación que se pueda saltar desde el cliente.
 */
export async function actualizarConfiguracionKiosko(
  sb: ShakeClient,
  sucursalId: string,
  modoPago: ModoPagoKiosko,
  opts: { expiraMinutos?: number; clipConfigurado?: boolean } = {},
): Promise<ConfiguracionKiosko> {
  return rpc<ConfiguracionKiosko>(sb, 'fn_actualizar_configuracion_kiosko', {
    p_sucursal_id: sucursalId,
    p_modo_pago: modoPago,
    p_expira_minutos: opts.expiraMinutos ?? null,
    p_clip_configurado: opts.clipConfigurado ?? null,
  })
}

export interface ResultadoReconciliacion {
  orden_id: string
  accion: string
  detalle: string
}

/** Ejecuta la reconciliación de pagos ahora mismo (además del cron de cada minuto). */
export async function reconciliarPagos(sb: ShakeClient): Promise<ResultadoReconciliacion[]> {
  return rpc<ResultadoReconciliacion[]>(sb, 'fn_reconciliar_pagos', {})
}

/** Expira ahora mismo las órdenes de kiosko vencidas (además del cron de cada minuto). */
export async function expirarOrdenesKiosko(sb: ShakeClient): Promise<number> {
  return rpc<number>(sb, 'fn_expirar_ordenes_kiosko', {})
}

export async function listarAuditoriaOrden(sb: ShakeClient, ordenId: string): Promise<OrdenAuditoria[]> {
  const { data, error } = await sb
    .from('ordenes_auditoria')
    .select('*')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Suscripción realtime a una orden específica (kiosko: detecta si el cajero la cobra o expira). */
export function suscribirOrden(sb: ShakeClient, ordenId: string, onCambio: (orden: Orden) => void): () => void {
  const canal = sb
    .channel(`orden-${ordenId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ordenes', filter: `id=eq.${ordenId}` },
      (payload) => onCambio(payload.new as Orden),
    )
    .subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}

/** Suscripción realtime a órdenes esperando cobro en caja (POS). */
export function suscribirOrdenesPendientesCaja(sb: ShakeClient, onCambio: () => void): () => void {
  const canal = sb
    .channel('ordenes-pendientes-caja')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, onCambio)
    .subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}
