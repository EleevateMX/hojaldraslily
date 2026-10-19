/**
 * Bytes ESC/POS para la impresora de tickets.
 *
 * **Portado casi literal del agente de caja de Shakeaholic**, que ya lleva
 * meses imprimiendo en producción. Se trajo la técnica entera porque no
 * depende del giro: son comandos de impresora y nada más. Lo único que
 * cambió es el nombre del paquete y que las líneas se las da `@lily/ui`.
 *
 * Cuatro cosas de aquí se aprendieron quemándose, y están en los comentarios
 * de cada método: la página de códigos, el avance antes del corte, el raster
 * por bloques y el ancho en puntos.
 */
/**
 * Generacion de bytes ESC/POS para la impresora de caja (térmica de 80 mm).
 *
 * Se escriben los bytes a mano en vez de usar node-thermal-printer porque el
 * contenido ya viene resuelto: `@lily/ui` entrega las lineas de 48
 * columnas exactas. Lo unico que falta es envolverlas en comandos. Eso
 * ademas da control directo sobre el raster del logo, que es donde las
 * librerias genericas suelen fallar con las chinas.
 */

const ESC = 0x1b
const GS = 0x1d

/** Ancho imprimible en puntos. El autodiagnostico reporta 72 mm a 203 dpi. */
export const PUNTOS_ANCHO = 576

export interface LogoRaster {
  /** Bytes empacados 1 bit por pixel, 1 = negro, filas alineadas a byte. */
  datos: Uint8Array
  ancho: number
  alto: number
}

export class ConstructorEscPos {
  private partes: number[] = []

  /**
   * Bytes crudos.
   *
   * Es **público** a propósito. En el original era privado y quien necesitaba
   * mandar una secuencia que la clase no cubría —el QR nativo— tenía que
   * llegar a `partes` con un cast (`b as unknown as { partes: number[] }`).
   * Un cast para saltarse el propio encapsulamiento es una señal de que la
   * puerta debía estar abierta: aquí lo está, y el QR no necesita trucos.
   */
  crudo(...b: number[]) { this.partes.push(...b); return this }

  /** Reinicia la impresora y fija la pagina de codigos. */
  inicializar(): this {
    this.crudo(ESC, 0x40)
    // ESC t 16 = WPC1252. Coincide con latin1 en todas las vocales acentuadas
    // y la ñ, que es lo unico que necesita el español. Sin esto, "Sesión"
    // sale como "SesiÃ³n" o peor.
    this.crudo(ESC, 0x74, 16)
    return this
  }

  /** 0 izquierda, 1 centro, 2 derecha. */
  alinear(a: 0 | 1 | 2): this { return this.crudo(ESC, 0x61, a) }

  texto(s: string): this {
    this.partes.push(...Buffer.from(s, 'latin1'))
    return this
  }

  linea(s = ''): this { return this.texto(s).crudo(0x0a) }

  /**
   * Tamaño del carácter: 1 o 2 veces de ancho y de alto (GS ! n).
   *
   * Es lo único que el papel tiene para decir «esto es más importante»: no
   * hay color ni tipografías. Con `ancho = 2` caben 24 columnas en vez de
   * 48 — quien arme la línea tiene que saberlo, por eso el ancho viaja en la
   * marca de estilo y no se adivina aquí.
   */
  tamano(ancho: 1 | 2 = 1, alto: 1 | 2 = 1): this {
    return this.crudo(GS, 0x21, ((ancho - 1) << 4) | (alto - 1))
  }

  /** Negrita (ESC E n). En térmica es «más calor»: funciona para una línea, no para un párrafo. */
  negrita(encendida: boolean): this { return this.crudo(ESC, 0x45, encendida ? 1 : 0) }

  /**
   * Blanco sobre negro (GS B n). El brief del ticket lo dice: gasta mucho
   * calor, sirve para una palabra —el folio— y no para más.
   */
  invertir(encendido: boolean): this { return this.crudo(GS, 0x42, encendido ? 1 : 0) }

  avanzar(n = 1): this { return this.crudo(ESC, 0x64, Math.max(0, Math.min(255, n))) }

  /**
   * Corte parcial, dejando una pestaña para que el ticket no caiga al piso.
   *
   * El avance previo NO es decorativo. En esta clase de impresoras la
   * guillotina esta entre 15 y 20 mm por encima del cabezal, asi que si se
   * corta sin avanzar lo suficiente, la cuchilla cae sobre las ultimas
   * lineas impresas y el ticket sale mutilado. A ~3.5 mm por linea, seis
   * lineas son ~21 mm: cubre la separacion con margen.
   */
  cortar(lineasDeAvance = 6): this {
    return this.avanzar(lineasDeAvance).crudo(GS, 0x56, 0x01)
  }

  chicharra(veces = 1): this { return this.crudo(ESC, 0x42, Math.min(9, veces), 3) }

  /**
   * Imagen raster (GS v 0).
   *
   * Se manda en bloques de filas y no de una sola vez: el buffer de estas
   * impresoras es chico, y un raster de 576 puntos de ancho por 300 de alto
   * entero la deja imprimiendo basura a media imagen.
   */
  logo(img: LogoRaster, filasPorBloque = 64): this {
    const bytesPorFila = Math.ceil(img.ancho / 8)
    for (let y0 = 0; y0 < img.alto; y0 += filasPorBloque) {
      const filas = Math.min(filasPorBloque, img.alto - y0)
      this.crudo(
        GS, 0x76, 0x30, 0x00,
        bytesPorFila & 0xff, (bytesPorFila >> 8) & 0xff,
        filas & 0xff, (filas >> 8) & 0xff,
      )
      const desde = y0 * bytesPorFila
      this.partes.push(...img.datos.subarray(desde, desde + filas * bytesPorFila))
    }
    return this
  }

  construir(): Buffer { return Buffer.from(this.partes) }
}
