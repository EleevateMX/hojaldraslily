// Generado por @shake/pwa. No editar a mano: se reescribe en cada build.
const CASCO = ["/hojaldraslily/app/pos/","/hojaldraslily/app/pos/assets/index-KI3KY-WF.css","/hojaldraslily/app/pos/assets/index-9Em1pvu0.js"]
const CACHE = 'lily-casco-' + "1bn2g6x"

self.addEventListener('install', (e) => {
  // Se instala pero NO se activa: espera a que la app diga que es seguro.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // `reload` para no precargar desde la caché HTTP del navegador, que
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
          return (await c.match("/hojaldraslily/app/pos/")) ?? Response.error()
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
      if (fresco.ok && /\.(js|css|woff2?|png|svg)$/.test(url.pathname)) {
        c.put(req, fresco.clone())
      }
      return fresco
    })(),
  )
})
