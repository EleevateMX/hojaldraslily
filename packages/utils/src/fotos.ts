/**
 * De dónde sale la imagen de un producto.
 *
 * `productos.imagen_url` guarda dos cosas distintas, según quién la puso:
 *
 * - Una **foto de verdad**, subida desde Admin → Menú. Ahí queda una URL
 *   completa de Supabase Storage (`https://…/productos/…jpg`).
 * - Un **dibujo de referencia** de la casa, que es solo un nombre de archivo
 *   (`pasta-de-guayaba.png`). Vive dentro de cada app, en `public/productos/`.
 *
 * El dibujo es el respaldo mientras no haya foto: sirve para que el kiosko,
 * la caja y sobre todo el inventario se lean de un vistazo en vez de ser una
 * lista de texto. En cuanto Lily suba la foto del sabor, la foto gana sola,
 * sin tocar nada aquí.
 *
 * El `base` es `import.meta.env.BASE_URL` de cada app. Va como parámetro y no
 * leído aquí adentro porque este paquete no lo compila Vite: si se pusiera
 * `import.meta.env` quedaría `undefined` fuera de las apps, y las imágenes
 * volverían a dar 404 bajo un subdirectorio -- que es justo el error que ya
 * dejó al logotipo invisible en Pages.
 */
export function urlDeFoto(imagenUrl: string | null | undefined, base = '/'): string | null {
  const v = (imagenUrl ?? '').trim()
  if (!v) return null
  // Foto subida (o cualquier cosa ya resuelta): se usa tal cual.
  if (/^(https?:|data:|blob:)/i.test(v) || v.startsWith('/')) return v
  const raiz = base.endsWith('/') ? base : base + '/'
  return `${raiz}productos/${v}`
}

/**
 * El nombre de archivo del dibujo que le toca a un producto, por su nombre.
 *
 * Se usa para sembrar `imagen_url` y para que un producto nuevo capturado en
 * Costeos herede un dibujo sin que nadie suba nada. El orden de la lista
 * IMPORTA: "Pasta de Guayaba y Queso de Bola" tiene que probarse antes que
 * "Pasta de Guayaba", o se lleva el dibujo equivocado.
 */
const DIBUJOS: [RegExp, string][] = [
  [/pasta de guayaba y queso de bola/i, 'guayaba-queso-bola'],
  [/jam[oó]n y queso/i, 'jamon-y-queso'],
  [/hawaiana/i, 'hawaiana'],
  [/fiesta/i, 'fiesta'],
  [/pasta de guayaba|guayaba/i, 'pasta-de-guayaba'],
  [/daysi|jalape/i, 'daysi'],
  [/c[oó]ctel/i, 'coctel'],
  [/nutella/i, 'nutella'],
  [/queso manchego/i, 'queso-manchego'],
  [/philadelphia/i, 'queso-philadelphia'],
  [/queso de bola/i, 'queso-de-bola'],
  [/lomo/i, 'lomo'],
  [/caf[eé] de olla/i, 'cafe-de-olla'],
  [/americano/i, 'americano'],
  [/caf[eé] con leche/i, 'cafe-con-leche'],
  [/chocolate/i, 'chocolate-caliente'],
  [/horchata/i, 'agua-de-horchata'],
  [/refresco/i, 'refresco'],
  [/agua/i, 'agua-embotellada'],
]

export function dibujoParaNombre(nombre: string): string | null {
  for (const [patron, archivo] of DIBUJOS) {
    if (patron.test(nombre)) return `${archivo}.png`
  }
  return null
}
