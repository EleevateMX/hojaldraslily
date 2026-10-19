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
  /** Cuántos se pidieron: moldes o piezas, según `unidad`. */
  moldes: number
  /**
   * Cómo se cuenta este renglón.
   *
   * `'molde'` son las hojaldras: salen de un molde de 48 o de 24 cuadros y de
   * ahí se cortan los paquetes. `'pieza'` es todo lo que **no** sale de un
   * molde —las roscas, la Trenza Suiza, las Patas, los Tutis, las galletas, lo
   * de anís, el Pan de Muerto, la Hojaldra de Corazón, los bocadillos—: se
   * hornea al pedido y no se cuenta en cuadros.
   */
  unidad: 'molde' | 'pieza'
  /**
   * De cuántos cuadros es cada molde de ESTE renglón: 48 o 24.
   *
   * `null` cuando se cuenta en piezas. No es un 48 de relleno a propósito: una
   * rosca no tiene molde, y un 48 inventado se sumaría como cuadros que no
   * existen.
   */
  molde: Molde | null
  /** Moldes que producción ya armó. Es un TOTAL, no un incremento. */
  armados: number
  /** Cuántos hay dentro del horno ahorita. */
  enHorno: number
  /** Moldes que ya salieron del horno: lo único que es pan de verdad. */
  horneados: number
  /**
   * Cuántas masas le quedan a producción para este renglón.
   *
   * `null` NO es cero: es «todavía nadie contó». Lo teclea la mesa, no lo
   * calcula el sistema, porque una masa no rinde siempre los mismos moldes.
   */
  masas: number | null
  terminado_por: string | null
}

