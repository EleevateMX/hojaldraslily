import type { ClienteLily } from '../client'

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
  /** Moldes pedidos. */
  moldes: number
  /** De cuántos cuadros es cada molde de ESTE renglón: 48 o 24. */
  molde: Molde
  /** Moldes que producción ya armó. Es un TOTAL, no un incremento. */
  armados: number
  /** Cuántos hay dentro del horno ahorita. */
  enHorno: number
  /** Moldes que ya salieron del horno: lo único que es pan de verdad. */
  horneados: number
  terminado_por: string | null
}

export interface OrdenDeProduccion {
  id: string
  folio: number
  fecha: string
  estado: 'pendiente' | 'en_proceso' | 'en_horno' | 'terminada' | 'cancelada'
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
    cuadros_por_molde: number
    moldes_armados: number
    moldes_en_horno: number
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
  sb: ClienteLily,
  incluirTerminadas = false,
): Promise<OrdenDeProduccion[]> {
  let q = sb
    .from('ordenes_produccion')
    .select(
      'id, folio, fecha, estado, nota, creada_por, created_at,' +
        ' orden_produccion_items(id, sabor, moldes, cuadros_por_molde,' +
        ' moldes_armados, moldes_en_horno, cantidad_hecha, terminado_por)',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  // `en_horno` también sigue abierta: la orden no terminó hasta que el pan
  // salió. Dejarla fuera escondía del tablero justo lo que está en el horno.
  if (!incluirTerminadas) q = q.in('estado', ['pendiente', 'en_proceso', 'en_horno'])

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
      molde: (i.cuadros_por_molde === 24 ? 24 : 48) as Molde,
      armados: i.moldes_armados,
      enHorno: i.moldes_en_horno,
      horneados: i.cantidad_hecha,
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
  sb: ClienteLily,
  items: { sabor: string; moldes: number; molde?: Molde }[],
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
  sb: ClienteLily,
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
  /**
   * Cuándo quedó empacado. Nulo = todavía está en la mesa de empaque.
   *
   * Es una fecha y no un «sí» a propósito: a las seis de la tarde importa
   * saber si se empacó temprano o se acaba de empacar. Empacar no cobra ni
   * descuenta nada — eso sigue siendo `cobrarEncargo`.
   */
  empacado_at: string | null
  empacado_por: string | null
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
  empacado_at: string | null
  empacado_por: string | null
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
  sb: ClienteLily,
  incluirCerrados = false,
): Promise<Encargo[]> {
  let q = sb
    .from('encargos')
    .select(
      'id, folio, cliente, telefono, fecha_entrega, hora_entrega, estado, anticipo,' +
        ' nota, creado_por, created_at, empacado_at, empacado_por,' +
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
      empacado_at: e.empacado_at,
      empacado_por: e.empacado_por,
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
export async function crearEncargo(sb: ClienteLily, e: NuevoEncargo): Promise<string> {
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
 * Marca el encargo como empacado (o lo desmarca, si alguien se equivocó).
 *
 * Empacar **no cobra ni descuenta**: lo único que mueve inventario sigue
 * siendo `cobrarEncargo`. Esto solo dice «ya está en su caja y con su nombre»,
 * que es lo que evita que dos empacadores hagan el mismo encargo dos veces.
 *
 * Se manda el estado al que se quiere llegar, no un alternar: en una pantalla
 * táctil dos toques por nervios tienen que dejarlo empacado, no
 * empacado-y-desempacado.
 */
export async function marcarEmpacado(
  sb: ClienteLily,
  encargoId: string,
  empacado = true,
): Promise<void> {
  const { error } = await sb.rpc('fn_encargo_empacar', {
    p_encargo_id: encargoId,
    p_empacado: empacado,
  })
  if (error) throw error
}

/**
 * La hora de entrega en minutos desde medianoche, para poder ordenar.
 *
 * `hora_entrega` es **texto libre** —la caja lo captura a mano, con un
 * `placeholder` de «10:00»— así que aquí llega de todo: «10:00», «6 pm», «6»,
 * «por la tarde». Se lee lo que se pueda y lo que no, se devuelve `null`: un
 * encargo sin hora legible va al final, que es donde estaba antes de que
 * existiera esta función.
 *
 * No se adivina lo que no está dicho: un «6» pelón se toma como las 6, no
 * como las 18. Si el negocio quiere las seis de la tarde, escribe «6 pm» —
 * inventarle doce horas a un dato es peor que dejarlo al final.
 */
export function minutosDeHora(hora: string | null): number | null {
  if (!hora) return null
  const t = hora.toLowerCase()
  const m = /(\d{1,2})\s*[:.]?\s*(\d{2})?/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  const tarde = /p\.?\s?m|tarde|noche/.test(t)
  const manana = /a\.?\s?m|ma(n|ñ)ana/.test(t)
  if (tarde && h < 12) h += 12
  if (manana && h === 12) h = 0
  return h * 60 + min
}

/** Un renglón de la lista de «qué hay que empacar»: un producto y su total. */
export interface PorEmpacar {
  producto_id: string
  producto: string
  imagen_url: string | null
  cantidad: number
  /** De cuántos encargos distintos sale ese total. */
  encargos: number
}

/**
 * Lo que hay que empacar, sumado por producto.
 *
 * Quien empaca **no empaca por cliente, empaca por producto**: va al mostrador,
 * corta los paquetes y los reparte. Preguntarle «¿cuántas Fiesta de 24 saco?»
 * a una lista de ocho tarjetas de clientes es hacer la suma a mano cada vez, y
 * la suma a mano se equivoca justo el sábado, que es cuando hay ocho tarjetas.
 *
 * Se suma en el navegador y no en la base a propósito: los encargos ya
 * vinieron completos con sus renglones, así que una consulta más solo agregaría
 * una forma de que las dos listas no coincidan.
 */
export function loQueHayQueEmpacar(encargos: Encargo[]): PorEmpacar[] {
  const por = new Map<string, PorEmpacar>()
  for (const e of encargos) {
    for (const i of e.items) {
      const y = por.get(i.producto_id)
      if (y) {
        y.cantidad += i.cantidad
        y.encargos += 1
      } else {
        por.set(i.producto_id, {
          producto_id: i.producto_id,
          producto: i.producto,
          imagen_url: i.imagen_url,
          cantidad: i.cantidad,
          encargos: 1,
        })
      }
    }
  }
  // Lo más numeroso primero: es lo que más tarda y por lo que conviene
  // empezar.
  return [...por.values()].sort((a, b) => b.cantidad - a.cantidad)
}

/**
 * Cobra el encargo. Es lo único que lo descuenta del inventario.
 *
 * Pasa por el mismo camino que una venta de mostrador, así que cae en el corte
 * de caja y saca sus comandas. Es idempotente: dos toques no cobran dos veces.
 * Regresa el total cobrado, que se recalcula con el precio de hoy.
 */
export async function cobrarEncargo(
  sb: ClienteLily,
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
  sb: ClienteLily,
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
  sb: ClienteLily,
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

/**
 * Lo que la lista de precios dice de un producto en un canal.
 *
 * `disponible: false` es la **"X"** de la hoja de precios de la casa: ese
 * producto no se vende en ese canal. No es lo mismo que no tener fila — sin
 * fila, el producto se vende al precio de mostrador.
 */
export interface PrecioDeCanal {
  precio: number
  disponible: boolean
}

/** `producto_id -> canal -> precio`. Solo trae las excepciones. */
export type PreciosDeCanal = Record<string, Record<string, PrecioDeCanal>>

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
export async function listarPreciosDeCanal(sb: ClienteLily): Promise<PreciosDeCanal> {
  const { data, error } = await sb
    .from('precios_canal')
    .select('producto_id, canal, precio, disponible')
  if (error) throw error
  const mapa: PreciosDeCanal = {}
  for (const f of data ?? []) {
    const fila = f as { producto_id: string; canal: string; precio: number; disponible: boolean }
    mapa[fila.producto_id] ??= {}
    mapa[fila.producto_id][fila.canal] = {
      precio: Number(fila.precio),
      disponible: fila.disponible !== false,
    }
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
  const fila = precios[producto.id]?.[canal]
  // Una fila marcada como NO disponible guarda precio 0: es una marca, no un
  // precio. Si se devolviera tal cual, la pantalla ofreceria el producto en
  // cero -- peor que ofrecerlo caro. Quien no se vende en el canal cae al
  // precio de mostrador, y `seVendeEnCanal` se encarga de que ni aparezca.
  if (!fila || !fila.disponible) return producto.precio
  return fila.precio
}

/**
 * ¿Este producto se vende en este canal?
 *
 * La caja tiene que ESCONDER lo que no va en la plataforma, no solo dejar que
 * el servidor lo rechace al cobrar: enterarse al final, con el cliente
 * enfrente y el pedido armado, es enterarse tarde. Misma regla que
 * `fn_producto_va_en_canal` en la base; si cambia una, cambia la otra.
 */
export function seVendeEnCanal(
  producto: { id: string },
  canal: CanalDeVenta,
  precios: PreciosDeCanal,
): boolean {
  return precios[producto.id]?.[canal]?.disponible !== false
}

/** Guarda (o quita) el precio de un producto en un canal. */
export async function guardarPrecioDeCanal(
  sb: ClienteLily,
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
  const { error } = await sb.from('precios_canal').upsert({
    producto_id: productoId,
    canal,
    precio,
    disponible: true,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// El camino del pan: Producción → Horno → Empaque
//
// Tres manos y tres momentos. Lo que importa entender es **cuándo hay pan**:
// un molde armado no es pan, un molde dentro del horno tampoco. El inventario
// sube cuando SALE del horno, y por eso `sacarDelHorno` es la única de las
// tres que mueve existencias.
//
// Si se contara al armar, la caja podría vender una hojaldra que todavía es
// masa cruda.
// ---------------------------------------------------------------------------

/** Los dos moldes que existen en la casa. */
export const MOLDES = [48, 24] as const
export type Molde = (typeof MOLDES)[number]

export interface EnElHorno {
  item_id: string
  folio: number
  sabor: string
  /** La foto del sabor, la misma que ve el kiosko. Frente al horno se
   *  reconoce el pan de un vistazo; su nombre completo, a dos metros, no. */
  imagen_url: string | null
  /** Moldes que hay dentro ahorita. */
  moldes: number
  /** De cuántos cuadros es cada molde: 48 o 24. */
  molde: Molde
  cuadros: number
  entro_en: string
  listo_en: string
  minutos: number
  tarde: boolean
}

export interface EsperandoHorno {
  item_id: string
  folio: number
  sabor: string
  imagen_url: string | null
  moldes: number
  molde: Molde
  cuadros: number
  minutos: number
}

export interface SinArmar {
  item_id: string
  folio: number
  sabor: string
  imagen_url: string | null
  moldes: number
  molde: Molde
}

export interface HornoEnVivo {
  ahora: string
  adentro: EnElHorno[]
  esperando: EsperandoHorno[]
  sin_armar: SinArmar[]
  resumen: {
    en_horno: number
    esperando: number
    sin_armar: number
    /** Cuántas tandas ya se pasaron de su hora. */
    tarde: number
  }
}

/**
 * Qué hay en el horno, qué espera turno y qué falta armar.
 *
 * La usan tres pantallas: el propio Horno, la Caja (que necesita saber qué
 * contestarle a un cliente que pregunta) y Admin. Una sola consulta para las
 * tres, porque si cada una calculara lo suyo terminarían diciendo cosas
 * distintas del mismo horno.
 */
export async function hornoEnVivo(sb: ClienteLily): Promise<HornoEnVivo> {
  const { data, error } = await sb.rpc('fn_horno_en_vivo')
  if (error) throw error
  return data as unknown as HornoEnVivo
}

/**
 * Producción armó moldes. Se manda el TOTAL, no un incremento.
 *
 * La pantalla muestra «van 3»; quien corrige escribe el número que ve, no la
 * diferencia. Es la misma razón por la que el conteo de inventario pide lo
 * contado y no el ajuste.
 */
export async function armarMoldes(
  sb: ClienteLily,
  itemId: string,
  moldes: number,
): Promise<{ armados: number; pedidos: number }> {
  const { data, error } = await sb.rpc('fn_produccion_armar', {
    p_item_id: itemId,
    p_moldes: moldes,
  })
  if (error) throw error
  return data as unknown as { armados: number; pedidos: number }
}

/** Al horno. Devuelve a qué hora sale, para arrancar el reloj. */
export async function meterAlHorno(
  sb: ClienteLily,
  itemId: string,
  moldes = 1,
): Promise<{ en_horno: number; minutos: number; listo_en: string }> {
  const { data, error } = await sb.rpc('fn_horno_meter', {
    p_item_id: itemId,
    p_moldes: moldes,
  })
  if (error) throw error
  return data as unknown as { en_horno: number; minutos: number; listo_en: string }
}

/**
 * Del horno al inventario. **Este es el momento en que hay pan.**
 *
 * Sin `moldes` sale todo lo que haya adentro, que es el gesto normal y
 * conviene que sea de un solo toque: quien saca una charola tiene las manos
 * ocupadas y guantes puestos.
 */
export async function sacarDelHorno(
  sb: ClienteLily,
  itemId: string,
  moldes?: number,
): Promise<{ sacados: number; sabor: string; cuadros: number; libres: number }> {
  const { data, error } = await sb.rpc('fn_horno_sacar', {
    p_item_id: itemId,
    p_moldes: moldes ?? undefined,
  })
  if (error) throw error
  return data as unknown as { sacados: number; sabor: string; cuadros: number; libres: number }
}

/**
 * Cuánto falta para que salga, en palabras.
 *
 * Reusa `faltaPara`, que ya sabe decir «5 min tarde» en vez de «en −5 min».
 * Un horno que promete un número negativo no lo lee nadie.
 */
export function relojDelHorno(listoEn: string, ahora = new Date()) {
  return faltaPara(listoEn, ahora)
}
