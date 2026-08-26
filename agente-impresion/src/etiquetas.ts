import type { EtiquetaComanda } from './tspl.js'
import type { ExtraComanda, ItemComanda, PayloadComanda, TrabajoImpresion } from './types.js'

/**
 * Convierte UN trabajo de la cola en las etiquetas que hay que imprimir.
 *
 * La regla central: **una etiqueta por unidad, no por línea de pedido**. Si
 * alguien pide dos shakes iguales salen dos etiquetas, porque en barra cada
 * etiqueta se pega a un vaso. El contador "n de N" abarca todo el trabajo, así
 * que quien prepara sabe cuántas piezas van en total y si le falta alguna.
 */

/** `dd/MM HH:mm` — lo que cabe en el pie de la etiqueta. */
export function formatearFecha(iso: string | undefined, ahora: Date = new Date()): string {
  const d = iso ? new Date(iso) : ahora
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mi}`
}

/**
 * Reparte una `personalizacion` de texto libre en los campos de la etiqueta.
 *
 * Hoy la base guarda todo junto en una sola columna de texto: el kiosko
 * escribe ahí el tipo de leche, y caja puede escribir lo que sea. Esto lo
 * separa por lo que dice cada fragmento, sin inventar nada — lo que no
 * reconoce cae en `notas`, que también se imprime. Nunca se pierde texto.
 *
 * Cuando el trabajo ya trae los campos por separado (ver `ItemComanda`), esta
 * función ni se llama: manda lo estructurado.
 */
export function repartirPersonalizacion(texto: string | null | undefined): {
  tamano: string | null
  proteina: string | null
  leche: string | null
  extras: string[]
  notas: string | null
} {
  const salida = {
    tamano: null as string | null,
    proteina: null as string | null,
    leche: null as string | null,
    extras: [] as string[],
    notas: null as string | null,
  }
  if (!texto?.trim()) return salida

  const sueltos: string[] = []
  for (const bruto of texto.split(/[,;·\n|]+/)) {
    const f = bruto.trim()
    if (!f) continue

    if (/^\d+\s*oz\b/i.test(f)) { salida.tamano ??= f; continue }
    // Se guarda el fragmento COMPLETO: quien lo compacta para la etiqueta es
    // `compactarSpec`, y así el dato queda entero por si otro consumidor
    // (pantallas de producción, ticket) lo quiere sin recortar.
    if (/^leche\b/i.test(f)) { salida.leche ??= f; continue }
    if (/^prote[ií]na\b/i.test(f)) { salida.proteina ??= f; continue }
    // Una petición se reconoce por cómo empieza: quitar, agregar o moderar.
    if (/^(sin|con|extra|mas|más|poco|poca|menos)\b/i.test(f)) { salida.extras.push(f); continue }
    sueltos.push(f)
  }

  if (sueltos.length > 0) salida.notas = sueltos.join(' ')
  return salida
}

/**
 * Un extra es "la proteína" si su nombre empieza por ahí. Va a su propio
 * renglón del SPEC y no revuelto entre los adicionales, porque es el
 * ingrediente principal: quien prepara lo busca primero.
 */
const esProteina = (nombre: string) => /^\s*(\d+x\s*)?prote[ií]na\b/i.test(nombre)

/**
 * El tamaño no existe todavía como campo propio, pero sí suele venir dentro
 * del nombre del producto ("Shake Oreo 20 OZ"). Se saca de ahí y se quita del
 * nombre, para no imprimirlo dos veces.
 */
export function separarTamano(nombre: string): { nombre: string; tamano: string | null } {
  const m = nombre.match(/\b(\d{1,2})\s*(oz|onz)\b\.?/i)
  if (!m) return { nombre: nombre.trim(), tamano: null }
  return {
    nombre: nombre.replace(m[0], '').replace(/\s{2,}/g, ' ').replace(/[-–(,]\s*$/, '').trim(),
    tamano: `${m[1]} OZ`,
  }
}

/**
 * Antepone la familia de la bebida a su nombre: "Kombucha - Limonada
 * Durazno".
 *
 * En barra hay sabores que se llaman casi igual entre familias distintas
 * ("Lemon Twist" es Hydration, "Lemon Glow" es Collagen, "Lemon Lime" es
 * Amino), y con varias etiquetas en la mano el sabor solo no basta.
 *
 * Dos guardas: si la base no manda familia —el caso de los shakes, que se
 * leen bien solos— el nombre va tal cual; y si el producto ya empieza con
 * su familia no se repite, mismo criterio con el que `separarTamano` evita
 * imprimir el tamaño dos veces.
 */
export function conFamilia(familia: string | null | undefined, nombre: string): string {
  const f = familia?.trim()
  if (!f) return nombre
  if (nombre.trim().toLowerCase().startsWith(f.toLowerCase())) return nombre
  return `${f} - ${nombre}`
}

/**
 * Combina lo estructurado con lo que se deduce del texto libre.
 *
 * No es "uno u otro": hoy la base manda los extras ya separados (las líneas
 * hijas de la orden) pero la leche sigue viviendo dentro de
 * `personalizacion`. Si lo estructurado ganara por completo, la leche
 * desaparecería de la etiqueta — y es justo el dato por el que se pidió que
 * viajara pegada al shake.
 */
function camposDe(item: ItemComanda): Pick<EtiquetaComanda, 'tamano' | 'proteina' | 'leche' | 'extras' | 'notas'> {
  const texto = repartirPersonalizacion(item.personalizacion)
  const unidades = Math.max(1, item.cantidad || 1)

  const todos = [
    ...(item.extras ?? []).map((e) => porEtiqueta(e, unidades)),
    ...texto.extras,
  ]
  const proteinaSuelta = todos.find(esProteina) ?? null

  return {
    tamano: item.tamano ?? texto.tamano,
    proteina: item.proteina ?? texto.proteina ?? proteinaSuelta,
    leche: item.leche ?? texto.leche,
    extras: todos.filter((e) => e !== proteinaSuelta),
    notas: item.notas ?? texto.notas,
  }
}

/**
 * Cuánto de este extra lleva UNA etiqueta.
 *
 * La línea trae el total: dos shakes con una promo de galletas cada uno
 * llegan como cantidad 2. Si ese 2 se copiara tal cual a cada etiqueta, las
 * dos dirían "2x galletas" y en barra saldrían cuatro.
 *
 * Cuando el total no se reparte parejo entre las unidades (solo puede pasar
 * si alguien editó la orden a mano), se deja el número tal cual: es preferible
 * un dato raro que alguien va a preguntar, a uno redondeado que se ve normal
 * y está mal.
 */
export function porEtiqueta(extra: string | ExtraComanda, unidades: number): string {
  if (typeof extra === 'string') return extra

  const total = extra.cantidad ?? unidades
  const cada = total / unidades

  if (!Number.isInteger(cada)) return `${total} p/${unidades} ${extra.nombre}`
  return cada > 1 ? `${cada}x ${extra.nombre}` : extra.nombre
}

/**
 * Las etiquetas de un trabajo, ya numeradas.
 *
 * @param numeroDeCopia >1 marca la etiqueta como reimpresión, para que en
 *        barra nadie prepare dos veces lo mismo.
 */
export function etiquetasDeTrabajo(trabajo: TrabajoImpresion, numeroDeCopia = 1): EtiquetaComanda[] {
  const p: PayloadComanda = trabajo.payload

  // `fn_imprimir_prueba` encola un trabajo SIN productos: solo quiere
  // comprobar que la impresora responde. Sin este caso saldrían cero
  // etiquetas y el trabajo se daría por impreso — el botón de "probar" diría
  // que sí y no saldría nada, que es justo la avería que este agente existe
  // para no tener.
  if (p.prueba) {
    return [{
      destino: 'PRUEBA',
      ticket: 'TEST',
      item: 1,
      deTotal: 1,
      nombre: 'PRUEBA',
      producto: p.impresora ?? 'Impresora',
      notas: 'Si lees esto, imprime bien',
      fecha: formatearFecha(p.hora ?? p.creado_en),
      frase: 'Hecho para ti',
    }]
  }

  const items = p.items ?? []
  const fecha = formatearFecha(p.creado_en)
  const ticket = String(p.folio ?? p.ticket ?? '—')
  const destino = p.estacion ?? 'COCINA'

  // Sin cliente identificado el folio hace de nombre: algo grande y legible
  // tiene que ir ahí o la etiqueta no sirve para repartir.
  const nombre = p.cliente?.trim() || p.nombre?.trim() || `#${ticket}`

  const total = items.reduce((s, i) => s + Math.max(1, i.cantidad || 1), 0)

  const etiquetas: EtiquetaComanda[] = []
  let n = 0
  for (const item of items) {
    const campos = camposDe(item)
    const producto = separarTamano(item.nombre ?? '(producto sin nombre)')
    const nombreProducto = conFamilia(item.categoria, producto.nombre)
    for (let u = 0; u < Math.max(1, item.cantidad || 1); u++) {
      n++
      etiquetas.push({
        destino,
        ticket,
        item: n,
        deTotal: total,
        nombre,
        producto: nombreProducto,
        fecha,
        copia: Math.max(numeroDeCopia, trabajo.numero_copia ?? 1),
        ...campos,
        tamano: campos.tamano ?? producto.tamano,
      })
    }
  }

  return etiquetas
}
