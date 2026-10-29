/**
 * El ticket en LÍNEAS DE TEXTO, para la impresora térmica.
 *
 * ## Por qué existe, si ya hay `ticketHTML`
 *
 * Hoy el ticket sale por `window.print()`: Chrome rasteriza el HTML y lo
 * manda a la impresora predeterminada de Windows. Eso funciona y arranca la
 * tienda con solo caja y tickets, pero tiene el modo de fallo que ya está
 * anotado — si la predeterminada es la equivocada, la venta queda bien
 * cobrada y el papel se va a un PDF, sin un solo error en pantalla.
 *
 * Una impresora térmica de red se habla distinto: ESC/POS por el puerto
 * 9100, con texto **monoespaciado de 48 columnas** (FontA en papel de 80 mm).
 * Eso permite encolar el ticket como un trabajo más, con su confirmación —
 * y permite que Admin mande el corte a la impresora de caja sin que nadie
 * esté parado frente a la PC.
 *
 * ## Dos renderizadores, UN dato
 *
 * El riesgo de tener dos no es que se vean distinto —una pantalla y un papel
 * térmico TIENEN que verse distinto—, es que digan **importes distintos del
 * mismo ticket**. Por eso los dos comen el mismo `TicketData` y el mismo
 * `TicketNegocio`, y hay una prueba que compara sus totales sobre el mismo
 * dato. Mientras la fuente sea una, no se pueden separar en lo que importa.
 *
 * Es la misma razón por la que `precioEnCanal()` y `fn_precio_linea()` son la
 * misma regla escrita dos veces y se tocan juntas.
 *
 * ## Todo se mide en COLUMNAS, no en píxeles
 *
 * La impresora es monoespaciada. 48 columnas es FontA en papel de 80 mm; 32
 * es el de 58 mm. No hay tipografías ni tamaños aquí: una línea cabe o no
 * cabe, y si no cabe se envuelve.
 */

import type { TicketData, TicketNegocio, TicketItem, CorteData } from './ticketTipos'

/** FontA en papel de 80 mm. Es el que usa la casa. */
export const COLUMNAS_80MM = 48
/** FontA en papel de 58 mm, por si alguna vez hay una chica. */
export const COLUMNAS_58MM = 32

/**
 * Marca de dónde va un QR.
 *
 * Va como marca y no como texto porque la impresora genera el QR **ella
 * misma** (`GS ( k`): rasterizarlo de este lado sería mandar una imagen
 * grande por un buffer chico, que es justo donde estas impresoras fallan.
 */
export interface MarcaQr {
  tipo: 'qr'
  contenido: string
  etiqueta: string
}

/**
 * Una línea con estilo: más grande, en negrita, invertida o centrada.
 *
 * Es cómo la térmica dice «esto es lo importante» sin color ni tipografías.
 * El diseño de la nota (muestras/ticket.png) lo resuelve con tres cosas: el
 * FOLIO blanco sobre negro, el TOTAL grande y el recuadro «ENCARGO PARA».
 * Aquí son marcas; el renderer las traduce a comandos (GS !, ESC E, GS B).
 *
 * Con `ancho = 2` el texto ocupa el doble, así que caben la mitad de
 * columnas: la marca trae el texto ya cortado a lo que cabe, y la prueba lo
 * comprueba. Una línea que se pasa no da error: se parte donde la impresora
 * quiera y descuadra el ticket entero.
 */
export interface MarcaEstilo {
  tipo: 'estilo'
  texto: string
  ancho?: 1 | 2
  alto?: 1 | 2
  negrita?: boolean
  invertido?: boolean
  alinear?: 'izq' | 'centro' | 'der'
  /** `'B'` imprime en la fuente chica (RFC, régimen). Por omisión, la normal. */
  fuente?: 'A' | 'B'
}

export type LineaTicket = string | MarcaQr | MarcaEstilo

const estilo = (texto: string, m: Omit<MarcaEstilo, 'tipo' | 'texto'> = {}): MarcaEstilo =>
  ({ tipo: 'estilo', texto, ...m })

/**
 * El importe, con separador de miles.
 *
 * Se escribe a mano en vez de usar `Intl` porque `Intl` mete espacios duros
 * (U+00A0) según el entorno, y en una impresora térmica eso sale como un
 * carácter raro o descuadra la columna. El resultado tiene que ser
 * **idéntico** al del HTML: ahí decía `$1,030.00` y aquí salía `$1030.00`,
 * o sea el mismo ticket con dos caras.
 */
