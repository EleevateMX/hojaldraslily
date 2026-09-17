import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

/**
 * Hace instalable una app del monorepo.
 *
 * "Instalable" quiere decir que el navegador ofrece **Instalar** y la app
 * queda con su icono en el escritorio o en la pantalla del teléfono, abriendo
 * a pantalla completa sin barra de direcciones. No es un `.exe`: no se
 * descarga de ningún lado, no hay que firmarla y no cuesta nada alojarla —
 * son dos archivos estáticos más junto a los que ya se publican.
 *
 * Por qué es un plugin y no ocho archivos a mano:
 *
 * 1. **El color de la marca.** Un `manifest.webmanifest` escrito a mano es un
 *    lugar más donde la identidad se desvía sola, que es exactamente la
 *    trampa de CLAUDE.md §2.5 (ya pasó con `apps/costos` y con
 *    `demo/index.html`). Y ya había pasado aquí: los dos manifests que
 *    existían traían el verde oscuro del motor original (`#14241D`,
 *    `#1A2E26`), no el carmín de Lily. Este plugin **lee los valores de
 *    `packages/brand/tokens.css`**, la fuente de la verdad. Si cambia el
 *    token, cambia el manifest sin que nadie se acuerde de copiarlo.
 *
 * 2. **El `base`.** La misma app se publica en la raíz de su dominio
 *    (`caja.hojaldraslily.com/`) y bajo un subdirectorio en la vitrina
 *    (`/hojaldraslily/app/pos/`). `start_url`, `scope` y las rutas de los
 *    iconos tienen que cambiar con el `base`, y un JSON escrito a mano no
 *    puede. Un manifest con el `scope` equivocado no instala y no avisa por
 *    qué.
 */

export interface OpcionesDePwa {
  /** Como aparece en la lista de apps instaladas. */
  nombre: string
  /** Lo que cabe debajo del icono. Máximo ~12 caracteres o se recorta. */
  corto: string
  descripcion: string
  /**
   * Icono dentro de `public/`, sin el `base`. Sobre superficies de carmín va
   * el negativo (CLAUDE.md §2.5).
   */
  icono?: string
  /** `portrait` en lo que se usa con el teléfono en la mano; `any` en las pantallas del local. */
  orientacion?: 'any' | 'portrait' | 'landscape'
  /** Para la tienda de apps de Android; solo tiene sentido en lo que ve el cliente. */
  categorias?: string[]
  /**
   * Atajos del menú contextual del icono (mantener presionado en Android,
   * clic derecho en el escritorio).
   */
  atajos?: { nombre: string; corto: string; descripcion: string; ruta: string }[]
  /**
   * Capturas para el diálogo de instalación de Android. Sin ellas el diálogo
   * sale chico y sin explicar nada, así que solo valen la pena donde hay que
   * convencer a alguien de instalar: la app del cliente.
   */
  capturas?: { archivo: string; ancho: number; alto: number; texto: string }[]
}

/** Los colores salen de `tokens.css`, no de una copia. */
function colorDelToken(token: string, porOmision: string): string {
  const require = createRequire(import.meta.url)
  try {
    const ruta = require.resolve('@shake/brand/tokens.css')
    const css = readFileSync(ruta, 'utf8')
    const m = new RegExp(`--${token}\\s*:\\s*([^;]+);`).exec(css)
    return m ? m[1].trim() : porOmision
  } catch {
    // Si el paquete de marca no se puede leer, más vale un color de respaldo
    // que romper el build entero por un manifest.
    return porOmision
  }
}

export function pwaDeLily(opciones: OpcionesDePwa): Plugin {
  let base = '/'
  const icono = opciones.icono ?? 'icono-512.png'

  return {
    name: 'lily-pwa',
    // `post` para que el <link> entre después de que todo lo demás tocó el HTML.
    enforce: 'post',

    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`
    },

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tema = colorDelToken('sa-green', '#D81B4A')
        // Se quitan los que hubiera escritos a mano: si no, quedan dos
        // `theme-color` y gana el primero -- que era el verde del otro
        // negocio. Un duplicado en el HTML no da error, solo gana el malo.
        const limpio = html
          .replace(/\s*<link[^>]+rel="manifest"[^>]*>/g, '')
          .replace(/\s*<meta[^>]+name="theme-color"[^>]*>/g, '')

        return {
          html: limpio,
          tags: [
            {
              tag: 'link',
              injectTo: 'head',
              attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` },
            },
            {
              tag: 'meta',
              injectTo: 'head',
              attrs: { name: 'theme-color', content: tema },
            },
            // iOS no lee el manifest para el icono de la pantalla de inicio.
            {
              tag: 'link',
              injectTo: 'head',
              attrs: { rel: 'apple-touch-icon', href: `${base}${icono}` },
            },
            {
              tag: 'meta',
              injectTo: 'head',
              attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' },
            },
            {
              tag: 'meta',
              injectTo: 'head',
              attrs: { name: 'apple-mobile-web-app-title', content: opciones.corto },
            },
          ],
        }
      },
    },

    generateBundle(_opciones, bundle) {
      const tema = colorDelToken('sa-green', '#D81B4A')
      const fondo = colorDelToken('sa-cream-paper', '#FFFCF5')

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(
          {
            name: opciones.nombre,
            short_name: opciones.corto,
            description: opciones.descripcion,
            id: base,
            start_url: base,
            scope: base,
            display: 'standalone',
            display_override: ['standalone', 'minimal-ui'],
            orientation: opciones.orientacion ?? 'any',
            lang: 'es-MX',
            dir: 'ltr',
            background_color: fondo,
            theme_color: tema,
            ...(opciones.categorias ? { categories: opciones.categorias } : {}),
            ...(opciones.atajos
              ? {
                  shortcuts: opciones.atajos.map((a) => ({
                    name: a.nombre,
                    short_name: a.corto,
                    description: a.descripcion,
                    url: `${base}${a.ruta.replace(/^\//, '')}`,
                  })),
                }
              : {}),
            ...(opciones.capturas
              ? {
                  screenshots: opciones.capturas.map((c) => ({
                    src: `${base}${c.archivo}`,
                    sizes: `${c.ancho}x${c.alto}`,
                    type: 'image/png',
                    form_factor: 'narrow',
                    label: c.texto,
                  })),
                }
              : {}),
            icons: [
              { src: `${base}icono-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: `${base}icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
              {
                src: `${base}icono-maskable-512.png`,
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          null,
          2,
        ),
      })

      // El casco de la app: el HTML y los archivos con hash en el nombre.
      // Solo esos se guardan agresivamente -- si el contenido cambia, cambia
      // el nombre, así que una copia vieja nunca se confunde con la nueva.
      const casco = [
        base,
        ...Object.keys(bundle)
          .filter((f) => /\.(js|css|woff2?)$/.test(f))
          .map((f) => `${base}${f}`),
      ]

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorker(base, casco),
      })
    },
  }
}

