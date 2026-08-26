/**
 * Generador de etiquetas TSPL para las etiquetadoras 3nstar / TSC.
 *
 * Por qué existe este archivo: estas impresoras NO son de recibos. Si se les
 * manda ESC/POS —que es lo que habla `node-thermal-printer`, el camino que ya
 * existía en este agente— **se tragan los datos y no imprimen nada, sin dar
 * error de ningún tipo**. No hay síntoma que investigar: la cola marca
 * "impreso" y la etiqueta nunca sale. Por eso el lenguaje es una propiedad
 * explícita de cada impresora (`lenguaje` en printers.config.json) y no algo
 * que se adivine.
 *
 * Geometría (203 dpi, 8 dots por milímetro):
 *
 *   · La etiqueta mide 80 mm en el eje del cabezal × 25 mm de avance.
 *   · El texto va rotado 90°, así que los papeles se invierten respecto a lo
 *     que uno esperaría: el **eje X es a lo largo del sticker** (las líneas se
 *     apilan restando X desde 576), y el **eje Y es fijo en 16** — el largo
 *     de cada línea se gasta sobre los 168 dots útiles del eje Y.
 *   · El glifo ocupa de `x - alto` hasta `x`. Se ancla en `x` y luego se
 *     resta el alto de la fuente más el espaciado que se quiera.
 *
 * Todo lo de aquí es puro: entra una etiqueta, sale texto. Sin sockets, sin
 * relojes, sin azar — así se puede probar sin gastar una sola etiqueta (ver
 * tspl.test.ts y `pnpm test-print -- --vista-previa`).
 */

/** Métricas reales de las tres fuentes que usamos, en dots. */
const FUENTES = {
  '1': { alto: 12, ancho: 8 },
  '2': { alto: 20, ancho: 12 },
  '3': { alto: 24, ancho: 16 },
} as const

export type Fuente = keyof typeof FUENTES

/** Margen fijo de 2 mm: todas las líneas arrancan a la misma altura. */
const Y = 16
/** Dots aprovechables a lo largo de la etiqueta (21 mm de los 25). */
const ANCHO_UTIL = 168
/** 72 mm — el punto de anclaje de la primera línea. De aquí se va restando. */
const X_INICIAL = 576
/** Por debajo de esto ya no cabe una línea completa. */
const X_MINIMO = 24

/** Cuántos caracteres caben en una línea con esa fuente. */
export function caracteresPorLinea(fuente: Fuente): number {
  return Math.floor(ANCHO_UTIL / FUENTES[fuente].ancho)
}

/**
 * Deja el texto como lo tolera TSPL: sin acentos (la impresora está en code
 * page 850 y de todas formas no queremos sorpresas), sin comillas dobles
 * —que son el delimitador del comando— y sin espacios de más.
 *
 * Ojo: no pasa a mayúsculas. Eso lo decide cada campo, porque la frase del
 * pie va tal cual se escribió y el resto va en mayúsculas.
 */
export function limpiar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas de acento que deja NFD
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** `limpiar` + mayúsculas, que es lo que lleva casi todo. */
export function mayus(texto: string): string {
  return limpiar(texto).toUpperCase()
}

/**
 * Parte un texto en líneas que quepan, sin cortar palabras a media sílaba.
 * Una palabra más larga que la línea sí se parte: es preferible a que la
 * impresora la recorte por el borde y nadie se entere.
 */
