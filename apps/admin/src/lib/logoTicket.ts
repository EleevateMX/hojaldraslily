/**
 * Preparar el logotipo del ticket desde un archivo que sube la gerencia.
 *
 * Saca DOS cosas del mismo archivo, con un canvas del navegador:
 *
 *   - `logo`: un PNG data URI reducido, para la vista previa en pantalla y
 *     para el ticket del navegador (`window.print()`), que sí entiende de
 *     imágenes.
 *   - `logoRaster`: el MISMO logo pasado a blanco y negro y empacado 1 bit por
 *     pixel, para la térmica. El agente de la PC NO decodifica PNG —no se le
 *     mete un decodificador ni una dependencia que compilar—, así que el
 *     trabajo de imagen lo hace aquí, donde hay canvas.
 *
 * Los dos viajan dentro de `parametros.ticket` y de ahí a cada trabajo de
 * impresión, así que cambiar el logo en Admin cambia el papel sin tocar la PC.
 *
 * El ancho se topa para que el raster no infle cada ticket: 384 puntos es
 * ancho de sobra en papel de 80 mm (576 puntos de borde a borde) y deja el
 * logo centrado y legible, sin mandar decenas de KB en cada cobro. Se redondea
 * a múltiplo de 8 porque cada fila del raster se alinea a byte.
 */

const ANCHO_MAX = 256
/** Debajo de este brillo (0–255), con suficiente opacidad, el pixel es negro. */
const UMBRAL = 160

export interface LogoPreparado {
  logo: string
  logoRaster: { ancho: number; alto: number; datos: string }
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen. Debe ser PNG o JPG.'))
    img.src = src
  })
}

function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('No se pudo abrir el archivo.'))
    r.readAsDataURL(file)
  })
}

export async function prepararLogo(file: File): Promise<LogoPreparado> {
  const img = await cargarImagen(await leerArchivo(file))
  const escala = Math.min(1, ANCHO_MAX / img.width)
  // Múltiplo de 8: cada fila del raster se empaca en bytes enteros.
  const ancho = Math.max(8, Math.floor((img.width * escala) / 8) * 8)
  const alto = Math.max(1, Math.round(img.height * (ancho / img.width)))

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no deja usar canvas.')
  // Fondo BLANCO: el papel térmico es blanco, así que lo transparente tiene
  // que quedar blanco y no negro, o el logo sale como una mancha.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(img, 0, 0, ancho, alto)

  const logo = canvas.toDataURL('image/png')

  // A blanco y negro, empacado 1 bit por pixel, MSB primero, 1 = negro.
  const px = ctx.getImageData(0, 0, ancho, alto).data
  const bytesPorFila = Math.ceil(ancho / 8)
  const datos = new Uint8Array(bytesPorFila * alto)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      const a = px[i + 3]
      // Luminancia perceptual; lo muy transparente cuenta como blanco.
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      const negro = a > 128 && lum < UMBRAL
      if (negro) datos[y * bytesPorFila + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  let bin = ''
  for (const b of datos) bin += String.fromCharCode(b)
  return { logo, logoRaster: { ancho, alto, datos: btoa(bin) } }
}