/**
 * El service worker.
 *
 * Existe por dos razones, y la segunda es la que importa en la tienda:
 *
 * 1. Sin un `fetch` handler, Chrome **no ofrece instalar**. Los dos manifests
 *    que ya existían en el repo no servían de nada por esto: estaban bien
 *    escritos y la opción de instalar nunca aparecía. (Isyconta tiene el
 *    mismo hueco: su `sw.js` maneja push pero no `fetch`.)
 * 2. Con internet intermitente, la pantalla **abre** y muestra la app —
 *    aunque sin datos— en vez del dinosaurio de Chrome. En una panadería con
 *    tres pantallas colgadas, la diferencia entre "no hay internet,
 *    reintentando" y una página de error del navegador es la diferencia entre
 *    esperar y llamar por teléfono.
 *
 * Lo que **no** hace, a propósito:
 *
 * - **No guarda nada de Supabase.** Ni catálogo, ni órdenes, ni precios. El
 *   dinero se calcula en el servidor (CLAUDE.md §2.2) y un precio servido de
 *   una caché vieja es justo la manera de que `fn_cobrar_orden` rechace el
 *   cobro con el cliente enfrente. La caché es para el *programa*, no para
 *   los *datos*.
 * - **No se auto-actualiza.** `skipWaiting()` solo corre cuando la app lo
 *   pide. Activar una versión nueva recarga las pestañas, y el kiosko **no
 *   se recarga a media venta** (CLAUDE.md §4): quien decide cuándo es seguro
 *   es la app, que sabe si hay un carrito abierto.
 */
function serviceWorker(base: string, casco: string[]): string {
  return `// Generado por @shake/pwa. No editar a mano: se reescribe en cada build.
const CASCO = ${JSON.stringify(casco)}
const CACHE = 'lily-casco-' + ${JSON.stringify(hashDe(casco))}

self.addEventListener('install', (e) => {
  // Se instala pero NO se activa: espera a que la app diga que es seguro.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // \`reload\` para no precargar desde la caché HTTP del navegador, que
      // puede traer la version anterior y dejarla guardada como si fuera nueva.
      Promise.allSettled(CASCO.map((u) => c.add(new Request(u, { cache: 'reload' })))),
    ),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const llaves = await caches.keys()
      await Promise.all(
        llaves.filter((k) => k.startsWith('lily-casco-') && k !== CACHE).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

// La app pide activar la version nueva cuando no hay una venta a medias.
self.addEventListener('message', (e) => {
  if (e.data === 'ACTIVAR_YA') self.skipWaiting()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Nada de otro origen: Supabase, fuentes de Google, lo que sea. Los datos
  // se piden siempre a la red -- ver el comentario de arriba.
  if (url.origin !== self.location.origin) return

  // Una navegacion: primero la red, y si no hay, el casco guardado. Asi la
  // pantalla abre sin internet y es la app la que explica que no hay conexion.
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          return await fetch(req)
        } catch {
          const c = await caches.open(CACHE)
          return (await c.match(${JSON.stringify(base)})) ?? Response.error()
        }
      })(),
    )
    return
  }

  // Los archivos con hash en el nombre: de la caché si estan, porque su
  // contenido no puede haber cambiado sin cambiar de nombre.
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE)
      const guardado = await c.match(req)
      if (guardado) return guardado
      const fresco = await fetch(req)
      if (fresco.ok && /\\.(js|css|woff2?|png|svg)$/.test(url.pathname)) {
        c.put(req, fresco.clone())
      }
      return fresco
    })(),
  )
})
`
}

/** Un nombre de caché que cambia cuando cambia el contenido del casco. */
function hashDe(casco: string[]): string {
  let h = 0
  for (const s of casco) {
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
