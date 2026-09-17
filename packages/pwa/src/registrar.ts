/**
 * Registra el service worker que hace instalable la app.
 *
 * La parte delicada no es registrarlo: es **cuándo** dejar que la versión
 * nueva tome el control. Activar un service worker nuevo recarga la pestaña,
 * y en el kiosko eso a media venta le borra el carrito al cliente — la
 * trampa de CLAUDE.md §4, que ya costó una vez con la señal de "actualizar
 * pantallas" del Admin.
 *
 * Así que aquí nada se activa solo cuando hay algo que perder. Las pantallas
 * que no tienen ventas a medias (Producción, Almacén, Admin, la TV de folios)
 * pasan a la versión nueva en cuanto está; el kiosko y la caja pasan
 * `activarCuando` con su propia idea de "ahora sí es seguro" — la misma
 * condición que ya usan para la señal de recarga, no una segunda escrita
 * aparte.
 */

export interface OpcionesDeRegistro {
  /**
   * Si se pasa, la versión nueva **espera** hasta que esto devuelva `true`.
   * Se consulta al enterarse y luego cada 10 s. Sin esto, se activa de
   * inmediato.
   */
  activarCuando?: () => boolean
  /** El `base` de la app. Por omisión, el de Vite. */
  base?: string
}

/** Devuelve una función para dejar de vigilar (para el `useEffect`). */
export function registrarPwa(opciones: OpcionesDeRegistro = {}): () => void {
  // `serviceWorker` no existe en un contexto no seguro (http:// que no sea
  // localhost). No es un error: es que ahí no se puede instalar, y la app
  // tiene que funcionar igual de bien.
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return () => {}

  const base = normalizar(opciones.base ?? import.meta.env?.BASE_URL ?? '/')
  const esSeguro = opciones.activarCuando ?? (() => true)

  let esperando: ServiceWorker | null = null
  let vivo = true
  let recargando = false
  /**
   * Solo se recarga si NOSOTROS pedimos el cambio de versión.
   *
   * El service worker llama a `clients.claim()` al activarse, y eso dispara
   * `controllerchange` también en la PRIMERA instalación -- cuando no hay
   * ninguna versión vieja que reemplazar. Sin esta bandera, la primera
   * visita a cada app se recargaba sola, siempre, sin que nadie hubiera
   * actualizado nada. (Salió al probarlo en Chromium de verdad: la página se
   * caía a media prueba.) Una recarga que aparece y nadie pidió es
   * exactamente el tipo de cosa que en el kiosko borra un carrito.
   */
  let pedimosActivar = false
  let vigia: ReturnType<typeof setInterval> | undefined

  /** A cuál ya le pedimos pasar. Se pide UNA vez por versión, no cada vigía. */
  let yaPedido: ServiceWorker | null = null

  function intentar() {
    if (!vivo || !esperando || esperando === yaPedido || !esSeguro()) return
    yaPedido = esperando
    pedimosActivar = true
    esperando.postMessage('ACTIVAR_YA')
  }

  // Cuando la versión nueva toma el control hay que recargar para que la
  // pestaña corra el código nuevo. Una sola vez: `controllerchange` puede
  // dispararse más de una y dos recargas encadenadas se ven como un parpadeo.
  function alCambiarDeControl() {
    if (!pedimosActivar || recargando) return
    recargando = true
    window.location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', alCambiarDeControl)

  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then((reg) => {
      if (!vivo) return

      function revisar() {
        // `controller` nulo significa que esta es la PRIMERA instalación: no
        // hay versión vieja a la que reemplazar, así que no hay nada que
        // activar ni que recargar.
        if (reg.waiting && navigator.serviceWorker.controller) {
          esperando = reg.waiting
        }
        intentar()
      }

      revisar()
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', revisar)
      })

      // El vigía vuelve a MIRAR, no solo a preguntar.
      //
      // Hace dos cosas, y la segunda se me había escapado:
      //
      //   1. La versión nueva llegó mientras había un carrito abierto, así que
      //      hay que volver a preguntar si ya se puede activar.
      //   2. `updatefound` puede no haber llegado nunca a esta pestaña. Pasa
      //      cuando OTRA pestaña del mismo origen instaló la actualización --
      //      y en la PC de la tienda eso es lo normal, con la Caja y el Admin
      //      abiertos al mismo tiempo. Si el vigía solo consultara `esSeguro`,
      //      esta pestaña se quedaría con la versión vieja para siempre,
      //      esperando un evento que ya pasó.
      vigia = setInterval(revisar, 10_000)
    })
    .catch(() => {
      // Que no se pueda registrar no es motivo para molestar a nadie: la app
      // funciona igual, solo no queda instalable. Un error que aparece y
      // sobre el que nadie puede hacer nada es peor que ningún error
      // (CLAUDE.md §4).
    })

  return () => {
    vivo = false
    if (vigia) clearInterval(vigia)
    navigator.serviceWorker.removeEventListener('controllerchange', alCambiarDeControl)
  }
}

function normalizar(base: string): string {
  return base.endsWith('/') ? base : `${base}/`
}