function pesos(n: number): string {
  const v = Math.abs(Number(n) || 0)
  const [ent, dec] = v.toFixed(2).split('.')
  return '$' + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

/**
 * Los últimos cuatro de la tarjeta, vengan como vengan.
 *
 * La red manda el PAN ya enmascarado («4152 31** **** 1234», «************1234»);
 * se toman los últimos cuatro dígitos y se imprime SOLO eso. Un ticket es un
 * papel que se tira en la calle.
 */
export function ultimosCuatro(pan: string | null | undefined): string | null {
  const digitos = (pan ?? '').replace(/\D/g, '')
  return digitos.length >= 4 ? digitos.slice(-4) : null
}

/**
 * Las parejas del voucher (Anexo VII de Interredes): etiqueta → valor, en el
 * orden que pide el banco, y solo con lo que vino. Compartido entre el papel
 * y el HTML para que los dos digan lo mismo.
 */
export function parejasDeVoucher(t: import('./ticketTipos').VoucherTarjeta): [string, string][] {
  const p: [string, string][] = []
  const pon = (k: string, v: string | null | undefined) => {
    if (v && String(v).trim()) p.push([k, String(v).trim()])
  }
  pon('Afiliación', t.afiliacion)
  pon('Terminal', t.terminalId)
  pon('No. control', t.controlNumber)
  const u4 = ultimosCuatro(t.pan)
  pon('Tarjeta', [t.marca, t.tipo, u4 ? `**** ${u4}` : null].filter(Boolean).join(' '))
  pon('Emisor', t.banco)
  pon('Autorización', t.autorizacion)
  pon('Referencia', t.referencia)
  pon('Entrada', t.entrada)
  pon('AID', t.aid)
  pon('Aplicación', t.aplicacion)
  pon('TVR', t.tvr)
  pon('TSI', t.tsi)
  return p
}

/**
 * Cómo se validó la venta, según `pinRequested`: con NIP se imprime la
 * leyenda que exige el banco; con firma, la raya; QPS (contactless chico) no
 * lleva nada. Si no vino, se deja la raya: es lo que no deja a nadie sin
 * comprobante.
 */
export function validacionDeVoucher(pin: string | null | undefined): 'nip' | 'firma' | 'nada' {
  const v = (pin ?? '').trim()
  if (v === '1') return 'nip'
  if (v === '2') return 'nada'
  return 'firma'
}

/** Los cuatro gestos de un papel monoespaciado. */
function formato(ancho: number) {
  const W = ancho

  const centrar = (s: string) =>
    s.length >= W ? s.slice(0, W) : ' '.repeat(Math.floor((W - s.length) / 2)) + s

  /**
   * Etiqueta a la izquierda, importe a la derecha, el hueco en medio.
   *
   * Si no cabe, se recorta la etiqueta y **nunca el importe**: un ticket con
   * el nombre cortado se entiende; uno con el precio cortado, no.
   */
  const parear = (izq: string, der: string) => {
    const hueco = W - izq.length - der.length
    if (hueco >= 1) return izq + ' '.repeat(hueco) + der
    return izq.slice(0, Math.max(0, W - der.length - 1)) + ' ' + der
  }

  const regla = (c = '-') => c.repeat(W)

  /**
   * Parte un texto largo en varias líneas respetando las palabras.
   *
   * `ancho` permite envolver a menos de lo que mide el papel: en el bloque de
   * partidas hay que dejarle sitio al importe a la derecha.
   *
   * Una palabra que **por sí sola** no cabe —una URL, un nombre pegado— sí se
   * corta duro, porque la alternativa es una línea que se pasa del papel. Lo
   * que no se hace es cortar duro lo que sí cabía: así salía
   * «Pasta de Guay / aba,», que es el nombre del pan partido a media sílaba.
   */
  const envolver = (texto: string, sangria = 0, ancho = W) => {
    const max = Math.max(1, ancho - sangria)
    const out: string[] = []
    let linea = ''
    const cerrar = () => { if (linea) { out.push(' '.repeat(sangria) + linea); linea = '' } }

    for (const palabra of texto.split(/\s+/).filter(Boolean)) {
      if (palabra.length > max) {
        cerrar()
        for (const trozo of palabra.match(new RegExp(`.{1,${max}}`, 'g')) ?? []) {
          out.push(' '.repeat(sangria) + trozo)
        }
        continue
      }
      if (!linea) linea = palabra
      else if ((linea + ' ' + palabra).length <= max) linea += ' ' + palabra
      else { cerrar(); linea = palabra }
    }
    cerrar()
    return out
  }

  return { W, centrar, parear, regla, envolver }
}

/** El subtotal del ticket: lo que suman los renglones, antes de tocar nada. */
export function subtotalDe(items: TicketItem[]): number {
  return items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
}

/**
 * El total que se paga HOY.
 *
 * Es la MISMA resta que hace `ticketHTML`, y por eso vive aquí una sola vez:
 * subtotal − descuento − anticipo, nunca abajo de cero. El anticipo no es un
 * descuento —ese dinero sí entró, en el corte del día en que se recibió—
 * pero sí baja lo que el cliente pone sobre el mostrador.
 */
export function totalDe(data: TicketData): number {
  const sub = subtotalDe(data.items)
  return Math.max(0, sub - (data.descuento ?? 0) - (data.anticipo ?? 0))
}

/**
 * El ticket de venta, en líneas listas para la térmica.
 *
 * El QR del recibo digital va como `MarcaQr` para que el renderer lo
 * sustituya por el comando nativo de la impresora.
 */
export function armarTicket(
  data: TicketData,
  negocio: TicketNegocio,
  ancho: number = COLUMNAS_80MM,
): LineaTicket[] {
  const { centrar, parear, regla, envolver } = formato(ancho)
  const L: LineaTicket[] = []

  // ---- Encabezado ----
  // Si Admin puso un logotipo (y no lo apagó), el agente ya lo imprime arriba
  // como imagen: entonces el NOMBRE en grande sobra —saldría el logo y debajo
  // «HOJALDRAS LILY» escrito, repetido—. Sin logo, el nombre al doble de
  // tamaño es lo que sostiene la identidad en papel térmico (sin color).
  const hayLogo = negocio.mostrarLogo !== false && !!negocio.logoRaster?.datos
  if (!hayLogo) {
    L.push(estilo(negocio.nombre.toUpperCase().slice(0, Math.floor(ancho / 2)), { ancho: 2, alto: 2, alinear: 'centro' }))
  }
  // El lema, debajo del logo (o del nombre): identidad de la casa. Se envuelve
  // si no cabe en el ancho del papel.
  if (negocio.slogan?.trim()) for (const l of envolver(negocio.slogan.trim())) L.push(centrar(l))
  // La razón social (KALALEV HOLDING), debajo del lema y encima del RFC: es el
  // nombre fiscal del emisor, distinto del nombre comercial que va en el logo.
  if (negocio.razonSocial?.trim()) for (const l of envolver(negocio.razonSocial.trim())) L.push(centrar(l))
  // El bloque fiscal —RFC y régimen— va en fuente chica (FontB): tiene que
  // estar para facturar, pero es secundario, no compite con el nombre. Solo
  // si existe: «RFC —» a la vista del cliente es peor que no imprimirlo.
  const chico = (t: string): MarcaEstilo => estilo(t, { alinear: 'centro', fuente: 'B' })
  if (negocio.rfc?.trim()) L.push(chico(`RFC: ${negocio.rfc.trim()}`))
  if (negocio.regimen?.trim()) for (const l of envolver(negocio.regimen.trim(), 0, 63)) L.push(chico(l))
  if (negocio.sucursal) L.push(centrar(`Sucursal ${negocio.sucursal}`))
  // La dirección trae saltos de línea propios: se respetan y además se
  // envuelve lo que no quepa.
  for (const renglon of (negocio.direccion ?? '').split('\n')) {
    for (const l of envolver(renglon)) L.push(centrar(l.trim()))
  }
  // El teléfono va bajo la dirección, como el mockup de la casa (28/10): antes
  // vivía solo en el pie, pero la casa lo quiere en el bloque fiscal.
  if (negocio.telefono?.trim()) L.push(centrar(`Tel. ${negocio.telefono.trim()}`))
  L.push('')

  // ---- Datos de la venta ----
  const f = data.fecha instanceof Date ? data.fecha : new Date(data.fecha)
  const fechaTxt = f.toLocaleString('es-MX', {
    timeZone: 'America/Merida',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  // `parear` con la derecha vacía rellenaría de espacios hasta el borde: una
  // línea de puro relleno que en el papel se ve como un renglón en blanco
  // movido. Si no hay nada a la derecha, va el texto solo.
  const cajero = negocio.mostrarCajero === false ? '' : (data.cajero ?? '')
  // El folio es lo que se canta en el mostrador y lo que se busca en una
  // aclaración: va blanco sobre negro y al doble, como en el diseño. La
  // fecha, el canal y quién cobró, debajo y a la derecha.
  // Un pedido de Rappi no lleva folio de la tienda: lo identifica el ID que
  // el cajero copia de la plataforma. Se canta «RAPPI #1234» en vez de FOLIO.
  L.push(data.rappiId ? 'RAPPI' : 'FOLIO')
  L.push(estilo(` #${data.rappiId || data.folio} `, { ancho: 2, alto: 2, invertido: true }))
  L.push(estilo(fechaTxt, { alinear: 'der' }))
  const canalLinea = [data.canal, cajero].filter(Boolean).join(' · ')
  if (canalLinea) L.push(estilo(canalLinea, { alinear: 'der' }))
  if (data.clienteNombre) {
    // El recuadro «ENCARGO PARA»: en el papel es una regla, el rótulo chico y
    // el nombre al doble de ancho, en negrita. Lo que se lee a un metro es a
    // quién se le entrega.
    L.push(regla())
    L.push('ENCARGO PARA')
    for (const l of envolver(data.clienteNombre, 0, Math.floor(ancho / 2))) {
      L.push(estilo(l, { ancho: 2, negrita: true }))
    }
  }
  L.push(regla('='))

  // ---- Partidas ----
  L.push(parear('CANT DESCRIPCION', 'IMPORTE'))
  L.push(regla())
  for (const it of data.items) {
    const importe = it.cantidad * it.precioUnitario
    const prefijo = `${String(it.cantidad).padEnd(4)} `
    const imp = pesos(importe)
    const disponible = ancho - imp.length - 1 - prefijo.length

    if (it.nombre.length <= disponible) {
      L.push(parear(prefijo + it.nombre, imp))
    } else {
      // Nombre largo —los de la casa lo son: «Hojaldra de Corazón · Pasta de
      // Guayaba, Philadelphia y Nuez»— se envuelve y el importe cae solo en
      // la última línea, nunca partido.
      const trozos = envolver(it.nombre, 0, Math.max(1, disponible))
      trozos.forEach((t, i) => {
        L.push(i === 0 ? prefijo + t : ' '.repeat(prefijo.length) + t)
      })
      L.push(parear('', imp))
    }

    // El precio unitario solo cuando hay más de uno: con cantidad 1 repetiría
    // el importe que está arriba.
    if (it.cantidad > 1) {
      L.push(`${' '.repeat(prefijo.length)}@ ${pesos(it.precioUnitario)} c/u`)
    }
    if (it.personalizacion) {
      for (const l of envolver(`* ${it.personalizacion}`, prefijo.length)) L.push(l)
    }
  }

  // ---- Totales ----
  L.push(regla())
  const sub = subtotalDe(data.items)
  const desc = data.descuento ?? 0
  const anticipo = data.anticipo ?? 0
  const total = totalDe(data)

  const hayRestas = desc > 0 || anticipo > 0
  if (hayRestas) L.push(parear('Subtotal', pesos(sub)))
  if (desc > 0) L.push(parear('Descuento', '-' + pesos(desc)))
  // En su propio renglón, NO sumado al descuento: el cliente pagó ese dinero
  // y el negocio lo cobró. En el descuento, el papel diría que se le
  // regalaron $200 que están en el cajón desde el lunes.
  if (anticipo > 0) L.push(parear('Anticipo ya pagado', '-' + pesos(anticipo)))

  // Sin descuento ni anticipo, entre la regla de las partidas y la del total
  // no iba ningún renglón: dos reglas pegadas que se leen como un error de
  // impresión. Con restas sí hay qué separar.
  if (hayRestas) L.push(regla('='))
  // El total es lo primero que tiene que encontrar el cliente: al doble de
  // alto, con las 48 columnas enteras para que el importe quede en su sitio.
  L.push(estilo(parear('TOTAL', pesos(total)), { alto: 2, negrita: true }))
  L.push('')

  // ---- Cómo se pagó ----
  // Rappi NO lleva método de pago: al repartidor no se le cobra, paga la
  // plataforma días después. Mostrar «Efectivo» o «Terminal» aquí sería
  // mentir y descuadrar la lectura del corte. Solo se avisa que es de Rappi.
  if (data.rappiId) {
    L.push(centrar('Pedido de Rappi'))
    L.push(centrar('La plataforma paga a la tienda'))
  } else if (data.partes?.length) {
    // Un renglón por parte: el cliente tiene que poder comprobar que las dos
    // suman lo que pagó. Una frase corrida («Efectivo $400 + Terminal $238»)
    // no se lee de un vistazo.
    for (const p of data.partes) L.push(parear(p.metodo, pesos(p.monto)))
  } else {
    L.push(parear(data.metodoPago, pesos(total)))
  }
  if (data.referenciaPago && !data.tarjeta) L.push(`Ref. ${data.referenciaPago}`)
  if (data.tarjeta) {
    // ---- El voucher de la terminal (Anexo VII de Interredes) ----
    // Pareja por renglón, con lo que vino. Cierra con cómo se validó: la
    // leyenda del NIP, la raya de la firma, o nada si fue QPS.
    L.push('')
    L.push(estilo('BANORTE', { negrita: true, alinear: 'centro' }))
    for (const [k, v] of parejasDeVoucher(data.tarjeta)) L.push(parear(k, v))
    const validacion = validacionDeVoucher(data.tarjeta.pin)
    if (validacion === 'nip') {
      L.push('')
      L.push(estilo('AUTORIZADO CON FIRMA ELECTRONICA', { negrita: true, alinear: 'centro' }))
    } else if (validacion === 'firma') {
      L.push('')
      L.push('')
      L.push(centrar('_'.repeat(Math.min(28, ancho - 4))))
      L.push(centrar('Firma'))
    }
  }
  if (data.recibido != null && data.recibido >= total) {
    L.push(parear('Recibido', pesos(data.recibido)))
    L.push(parear('Cambio', pesos(data.recibido - total)))
  }

  // ---- Pie ----
  L.push('')
  // El agradecimiento en negrita, como la Jost del diseño: es lo único del
  // pie que se lee sin querer.
  if (negocio.leyenda) for (const l of envolver(negocio.leyenda)) L.push(estilo(l.trim(), { negrita: true, alinear: 'centro' }))
  if (negocio.pieSecundario) {
    // Se parte por el `·` de la casa antes que por palabras: envolviendo a
    // secas, «Encarga con 2 días de anticipación · 999 926 71 51» dejaba el
    // teléfono cortado en «999 926 71 / 51», que no se puede marcar.
    const partes = negocio.pieSecundario.split('·').map((x) => x.trim()).filter(Boolean)
    const cabeEntero = negocio.pieSecundario.length <= ancho
    for (const parte of cabeEntero ? [negocio.pieSecundario] : partes) {
      for (const l of envolver(parte)) L.push(centrar(l.trim()))
    }
  }

  // Los avisos van cada uno en su renglón y separados por una regla: son lo
  // que el mostrador necesita poder señalar con el dedo.
  const avisos = lineasDeAvisos(negocio)
  if (avisos.length) {
    L.push(regla())
    for (const a of avisos) for (const l of envolver(a)) L.push(centrar(l.trim()))
  }

  return L
}

/**
 * El bloque de avisos del pie, ya limpio: el horario primero (si lo hay) y
 * después los avisos. Lo comparten el papel y el HTML para que los dos digan
 * exactamente lo mismo.
 */
export function lineasDeAvisos(negocio: TicketNegocio): string[] {
  const horario = (negocio.horario ?? '').trim()
  const avisos = (negocio.avisos ?? []).map((a) => a.trim()).filter(Boolean)
  return horario ? [`Horario: ${horario}`, ...avisos] : avisos
}

function hora(iso: string | null | undefined): string {
  if (!iso) return ''
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return ''
  return f.toLocaleString('es-MX', {
    timeZone: 'America/Merida', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Un desglose `{billetes:{}, monedas:{}}` en renglones, sin depender de `@lily/utils`. */
function renglonesDeConteo(raw: unknown): { etiqueta: string; piezas: number; subtotal: number }[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as { billetes?: Record<string, unknown>; monedas?: Record<string, unknown> }
  const out: { etiqueta: string; piezas: number; subtotal: number }[] = []
  const lado = (v: Record<string, unknown> | undefined, nombre: string) => {
    if (!v || typeof v !== 'object') return
    Object.entries(v)
      .map(([den, n]) => [Number(den), Math.max(0, Math.trunc(Number(n) || 0))] as const)
      .filter(([den, n]) => Number.isFinite(den) && den > 0 && n > 0)
      .sort((a, b) => b[0] - a[0])
      .forEach(([den, n]) => out.push({ etiqueta: `${nombre} $${den}`, piezas: n, subtotal: den * n }))
  }
  lado(o.billetes, 'Billete')
  lado(o.monedas, 'Moneda')
  return out
}

/**
 * El corte de caja en líneas para la térmica.
 *
 * Sale solo al cerrar el turno, en la impresora del mostrador: es el papel
 * que se engrapa con el efectivo. Lo que importa a un metro es si **cuadró**,
 * así que la diferencia va al final, grande y con su palabra (sobrante /
 * faltante). El desglose del cajón va porque es lo que convierte «faltan
 * $340» en «falta un billete de $200 y tres de $50».
 */
export function armarCorte(
  c: CorteData,
  negocio: TicketNegocio,
  ancho: number = COLUMNAS_80MM,
): LineaTicket[] {
  const { centrar, parear, regla, envolver } = formato(ancho)
  const L: LineaTicket[] = []
  const n = (v: number | null | undefined) => Number(v ?? 0)

  L.push(estilo(negocio.nombre.toUpperCase().slice(0, Math.floor(ancho / 2)), { ancho: 2, alto: 2, alinear: 'centro' }))
  if (negocio.sucursal) L.push(centrar(`Sucursal ${negocio.sucursal}`))
  L.push('')
  L.push(estilo('CORTE DE CAJA', { negrita: true, alinear: 'centro' }))
  // El folio del corte, como el de la venta: es lo que se dice por teléfono.
  if (c.folio != null) L.push(estilo(` #${c.folio} `, { ancho: 2, alto: 2, invertido: true, alinear: 'centro' }))
  if (c.caja) L.push(centrar(c.caja))
  L.push(regla('='))
  L.push(parear('Abrió', `${hora(c.abierto_en)}${c.abrio ? ' · ' + c.abrio : ''}`))
  L.push(parear('Cerró', `${hora(c.cerrado_en)}${c.cerro ? ' · ' + c.cerro : ''}`))
  L.push(regla())

  // ---- Ventas ----
  L.push(parear(`Órdenes: ${n(c.num_ordenes)}`, ''))
  L.push(parear('Efectivo', pesos(n(c.total_efectivo))))
  if (n(c.total_tarjeta) > 0) L.push(parear('Terminal', pesos(n(c.total_tarjeta))))
  if (n(c.total_inbursa) > 0) L.push(parear('Inbursa', pesos(n(c.total_inbursa))))
  if (n(c.total_transferencia) > 0) L.push(parear('Transferencia', pesos(n(c.total_transferencia))))
  if (n(c.total_rappi) > 0) L.push(parear('Rappi', pesos(n(c.total_rappi))))
  if (n(c.total_clip) > 0) L.push(parear('Clip', pesos(n(c.total_clip))))
  if (n(c.total_cortesia) > 0) L.push(parear('Cortesía', pesos(n(c.total_cortesia))))
  if (n(c.total_otro) > 0) L.push(parear('Otro', pesos(n(c.total_otro))))
  L.push(parear('TOTAL VENDIDO', pesos(n(c.total_pagado))))
  L.push(regla())

  // ---- El cajón ----
  L.push(parear('Fondo inicial', pesos(n(c.fondo_inicial))))
  L.push(parear('+ Efectivo vendido', pesos(n(c.total_efectivo))))
  L.push(parear('= Debía haber', pesos(n(c.efectivo_esperado))))
  L.push(parear('Se contó', pesos(n(c.efectivo_contado))))
  const cierre = renglonesDeConteo(c.conteo_cierre)
  for (const r of cierre) {
    L.push(parear(`  ${r.etiqueta} x ${r.piezas}`, pesos(r.subtotal)))
  }
  L.push(regla('='))
  const dif = n(c.diferencia)
  const palabra = dif === 0 ? 'CUADRA' : dif > 0 ? 'SOBRANTE' : 'FALTANTE'
  // Lo que importa a un metro: al doble de alto y en negrita.
  L.push(estilo(parear(palabra, (dif < 0 ? '-' : '') + pesos(Math.abs(dif))), { alto: 2, negrita: true }))
  L.push('')

  if (c.notas) {
    for (const l of envolver(`Notas: ${c.notas}`)) L.push(l)
    L.push('')
  }
  L.push(centrar('Firma: ____________________'))
  L.push('')
  return L
}
