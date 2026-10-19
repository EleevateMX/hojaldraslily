/**
 * Los TIPOS del ticket, sin una sola línea de navegador.
 *
 * Viven aparte porque los usan dos mundos que no comparten plataforma: el
 * HTML del ticket (`ticket.ts`, que toca `document` para imprimir) y el
 * armador de líneas de la térmica (`ticketLineas.ts`), que corre en **Node**
 * dentro del agente de caja.
 *
 * Sin esta separación, `tsc` del agente seguía el `import type` hasta
 * `ticket.ts` y reventaba con «Cannot find name 'document'». Es el mismo
 * tropiezo que ya está anotado con `vite.config.ts`: lo que importa Node no
 * es lo que importa el navegador, y un `import type` no se borra para el
 * compilador aunque sí para el bundle.
 */

export interface TicketNegocio {
  nombre: string
  sucursal?: string
  /** Una línea por renglón: se parte por salto, no por ancho. */
  direccion?: string
  telefono?: string
  /** Vacío = no se imprime. Solo hace falta si van a facturar. */
  rfc?: string
  /** Primera línea del pie, en Jost: el agradecimiento. */
  leyenda?: string
  /** Segunda línea, más chica: aviso de encargos, redes, horario. */
  pieSecundario?: string
  /**
   * Los avisos del pie, uno por renglón: facturación, horario, políticas.
   *
   * Va como ARREGLO y no como un párrafo con separadores porque cada aviso
   * tiene que poder leerse solo. «Por higiene no se hacen cambios» metido en
   * la misma línea que el horario es una advertencia que nadie lee, y es
   * justamente la que el mostrador necesita poder señalar.
   *
   * Un renglón vacío o en blanco no se imprime: así se puede dejar fuera un
   * aviso sin tener que borrar la línea.
   */
  avisos?: string[]
  /**
   * El horario de la tienda, para el pie («Horario: L–D 7:00 a.m. a 9:00
   * p.m.»). Va aparte de los avisos porque es un dato que cambia (temporada,
   * días festivos) y no una política: así se edita en su propia casilla sin
   * tocar las demás líneas. Vacío = no se imprime. La casa todavía no lo da.
   */
  horario?: string
  /** `false` imprime el nombre en versalitas en vez del logotipo. */
  mostrarLogo?: boolean
  /** `false` esconde quién cobró. Sirve para aclaraciones, así que viene encendido. */
  mostrarCajero?: boolean
}

export interface TicketItem {
  cantidad: number
  nombre: string
  precioUnitario: number
  personalizacion?: string | null
}

export interface TicketData {
  folio: number | string
  fecha: Date | string
  cajero?: string
  canal?: string // 'Caja' | 'Kiosko autoservicio' | ...
  items: TicketItem[]
  descuento?: number
  metodoPago: string // 'Efectivo' | 'Tarjeta' | 'Clip' | ...
  /**
   * El desglose cuando se cobró con dos formas de pago.
   *
   * Va como DATOS y no como texto ya armado («Efectivo $400 + Terminal
   * $238»), porque esa línea sola no se lee: en el papel quedaba el desglose
   * a la izquierda y el total a la derecha, y el cliente tiene que poder
   * comprobar que las dos partes suman lo que pagó. Con datos se pinta un
   * renglón por parte, cada uno con su importe.
   */
  partes?: { metodo: string; monto: number }[]
  /**
   * Lo que ya se había pagado como anticipo de un encargo.
   *
   * Baja el TOTAL del papel —que es lo que el cliente paga hoy— pero va en su
   * propio renglón y **no sumado al descuento**: el cliente pagó ese dinero y
   * el negocio lo cobró, en el corte del día en que lo recibió. Metido en el
   * descuento, el papel diría que se le regalaron $200 que están en el cajón
   * desde el lunes.
   */
  anticipo?: number
  referenciaPago?: string | null // voucher/autorización Clip
  recibido?: number // efectivo entregado (para el cambio)
  // Lealtad
  /** A nombre de quién va el pedido. No es una ficha de cliente: es lo que
   *  se grita en el mostrador y lo que lleva la etiqueta. */
  clienteNombre?: string | null
}

/** Datos del negocio por defecto — REEMPLAZAR con los reales de Hojaldras Lily. */
export const NEGOCIO_DEFAULT: TicketNegocio = {
  nombre: 'Hojaldras Lily',
  sucursal: 'Miguel Alemán',
  direccion: 'Calle 29-A #183 por Av. 22\nCol. Miguel Alemán, Mérida, Yuc.',
  telefono: '999 926 71 51',
  // Vacío, NO un guion: `'—'` es texto, así que la plantilla lo daba por
  // bueno e imprimía «RFC —» en el papel, a la vista del cliente. Vacío no se
  // imprime nada, que es lo honesto mientras no esté el dato.
  rfc: '',
  // Decía «Consérvelo en refrigeración», que venía de la heladería del motor
  // original: una hojaldra no se refrigera. Es el mismo caso que el bloque de
  // los puntos que ya se quitó del pie del ticket.
  leyenda: '¡Gracias por su compra!',
  pieSecundario: 'Encarga con 2 días de anticipación · 999 926 71 51',
  // Los tres avisos que pidió la casa. El HORARIO todavía NO está aquí a
  // propósito: no me lo dieron, y un horario inventado impreso en el papel es
  // peor que no tenerlo — el cliente llega a una tienda cerrada. En cuanto lo
  // digan, se agrega como un renglón más de este arreglo y ya.
  avisos: ['Solicita tu factura', 'Por higiene NO se hacen cambios de pan'],
  mostrarLogo: true,
  // Apagado: la casa no quiere el nombre de quien atendió en el ticket.
  mostrarCajero: false,
}

/**
 * El corte de caja, como llega del servidor para imprimirse.
 *
 * Es `vw_corte_resumen` tal cual (`to_jsonb` de la fila) más lo que la vista
 * no trae: el desglose del cajón al abrir y al cerrar, quién abrió y quién
 * cerró, y las notas. Lo arma `fn_cerrar_caja` y lo dibuja `armarCorte`.
 */
export interface CorteData {
  tipo: 'corte'
  corte_id: string
  folio?: number | null
  caja?: string | null
  abierto_en?: string | null
  cerrado_en?: string | null
  fondo_inicial?: number | null
  num_ordenes?: number | null
  total_efectivo?: number | null
  total_tarjeta?: number | null
  total_clip?: number | null
  total_cortesia?: number | null
  total_otro?: number | null
  total_pagado?: number | null
  efectivo_esperado?: number | null
  efectivo_contado?: number | null
  diferencia?: number | null
  conteo_apertura?: unknown
  conteo_cierre?: unknown
  abrio?: string | null
  cerro?: string | null
  notas?: string | null
  /** Los datos del negocio, si Admin los puso. Si no, el agente usa los suyos. */
  negocio?: Partial<TicketNegocio> | null
}