export function partir(texto: string, maximo: number): string[] {
  const palabras = texto.split(' ').filter(Boolean)
  const lineas: string[] = []
  let actual = ''

  for (const palabra of palabras) {
    if (palabra.length > maximo) {
      if (actual) { lineas.push(actual); actual = '' }
      for (let i = 0; i < palabra.length; i += maximo) lineas.push(palabra.slice(i, i + maximo))
      continue
    }
    const tentativa = actual ? `${actual} ${palabra}` : palabra
    if (tentativa.length <= maximo) {
      actual = tentativa
    } else {
      if (actual) lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas.length > 0 ? lineas : ['']
}

/**
 * Abrevia una petición del cliente a la línea corta que va bajo SPEC.
 *
 * No es una tabla de casos sueltos sino la regla que hay detrás: cocina lee
 * el prefijo (`S/` quitar, `C/` agregar, `-` menos) y luego el ingrediente.
 * Así "sin crema" sale `+S/CREMA` sin que nadie lo haya dado de alta.
 *
 *   sin azucar          → +S/AZUCAR
 *   extra galleta       → +GALLETA
 *   con extra galleta   → +GALLETA
 *   mas galleta         → +GALLETA
 *   poco hielo          → +-HIELO
 *   menos hielo         → +-HIELO
 *   con canela          → +C/CANELA
 */
export function abreviarExtra(texto: string): string {
  const t = mayus(texto)
  if (!t) return ''

  // El orden importa: "CON EXTRA X" tiene que resolverse antes que "CON X".
  let m: RegExpMatchArray | null
  if ((m = t.match(/^SIN (.+)$/)))                    return `+S/${m[1]}`
  if ((m = t.match(/^(?:CON )?EXTRA (.+)$/)))         return `+${m[1]}`
  if ((m = t.match(/^MAS (.+)$/)))                    return `+${m[1]}`
  if ((m = t.match(/^(?:POCO|POCA|MENOS) (.+)$/)))    return `+-${m[1]}`
  if ((m = t.match(/^CON (.+)$/)))                    return `+C/${m[1]}`
  return t.startsWith('+') ? t : `+${t}`
}

/**
 * Quita de una línea de SPEC las palabras que no aportan nada dentro de una
 * etiqueta de 21 caracteres.
 *
 * En el catálogo los nombres son largos porque tienen que distinguirse entre
 * sí en el menú: "Proteína OPTIMUM - Chocolate", "Leche de almendras". Pegados
 * bajo un shake, la mitad de esas palabras ya se saben —es una proteína, es
 * una leche— y sí importa que quepa lo que distingue: la marca y el sabor.
 *
 *   Proteína OPTIMUM - Chocolate  →  OPTIMUM CHOCOLATE
 *   Leche de almendras            →  ALMENDRAS
 *   2 Galletas L&L Cremes (Choc.) →  2 GALLETAS L&L CREMES CHOC.
 *
 * Nunca quita marca ni sabor: solo la categoría (que ya es evidente), el
 * guión separador y los paréntesis. La cantidad del principio se respeta.
 */
export function compactarSpec(texto: string): string {
  const t = limpiar(texto)
  const conCantidad = t.match(/^(\d+\s*x)\s+(.*)$/i)
  const cantidad = conCantidad ? `${conCantidad[1].replace(/\s+/g, '')} ` : ''
  const resto = conCantidad ? conCantidad[2] : t

  const compacto = resto
    .replace(/^prote[ií]nas?\s+/i, '')
    .replace(/^leche\s+(de\s+)?/i, '')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s*\(([^)]*)\)\s*/g, ' $1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return `${cantidad}${compacto}`.trim()
}

/**
 * Las frases del pie. Rotan, pero de forma estable (ver `frasePara`).
 *
 * La frase se imprime en fuente "2" y se parte por palabras: ninguna puede
 * ocupar más de dos renglones de 14 caracteres, o empuja el pie fuera de la
 * etiqueta. Hay un test que lo vigila.
 */
export const FRASES = [
  'Buen dia!',
  'Eres un hojaldraslily',
  'Que lo disfrutes!',
  'Hecho para ti',
  'Gracias por venir',
  'Hoy toca consentirse',
  'Shake, train and repeat',
  'No pain, no gain',
  'Mas fuerte que ayer',
  'Tu unico rival: ayer',
  'La ultima rep cuenta',
  'Sin excusas hoy',
  'A darle, campeon!',
  'Suda, sonrie, repite',
  'Ganado, no regalado',
  'Beast mode: ON',
  'Eat. Sleep. Shake.',
  'Rompe tu record hoy',
  'Nacido para entrenar',
  'La disciplina gana',
  'Proteina y actitud',
] as const

/**
 * Elige la frase a partir del ticket y del número de etiqueta, no al azar.
 *
 * Que sea determinista importa de verdad: una reimpresión tiene que salir
 * idéntica a la original, o en barra van a creer que les llegó una comanda
 * distinta. Y de paso, dos etiquetas del mismo pedido no repiten frase.
 */
export function frasePara(ticket: string, item: number): string {
  let h = 0
  for (const c of ticket) h = (h * 31 + c.charCodeAt(0)) % 100000
  return FRASES[(h + item) % FRASES.length]
}

/** Una etiqueta: un producto, para una persona. */
export interface EtiquetaComanda {
  /** A qué estación va. Se imprime en el encabezado y decide la impresora. */
  destino: string
  /** Folio del pedido. */
  ticket: string
  /** Posición dentro del pedido, para el "n de N". */
  item: number
  deTotal: number
  /** Quién lo pidió. Es lo más grande de la etiqueta: así se reparte en barra. */
  nombre: string
  producto: string
  tamano?: string | null
  proteina?: string | null
  leche?: string | null
  extras?: string[] | null
  notas?: string | null
  /** `dd/MM HH:mm`. Se pasa ya formateada para que el generador sea puro. */
  fecha: string
  /** Para forzar una frase concreta; si se omite, se elige con `frasePara`. */
  frase?: string | null
  /** Marca la etiqueta como reimpresión. */
  copia?: number
}

/** Las líneas de SPEC, en el orden en que se imprimen. */
export function lineasSpec(e: EtiquetaComanda): string[] {
  const spec: string[] = []
  if (e.proteina?.trim()) spec.push(`+${mayus(compactarSpec(e.proteina))}`)
  if (e.leche?.trim()) spec.push(`+${mayus(compactarSpec(e.leche))}`)
  for (const extra of e.extras ?? []) {
    const abreviado = abreviarExtra(compactarSpec(extra))
    if (abreviado) spec.push(abreviado)
  }
  // Las notas van tal cual: las escribió una persona pensando en quien
  // prepara, y ahí sí cada palabra la puso alguien a propósito.
  if (e.notas?.trim()) spec.push(mayus(e.notas))
  return spec.flatMap((l) => partir(l, caracteresPorLinea('1')))
}

/** Va apilando líneas hacia abajo, llevando la cuenta de dónde quedó la anterior. */
class Lienzo {
  private readonly lineas: string[] = []
  private x = X_INICIAL
  private altoPrevio = 0
  private primera = true
  /** Se enciende si algo no cupo: el llamante decide si avisar. */
  desbordado = false

  /** @param gap dots en blanco entre el final de la línea anterior y esta. */
  escribir(texto: string, fuente: Fuente, gap: number): void {
    if (this.primera) this.primera = false
    else this.x -= this.altoPrevio + gap

    if (this.x < X_MINIMO) {
      this.desbordado = true
      return
    }
    this.lineas.push(`TEXT ${this.x},${Y},"${fuente}",90,1,1,"${texto}"`)
    this.altoPrevio = FUENTES[fuente].alto
  }

  /**
   * Recuadro blanco sobre negro alrededor de la última línea escrita. Va
   * DESPUÉS del TEXT: TSPL invierte lo que ya está pintado.
   */
  recuadrar(texto: string, fuente: Fuente): void {
    if (this.desbordado) return
    const { alto, ancho } = FUENTES[fuente]
    this.lineas.push(`REVERSE ${this.x - alto - 2},${Y - 2},${alto + 4},${texto.length * ancho + 4}`)
  }

  resultado(): string[] {
    return this.lineas
  }
}

/**
 * El TSPL completo de una etiqueta, listo para escribir en el socket.
 *
 * Los espaciados no son decorativos: reproducen exactamente el diseño que
 * ya se validó contra la impresora física (ver CONFIGURACION-POS.md §6).
 */
export function generarTSPL(e: EtiquetaComanda): string {
  const l = new Lienzo()
  const anchoF1 = caracteresPorLinea('1')
  const anchoF2 = caracteresPorLinea('2')
  const anchoF3 = caracteresPorLinea('3')

  // --- Encabezado ---------------------------------------------------------
  l.escribir(mayus(`${e.destino} #${e.ticket}`).slice(0, anchoF1), '1', 0)
  l.escribir(`${e.item} de ${e.deTotal}`, '1', 2)
  if (e.copia && e.copia > 1) l.escribir(`** REIMPRESION ${e.copia} **`.slice(0, anchoF1), '1', 2)

  // --- Quién y qué --------------------------------------------------------
  let gap = 22
  for (const linea of partir(mayus(e.nombre), anchoF3)) {
    l.escribir(linea, '3', gap)
    gap = 4
  }

  gap = 14
  for (const linea of partir(mayus(e.producto), anchoF2)) {
    l.escribir(linea, '2', gap)
    gap = 3
  }

  // --- Tamaño: NO va en la etiqueta ---------------------------------------
  // El tamaño del vaso vive en la pantalla de la estación; en papel solo
  // estorba (pedido del local, 24/08/26). El dato sigue llegando en el
  // payload por si algún día se quiere de vuelta.

  // --- SPEC ---------------------------------------------------------------
  const spec = lineasSpec(e)
  if (spec.length > 0) {
    l.escribir('SPEC', '1', 30)
    let primero = true
    for (const linea of spec) {
      l.escribir(linea, '1', primero ? 14 : 5)
      primero = false
    }
  }

  // --- Pie ----------------------------------------------------------------
  l.escribir(e.fecha, '1', spec.length > 0 ? 29 : 30)

  const frase = limpiar(e.frase ?? frasePara(e.ticket, e.item))
  let gapFrase = 26
  for (const linea of partir(frase, anchoF2)) {
    l.escribir(linea, '2', gapFrase)
    gapFrase = 3
  }

  return [
    'SIZE 80 mm,25 mm',
    'GAP 4 mm,0 mm',
    'DIRECTION 0',
    'REFERENCE 0,0',
    'DENSITY 8',
    'SPEED 4',
    'CLS',
    ...l.resultado(),
    'PRINT 1,1',
    '',
  ].join('\r\n')
}

/**
 * Dibujo en texto de cómo va a quedar la etiqueta. Sirve para revisar el
 * diseño sin gastar consumible — y para que una prueba automatizada afirme
 * algo legible en vez de comparar cadenas de TSPL.
 */
export function vistaPrevia(e: EtiquetaComanda): string {
  const ancho = caracteresPorLinea('1')
  const filas: string[] = []
  const fila = (t = '') => filas.push(t.slice(0, ancho))

  fila(mayus(`${e.destino} #${e.ticket}`))
  fila(`${e.item} de ${e.deTotal}`)
  if (e.copia && e.copia > 1) fila(`** REIMPRESION ${e.copia} **`)
  fila()
  for (const t of partir(mayus(e.nombre), caracteresPorLinea('3'))) fila(t)
  fila()
  for (const t of partir(mayus(e.producto), caracteresPorLinea('2'))) fila(t)
  // (El tamaño no se imprime: solo pantalla — ver arriba.)
  const spec = lineasSpec(e)
  if (spec.length > 0) {
    fila()
    fila('SPEC')
    fila()
    for (const t of spec) fila(t)
  }
  fila()
  fila(e.fecha)
  fila()
  for (const t of partir(limpiar(e.frase ?? frasePara(e.ticket, e.item)), caracteresPorLinea('2'))) fila(t)

  const borde = `+${'-'.repeat(ancho + 2)}+`
  return [borde, ...filas.map((f) => `| ${f.padEnd(ancho)} |`), borde].join('\n')
}