export interface OrdenDeProduccion {
  id: string
  folio: number
  fecha: string
  estado: 'pendiente' | 'en_proceso' | 'en_horno' | 'terminada' | 'cancelada'
  nota: string | null
  /**
   * A qué hora tiene que estar lista: «antes de las 12».
   *
   * Texto libre, leído con la tolerancia de `minutosDeHora`. `null` es **sin
   * hora**, no medianoche: una orden sin hora no es una urgentísima, es una
   * que no la lleva.
   */
  hora_objetivo: string | null
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
  hora_objetivo: string | null
  creada_por: string | null
  created_at: string
  orden_produccion_items: {
    id: string
    sabor: string | null
    moldes: number | null
    cuadros_por_molde: number | null
    unidad: 'molde' | 'pieza'
    moldes_armados: number
    moldes_en_horno: number
    cantidad_hecha: number
    terminado_por: string | null
    masas_restantes: number | null
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
      'id, folio, fecha, estado, nota, hora_objetivo, creada_por, created_at,' +
        ' orden_produccion_items(id, sabor, moldes, cuadros_por_molde, unidad,' +
        ' moldes_armados, moldes_en_horno, cantidad_hecha, terminado_por,' +
        ' masas_restantes)',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  // `en_horno` también sigue abierta: la orden no terminó hasta que el pan
  // salió. Dejarla fuera escondía del tablero justo lo que está en el horno.
  if (!incluirTerminadas) q = q.in('estado', ['pendiente', 'en_proceso', 'en_horno'])

  const { data, error } = await q
  if (error) throw error

  // Las fotos, en una consulta aparte.
  //
  // Un renglón de producción guarda el SABOR en texto, no un producto: se
  // hornea guayaba, no «Guayaba 12». Así que no hay a quién colgarle un join
  // y la foto se busca por sabor, igual que hace `fn_horno_en_vivo`.
  //
  // Iba `imagen_url: null` escrito a mano, así que la pantalla tenía el
  // código para pintar la foto y no pintó una sola nunca. Frente a la mesa,
  // con las manos llenas de masa, se reconoce el pan de un vistazo; leer
  // «Pasta de Guayaba y Queso de Bola» a dos metros, no.
  // Los renglones de PIEZA guardan el **nombre** del producto en `sabor` —una
  // rosca no tiene sabor de hojaldra— así que el mapa se llena por las dos
  // llaves. Con solo `sabor`, las roscas y los panes salían sin foto, que es
  // el mismo defecto que ya había dejado a esta pantalla sin pintar una sola.
  const fotos = new Map<string, string>()
  const { data: prods } = await sb
    .from('productos')
    .select('nombre, sabor, imagen_url')
    .not('imagen_url', 'is', null)
  for (const p of (prods ?? []) as {
    nombre: string
    sabor: string | null
    imagen_url: string | null
  }[]) {
    if (!p.imagen_url) continue
    if (p.sabor && !fotos.has(p.sabor)) fotos.set(p.sabor, p.imagen_url)
    if (p.nombre && !fotos.has(p.nombre)) fotos.set(p.nombre, p.imagen_url)
  }

  return ((data ?? []) as unknown as FilaOrden[]).map((o) => ({
    id: o.id,
    folio: o.folio,
    fecha: o.fecha,
    estado: o.estado,
    nota: o.nota,
    hora_objetivo: o.hora_objetivo,
    creada_por: o.creada_por,
    created_at: o.created_at,
    items: (o.orden_produccion_items ?? []).map((i) => ({
      id: i.id,
      sabor: i.sabor ?? '—',
      imagen_url: (i.sabor && fotos.get(i.sabor)) || null,
      moldes: i.moldes ?? 0,
      unidad: i.unidad === 'pieza' ? 'pieza' : 'molde',
      // Un renglón de pieza no tiene molde, y aquí NO se le pone 48 por
      // defecto: la pantalla lo necesita en null para no escribir «moldes de
      // 48 cuadros» debajo de veinte roscas.
      molde:
        i.unidad === 'pieza' || i.cuadros_por_molde == null
          ? null
          : ((i.cuadros_por_molde === 24 ? 24 : 48) as Molde),
      armados: i.moldes_armados,
      enHorno: i.moldes_en_horno,
      horneados: i.cantidad_hecha,
      masas: i.masas_restantes ?? null,
      terminado_por: i.terminado_por,
    })),
  }))
}

/**
 * Apunta cuántas masas le quedan a producción en un renglón.
 *
 * Lo teclea la mesa: el sistema no lo calcula, porque una masa no rinde
 * siempre los mismos moldes y la gente de la mesa lo sabe mejor. Pasar
 * `null` borra la cuenta y vuelve a «nadie contó».
 */
export async function apuntarMasas(
  sb: ClienteLily,
  itemId: string,
  masas: number | null,
): Promise<number | null> {
  const { data, error } = await sb.rpc('fn_produccion_masas', {
    p_item_id: itemId,
    p_masas: masas as number,
  })
  if (error) throw error
  return data === null ? null : Number(data)
}

/**
 * Manda a hacer. Cada renglón lleva su propia cuenta.
 *
 * Las hojaldras se piden en **moldes** de un sabor, no en paquetes, porque así
 * se hornea: sale un molde de 48 cuadros y de ahí se cortan los paquetes
 * conforme se venden. Pedir «10 paquetes de 12» obligaría a decidir en el
 * horno algo que se decide en el mostrador.
 *
 * Pero media panadería **no sale de un molde** —las roscas, la Trenza Suiza,
 * las Patas, los Tutis, las galletas, lo de anís, el Pan de Muerto, la
 * Hojaldra de Corazón, los bocadillos—. Eso va con `unidad: 'pieza'` y se pide
 * en piezas, con `sabor` = el nombre del producto y **sin molde**.
 *
 * Y el molde va por RENGLÓN, no por envío: en una misma hornada caben tres
 * moldes de 48 de guayaba y dos de 24 de queso. Un solo molde para todo el
 * envío obliga a mentir en uno de los dos renglones.
 */
export async function mandarAProducir(
  sb: ClienteLily,
  items: {
    sabor: string
    moldes: number
    molde?: Molde | null
    unidad?: 'molde' | 'pieza'
  }[],
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
 * Pone (o quita) la hora a la que esa orden tiene que estar lista.
 *
 * La casa lo pidió así: «diez jamón y queso y cinco fiestas antes de las 12».
 * Una orden traía qué y cuánto pero no para cuándo, y el único orden posible
 * en la mesa era el de captura — o sea el orden en que gerencia se acordó de
 * las cosas.
 *
 * Va aparte de `mandarAProducir` y no como un parámetro suyo porque cambiarle
 * la firma a una función de Postgres **no la reemplaza, la duplica** (§4). Y
 * de todos modos hacía falta sola: gerencia mueve la hora de una orden ya
 * mandada.
 *
 * Cadena vacía borra la hora.
 */
export async function fijarHoraDeProduccion(
  sb: ClienteLily,
  ordenId: string,
  hora: string,
): Promise<string | null> {
  const { data, error } = await sb.rpc('fn_produccion_fijar_hora', {
    p_orden_id: ordenId,
    p_hora: hora,
  })
  if (error) throw error
  return (data as string | null) ?? null
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
  para_viaje: boolean
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
  para_viaje: boolean
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
      'id, folio, cliente, telefono, fecha_entrega, hora_entrega, estado, anticipo, para_viaje,' +
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

  return armarEncargos(data)
}

/**
 * Las filas crudas, armadas en encargos.
 *
 * Vive aparte porque la cola de pendientes y el historial piden lo mismo con
 * filtros distintos. Escrito dos veces, el total de uno y el del otro se
 * separan el día que alguien toque una de las dos.
 */
function armarEncargos(data: unknown): Encargo[] {
  return ((data ?? []) as FilaEncargo[]).map((e) => {
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
      para_viaje: Boolean(e.para_viaje),
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

/**
 * La hora de entrega, escrita como la lee la casa: 12 horas con a.m./p.m.
 *
 * `hora_entrega` es texto libre capturado en la caja, así que llegan «10:00»,
 * «6 pm», «6» y «por la tarde». Esto NO corrige el dato: lo pinta. Si
 * `minutosDeHora` pudo leerlo, se pinta normalizado; si no, **se devuelve tal
 * cual lo escribieron**.
 *
 * Esa última parte es a propósito y es la misma regla que ya rige el orden de
 * la cola: a un dato que no se entiende no se le inventa una hora. «por la
 * tarde» se queda como «por la tarde» y quien lee decide, en vez de leer un
 * «12:00 p.m.» que nadie escribió.
 */
export function horaEn12h(hora: string | null): string {
  if (!hora) return ''
  const min = minutosDeHora(hora)
  if (min === null) return hora.trim()
  const h24 = Math.floor(min / 60)
  const mm = min % 60
  const sufijo = h24 < 12 ? 'a.m.' : 'p.m.'
  // 0 → 12 a.m. y 12 → 12 p.m.: el reloj de 12 no tiene hora cero.
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${sufijo}`
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
 * Hasta qué hora un encargo del día siguiente es «tempranero»: 10:30 a.m.
 *
 * Lo puso la casa: un encargo que se recoge antes de esa hora no da tiempo
 * de prepararlo esa misma mañana, así que se trabaja la tarde anterior. Vive
 * aquí y no en cada pantalla para que Empaque y Admin partan el día igual.
 */
export const TEMPRANO_HASTA_MIN = 10 * 60 + 30

/** ¿Es un encargo de MAÑANA que se recoge antes de las 10:30? */
export function esTempranoDeManana(e: Encargo, hoy = new Date()): boolean {
  if (!e.fecha_entrega || diasHasta(e.fecha_entrega, hoy) !== 1) return false
  const min = minutosDeHora(e.hora_entrega)
  return min !== null && min <= TEMPRANO_HASTA_MIN
}

/**
 * Las fichas del día para gerencia: lo de hoy (y lo atrasado) por hora, y
 * aparte lo de mañana temprano.
 *
 * Es la vista de control que pidió la casa: «si tienes un encargo a las 12 y
 * otro a la 1:02, que aparezcan ahí como fichas de ese día». Lo atrasado
 * entra en «hoy» porque sigue en una bolsa con el nombre de alguien; lo de
 * mañana temprano va aparte porque se prepara hoy en la tarde.
 */
export function fichasDeEncargos(encargos: Encargo[], hoy = new Date()): {
  hoy: HoraDeEncargos[]
  mananaTemprano: Encargo[]
} {
  const deHoy = encargos.filter((e) => !e.fecha_entrega || diasHasta(e.fecha_entrega, hoy) <= 0)
  return {
    hoy: encargosPorHora(deHoy),
    mananaTemprano: encargos.filter((e) => esTempranoDeManana(e, hoy)).sort((a, b) => {
      const ha = minutosDeHora(a.hora_entrega) ?? 9999
      const hb = minutosDeHora(b.hora_entrega) ?? 9999
      return ha - hb
    }),
  }
}

/** Una franja de hora con lo que hay que tener listo para entonces. */
export interface FranjaPorEmpacar {
  /** La hora en punto, en minutos desde medianoche. `null` = sin hora legible. */
  minutos: number | null
  /** «Para las 12:00 p.m.», «Sin hora». */
  titulo: string
  lista: PorEmpacar[]
  encargos: number
}

/**
 * Lo que hay que tener listo, **por hora y por producto**.
 *
 * Es la pregunta de la casa tal cual: «¿qué hay que entregar antes de las 12?
 * — diez de jamón y queso y cinco Fiesta». La suma por producto a secas dice
 * cuánto sacar en el día; esta dice **para cuándo**, que es lo que decide qué
 * se hornea primero y qué se empaca primero. Reusa los bloques de hora de la
 * cola (`encargosPorHora`), así que las dos pantallas parten el día igual.
 */
export function loQueHayQueEmpacarPorHora(encargos: Encargo[]): FranjaPorEmpacar[] {
  return encargosPorHora(encargos).map((h) => ({
    minutos: h.minutos,
    titulo: h.minutos === null ? 'Sin hora' : `Para las ${h.titulo}`,
    lista: loQueHayQueEmpacar(h.encargos),
    encargos: h.encargos.length,
  }))
}

/**
 * Avisa en vivo cuando cambia algo del camino del pan: una orden mandada a
 * hacer, un molde armado, una charola que entra o sale del horno, un encargo
 * apartado o empacado.
 *
 * Las pantallas ya se releen solas cada 10 s y eso **se queda** como red: el
 * canal puede morir sin avisar. Esto es para lo que la casa pidió —que al sacar
 * del horno la caja lo vea ahí mismo— sin tener que bajar el poll a dos
 * segundos y multiplicar consultas. Las cuatro tablas están en la publicación
 * de Realtime (`20261019180000`) y Realtime respeta RLS: solo lo ve quien
 * entró con PIN, igual que la consulta.
 */
export function suscribirProduccion(sb: ClienteLily, onCambio: () => void): () => void {
  let canal: ReturnType<ClienteLily['channel']> | null = null
  let apagado = false
  let reintento: ReturnType<typeof setTimeout> | null = null
  // Un UPDATE del horno toca varias filas seguidas (el renglón, el trigger de
  // `produccion`, el estado de la orden): se junta en una sola relectura.
  let espera: ReturnType<typeof setTimeout> | null = null
  const avisar = () => {
    if (espera) clearTimeout(espera)
    espera = setTimeout(onCambio, 250)
  }

  const conectar = () => {
    if (apagado) return
    canal = sb
      .channel('camino-del-pan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_produccion' }, avisar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orden_produccion_items' }, avisar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produccion' }, avisar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encargos' }, avisar)
      .subscribe((estado) => {
        if (apagado) return
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          if (canal) void sb.removeChannel(canal)
          canal = null
          if (reintento) clearTimeout(reintento)
          reintento = setTimeout(conectar, 5000)
        }
      })
  }
  conectar()

  return () => {
    apagado = true
    if (reintento) clearTimeout(reintento)
    if (espera) clearTimeout(espera)
    if (canal) void sb.removeChannel(canal)
  }
}

/**
 * Cobra el SALDO del encargo. Es lo único que lo descuenta del inventario.
 *
 * Pasa por el mismo camino que una venta de mostrador, así que cae en el corte
 * de caja y saca sus comandas. Es idempotente: dos toques no cobran dos veces.
 *
 * Regresa **lo que se cobró ahora**, no el total del encargo: si el cliente
 * había dejado anticipo, eso ya entró al corte el día que lo dejó y aquí solo
 * se cobra lo que falta. Es el número que hay que pedirle en el mostrador.
 */
/**
 * Marca (o desmarca) que el encargo **va de viaje**.
 *
 * No es un adorno: cambia cómo se empaca —va sellado y sin glass encima— así
 * que empaque tiene que verlo **antes** de armarlo, no al entregarlo.
 */
export async function marcarEncargoDeViaje(
  sb: ClienteLily,
  encargoId: string,
  paraViaje = true,
): Promise<boolean> {
  const { data, error } = await sb.rpc('fn_encargo_marcar_viaje', {
    p_encargo_id: encargoId,
    p_para_viaje: paraViaje,
  })
  if (error) throw error
  return Boolean(data)
}

/** Lo que se sabe de un cliente al teclear su teléfono. */
export interface ClienteConocido {
  cliente: string
  telefono: string | null
  encargos: number
  ultimo: string | null
}

/**
 * Busca al cliente por su teléfono para no volver a teclearle los datos.
 *
 * El historial de encargos **es** el directorio: ya guardan nombre y
 * teléfono, así que una tabla aparte solo sería algo más que mantener
 * sincronizado. Compara solo los dígitos, de modo que «999 123 45 67»
 * encuentra al que alguien guardó como `9991234567`.
 *
 * Devuelve `null` cuando no hay nadie, que es lo normal con un cliente nuevo
 * y no un error que haya que enseñar en rojo.
 */
export async function clientePorTelefono(
  sb: ClienteLily,
  telefono: string,
): Promise<ClienteConocido | null> {
  const digitos = telefono.replace(/\D/g, '')
  if (digitos.length < 7) return null
  const { data, error } = await sb.rpc('fn_encargo_cliente_por_telefono', {
    p_telefono: digitos,
  })
  if (error) throw error
  const fila = (data as ClienteConocido[] | null)?.[0]
  return fila ?? null
}

/**
 * Recibe un anticipo de un encargo y **lo mete al corte**.
 *
 * El anticipo se cobra como una orden propia sin renglones: es dinero a
 * cuenta, no pan. Por eso entra al corte del día en que se recibió —que es el
 * día en que de verdad entró al cajón— y el pan se descuenta después, al
 * entregar, una sola vez.
 *
 * Antes esto solo se anotaba en `encargos.anticipo` y el efectivo se quedaba
 * en el cajón sin pasar por ninguna orden: al cerrar, el corte pedía menos de
 * lo que había y la diferencia no tenía de dónde salir.
 *
 * El servidor acota el monto contra el total del encargo, así que no se puede
 * anticipar más de lo que se debe. Regresa el anticipo acumulado.
 */
export async function registrarAnticipo(
  sb: ClienteLily,
  encargoId: string,
  monto: number,
  metodo: 'efectivo' | 'tarjeta' = 'efectivo',
): Promise<number> {
  const { data, error } = await sb.rpc('fn_encargo_anticipo', {
    p_encargo_id: encargoId,
    p_monto: monto,
    p_metodo: metodo,
  })
  if (error) throw error
  return Number(data ?? 0)
}

/**
 * Entrega el encargo **y** cobra en el mismo ticket lo que el cliente se lleve
 * de más.
 *
 * Pasa todos los días y hasta hoy había que hacerlo en dos cobros: «vienen por
 * su encargo y de paso se llevan unas galletas». Dos cobros son dos papeles,
 * dos movimientos en el corte y, con la terminal, dos veces que el cliente
 * teclea su NIP por la misma visita.
 *
 * Es UNA orden con todos los renglones —los del encargo y los de más—, un solo
 * pago y un solo ticket. El anticipo ya recibido se descuenta del total, y el
 * encargo queda cerrado contra esa orden.
 *
 * Los importes van partidos en `efectivo` y `tarjeta` para que el pago mixto
 * funcione igual que en una venta normal; con uno de los dos en cero se cobra
 * del otro. El servidor valida que sumen el total que él calculó: el navegador
 * no manda precios.
 */
export async function entregarEncargoConVenta(
  sb: ClienteLily,
  encargoId: string,
  venta: {
    sucursal_id: string
    almacen_id: string
    canal: CanalDeVenta
    corte_id: string
    empleado_id?: string | null
    descuento?: number
    efectivo?: number
    tarjeta?: number
    referencia?: string | null
    idempotencyKey?: string
  },
  items: { producto_id: string; cantidad: number }[],
): Promise<{
  orden_id: string
  folio: number
  encargo: number
  total: number
  anticipo: number
  cobrado: number
}> {
  const { data, error } = await sb.rpc('fn_encargo_entregar_con_venta', {
    p_encargo_id: encargoId,
    p_sucursal_id: venta.sucursal_id,
    p_almacen_id: venta.almacen_id,
    p_canal: venta.canal,
    p_items: items,
    p_corte_id: venta.corte_id,
    p_empleado_id: venta.empleado_id ?? undefined,
    p_descuento: venta.descuento ?? 0,
    p_efectivo: venta.efectivo ?? 0,
    p_tarjeta: venta.tarjeta ?? 0,
    p_referencia: venta.referencia ?? undefined,
    p_idempotency_key: venta.idempotencyKey ?? undefined,
  })
  if (error) throw error
  return data as unknown as {
    orden_id: string
    folio: number
    encargo: number
    total: number
    anticipo: number
    cobrado: number
  }
}

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
  // En Mérida y en 12 h, aunque Admin se abra desde un teléfono en otra zona.
  return new Date(listoEstimado).toLocaleTimeString('es-MX', {
    timeZone: 'America/Merida',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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

/**
 * Cómo se cuenta un renglón del horno.
 *
 * `'pieza'` es lo que no sale de un molde: las roscas, la Trenza Suiza, las
 * Patas, los Tutis, las galletas, lo de anís, el Pan de Muerto, la Hojaldra de
 * Corazón, los bocadillos. Ahí `molde` y `cuadros` llegan en **null**, y la
 * pantalla tiene que escribir «3 piezas», no «3 moldes de 48».
 */
export type UnidadDeProduccion = 'molde' | 'pieza'

export interface EnElHorno {
  item_id: string
  sabor: string
  folio: number
  /** La foto del sabor, la misma que ve el kiosko. Frente al horno se
   *  reconoce el pan de un vistazo; su nombre completo, a dos metros, no. */
  imagen_url: string | null
  /** Cuántos hay dentro ahorita: moldes o piezas, según `unidad`. */
  moldes: number
  unidad: UnidadDeProduccion
  /** De cuántos cuadros es cada molde: 48 o 24. `null` si va en piezas. */
  molde: Molde | null
  /** Cuadros que representa. `null` si va en piezas: eso no se cuenta así. */
  cuadros: number | null
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
  unidad: UnidadDeProduccion
  molde: Molde | null
  cuadros: number | null
  minutos: number
}

export interface SinArmar {
  item_id: string
  folio: number
  sabor: string
  imagen_url: string | null
  moldes: number
  unidad: UnidadDeProduccion
  molde: Molde | null
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
): Promise<{
  sacados: number
  sabor: string
  unidad: UnidadDeProduccion
  /** `null` cuando va en piezas: eso no se cuenta en cuadros. */
  cuadros: number | null
  /** Cuadros libres del sabor. `null` cuando va en piezas: no lleva existencia. */
  libres: number | null
}> {
  const { data, error } = await sb.rpc('fn_horno_sacar', {
    p_item_id: itemId,
    p_moldes: moldes ?? undefined,
  })
  if (error) throw error
  return data as unknown as {
    sacados: number
    sabor: string
    unidad: UnidadDeProduccion
    cuadros: number | null
    libres: number | null
  }
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

/**
 * Los encargos que ya se cerraron: cobrados, entregados o cancelados.
 *
 * Existe porque hasta hoy un encargo recogido **desaparecía**: la lista solo
 * traía los apartados, así que cuando alguien volvía con un reclamo —«¿qué
 * pedí?», «¿cuánto pagué?», «me faltó una caja»— no había dónde mirarlo. El
 * dato siempre estuvo en la tabla; lo que faltaba era la pregunta.
 *
 * Va del más reciente al más viejo, al revés que la cola de pendientes: ahí
 * importa lo que viene, aquí lo que acaba de pasar.
 */
export async function historialDeEncargos(
  sb: ClienteLily,
  limite = 100,
): Promise<Encargo[]> {
  const { data, error } = await sb
    .from('encargos')
    .select(
      'id, folio, cliente, telefono, fecha_entrega, hora_entrega, estado, anticipo, para_viaje,' +
        ' nota, creado_por, created_at, empacado_at, empacado_por,' +
        ' encargo_items(id, producto_id, cantidad, precio_unitario,' +
        ' productos(nombre, imagen_url))',
    )
    .neq('estado', 'apartado')
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return armarEncargos(data)
}

// ------------------------- los encargos, por día -------------------------

/** Un día de la cola de encargos, con su rótulo ya escrito. */
export interface DiaDeEncargos {
  /** `YYYY-MM-DD`, o `null` para los que no traen fecha. */
  fecha: string | null
  /** Lo que se lee en el separador: «Hoy · lunes 20», «miércoles 22». */
  titulo: string
  /** ¿Ya se pasó su día? Lo que lleva días esperando es lo primero que duele. */
  vencido: boolean
  encargos: Encargo[]
  /**
   * Los mismos encargos, además agrupados por hora de entrega.
   *
   * Va aquí y no en una función aparte para que las dos listas **no se puedan
   * separar**: si una pantalla pintara los días con un cálculo y las horas con
   * otro, tarde o temprano dirían cosas distintas del mismo sábado.
   */
  horas: HoraDeEncargos[]
}

/** Una hora de la cola de un día. */
export interface HoraDeEncargos {
  /** La hora en punto, en minutos desde medianoche. `null` = sin hora legible. */
  minutos: number | null
  /** Lo que se lee en el separador: «10:00 a.m.», «Sin hora». */
  titulo: string
  encargos: Encargo[]
}

/**
 * Los encargos de un día, partidos por hora de entrega.
 *
 * La casa lo pidió —«en los encargos que se despliegue por horas»— y es la
 * pregunta del mostrador a media mañana: *«¿qué sale a las 12?»*. Una lista
 * ordenada por hora ya se podía leer, pero hay que ir sumando con el dedo;
 * con el separador se ve el bloque de un vistazo.
 *
 * Se agrupa por la **hora en punto**, no por la hora exacta: las 10:00 y las
 * 10:30 son el mismo viaje al mostrador, y partirlas en dos bloques de uno
 * cada uno no agrupa nada.
 *
 * Lo que no trae hora legible va al final en su propio bloque. `hora_entrega`
 * es texto libre —llega «10:00», «6 pm», «6» y «por la tarde»— y a un dato que
 * no se entiende no se le inventa una hora.
 */
export function encargosPorHora(encargos: Encargo[]): HoraDeEncargos[] {
  const bloques = new Map<number | null, Encargo[]>()
  for (const e of encargos) {
    const min = minutosDeHora(e.hora_entrega)
    const clave = min === null ? null : Math.floor(min / 60) * 60
    const l = bloques.get(clave) ?? []
    l.push(e)
    bloques.set(clave, l)
  }
  return [...bloques.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0
      if (a === null) return 1
      if (b === null) return -1
      return a - b
    })
    .map(([minutos, lista]) => ({
      minutos,
      titulo: minutos === null ? 'Sin hora' : horaEn12h(`${Math.floor(minutos / 60)}:00`),
      encargos: [...lista].sort((x, y) => {
        const hx = minutosDeHora(x.hora_entrega)
        const hy = minutosDeHora(y.hora_entrega)
        if (hx === hy) return x.folio - y.folio
        if (hx === null) return 1
        if (hy === null) return -1
        return hx - hy
      }),
    }))
}

/**
 * Cuántos días faltan para una fecha, contra hoy.
 *
 * Las dos al **mediodía** a propósito: comparando contra la medianoche queda
 * medio día de diferencia y `Math.round` rotula «Mañana» un encargo de HOY.
 */
export function diasHasta(fecha: string, hoy = new Date()): number {
  const entrega = new Date(fecha + 'T12:00:00')
  const d = new Date(hoy)
  d.setHours(12, 0, 0, 0)
  return Math.round((entrega.getTime() - d.getTime()) / 86400000)
}

/**
 * El rótulo del separador de un día.
 *
 * «Hoy» y «Mañana» van primero porque es lo que de verdad se pregunta en el
 * mostrador, pero **el día y el número van siempre detrás**: la casa pidió
 * verlos («Lunes 20», «Martes 21»), y a media mañana del día siguiente un
 * «Hoy» a secas ya no dice de qué día hablaba la lista.
 */
export function tituloDelDia(fecha: string | null, hoy = new Date()): string {
  if (!fecha) return 'Sin fecha'
  const dia = new Date(fecha + 'T12:00:00')
  const largo = dia.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' })
  const conMayuscula = largo.charAt(0).toUpperCase() + largo.slice(1)
  const d = diasHasta(fecha, hoy)
  if (d === 0) return `Hoy · ${largo}`
  if (d === 1) return `Mañana · ${largo}`
  if (d < 0) return `Se pasó · ${largo}`
  return conMayuscula
}

/**
 * Los encargos partidos por día de entrega, en el orden en que se atienden.
 *
 * La casa lo pidió así —«Lunes 20: encargo 1, 2, 3; Martes 21: …»— porque una
 * lista corrida de treinta tarjetas no deja ver de cuáles hay que preocuparse
 * HOY. Dentro de cada día van por hora, leída con tolerancia: `hora_entrega`
 * es texto libre capturado a mano («10:00», «6 pm», «6», «por la tarde»), así
 * que lo ilegible se va al final de SU día en vez de inventarle una hora.
 *
 * Los que no traen fecha van al final de todo: son los de «paso más tarde»,
 * no los del sábado.
 */
export function encargosPorDia(encargos: Encargo[], hoy = new Date()): DiaDeEncargos[] {
  const dias = new Map<string, Encargo[]>()
  for (const e of encargos) {
    const clave = e.fecha_entrega ?? ''
    const l = dias.get(clave) ?? []
    l.push(e)
    dias.set(clave, l)
  }

  return [...dias.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0
      if (a === '') return 1
      if (b === '') return -1
      return a < b ? -1 : 1
    })
    .map(([clave, lista]) => {
      const horas = encargosPorHora(lista)
      return {
        fecha: clave || null,
        titulo: tituloDelDia(clave || null, hoy),
        vencido: clave !== '' && diasHasta(clave, hoy) < 0,
        // La lista plana del día sale de los bloques de hora, no de un
        // segundo ordenamiento: así las dos no se pueden despegar.
        encargos: horas.flatMap((h) => h.encargos),
        horas,
      }
    })
}
