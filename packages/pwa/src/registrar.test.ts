import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registrarPwa } from './registrar'

/**
 * Lo que se prueba aquí es la única cosa que puede hacerle daño a la tienda:
 * **cuándo** se deja pasar una versión nueva.
 *
 * Activarla recarga la pestaña. Si eso pasa con el ticket a medias, la cajera
 * pierde lo que capturó con el cliente enfrente (CLAUDE.md §4). Y al revés:
 * si NUNCA pasa, la tienda se queda con la versión vieja para siempre.
 *
 * Un navegador de verdad no sirve para probar esto: no hay manera de decirle
 * "ahora llega una versión nueva, pero justo cuando hay un carrito abierto".
 * Con un service worker falso, sí.
 */

// ---------------------------------------------------------------------------
// El service worker falso: lo mínimo que toca `registrarPwa`.
// ---------------------------------------------------------------------------
function montarNavegadorFalso() {
  const mensajes: string[] = []
  const oyentes: Record<string, (() => void)[]> = {}
  const esperando = { postMessage: (m: string) => mensajes.push(m) }

  const registro = {
    waiting: null as typeof esperando | null,
    installing: null as { addEventListener: (e: string, cb: () => void) => void } | null,
    addEventListener: (ev: string, cb: () => void) => {
      ;(oyentes[`reg:${ev}`] ??= []).push(cb)
    },
  }

  const sw = {
    controller: {} as object | null, // ya hay una versión corriendo
    register: vi.fn(() => Promise.resolve(registro)),
    getRegistration: vi.fn(() => Promise.resolve(registro)),
    addEventListener: (ev: string, cb: () => void) => {
      ;(oyentes[ev] ??= []).push(cb)
    },
    removeEventListener: vi.fn(),
  }

  const recargas = { n: 0 }

  vi.stubGlobal('navigator', sw ? { serviceWorker: sw } : {})
  vi.stubGlobal('window', {
    location: { reload: () => recargas.n++ },
    addEventListener: () => {},
  })
  vi.stubGlobal('import', undefined)

  return {
    mensajes,
    recargas,
    /**
     * Simula que el navegador terminó de instalar una versión nueva y avisó,
     * que es lo que pasa cuando la actualización la encuentra ESTA pestaña.
     */
    llegaVersionNueva() {
      const cambios: (() => void)[] = []
      registro.installing = { addEventListener: (_e, cb) => cambios.push(cb) }
      for (const cb of oyentes['reg:updatefound'] ?? []) cb()
      registro.waiting = esperando
      registro.installing = null
      for (const cb of cambios) cb()
    },
    /**
     * Simula que la actualización la instaló OTRA pestaña: queda una versión
     * esperando y a esta pestaña nunca le llegó el aviso.
     */
    llegaVersionNuevaSinAviso() {
      registro.waiting = esperando
    },
    /** Simula que el service worker nuevo tomó el control. */
    tomaElControl() {
      for (const cb of oyentes.controllerchange ?? []) cb()
    },
  }
}

let falso: ReturnType<typeof montarNavegadorFalso>

beforeEach(() => {
  vi.useFakeTimers()
  falso = montarNavegadorFalso()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('registrarPwa: cuándo se deja pasar la versión nueva', () => {
  it('no activa nada mientras no sea seguro, aunque la versión ya esté lista', async () => {
    const seguro = false
    registrarPwa({ activarCuando: () => seguro, base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNueva()
    // Pasa un minuto entero de vigía: seis oportunidades de equivocarse.
    await vi.advanceTimersByTimeAsync(60_000)

    expect(falso.mensajes).toEqual([])
  })

  it('la activa en cuanto deja de haber algo a medias', async () => {
    let seguro = false
    registrarPwa({ activarCuando: () => seguro, base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNueva()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(falso.mensajes).toEqual([])

    // Se cobró el ticket: ya no hay nada que perder.
    seguro = true
    await vi.advanceTimersByTimeAsync(10_000)

    expect(falso.mensajes).toEqual(['ACTIVAR_YA'])
  })

  it('sin condición, la activa de inmediato: es para pantallas sin ventas a medias', async () => {
    registrarPwa({ base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNueva()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(falso.mensajes).toEqual(['ACTIVAR_YA'])
  })

  it('deja de vigilar cuando se suelta: un desmontaje no debe seguir activando', async () => {
    let seguro = false
    const soltar = registrarPwa({ activarCuando: () => seguro, base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNueva()
    soltar()
    seguro = true
    await vi.advanceTimersByTimeAsync(60_000)

    expect(falso.mensajes).toEqual([])
  })
})

describe('registrarPwa: la recarga', () => {
  it('recarga cuando la versión que NOSOTROS pedimos toma el control', async () => {
    registrarPwa({ base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNueva()
    await vi.advanceTimersByTimeAsync(10_000)
    falso.tomaElControl()

    expect(falso.recargas.n).toBe(1)
  })

  // El bug que salió al probar en Chromium: `clients.claim()` dispara
  // `controllerchange` también en la primera instalación, y la página se
  // recargaba sola sin que nadie hubiera actualizado nada.
  it('NO recarga si el control cambió sin que lo hayamos pedido', async () => {
    registrarPwa({ base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.tomaElControl()

    expect(falso.recargas.n).toBe(0)
  })

  it('recarga una sola vez, aunque el control cambie varias', async () => {
    registrarPwa({ base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNueva()
    await vi.advanceTimersByTimeAsync(10_000)
    falso.tomaElControl()
    falso.tomaElControl()
    falso.tomaElControl()

    expect(falso.recargas.n).toBe(1)
  })
})

describe('registrarPwa: la actualización que instaló otra pestaña', () => {
  // En la PC de la tienda la Caja y el Admin están abiertos al mismo tiempo.
  // Si una instala la actualización, a la otra `updatefound` nunca le llega:
  // se encuentra con una versión ya esperando y ningún aviso. El vigía tiene
  // que MIRAR, no solo preguntar.
  it('la encuentra igual, aunque nunca le avisaron', async () => {
    registrarPwa({ base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNuevaSinAviso()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(falso.mensajes).toEqual(['ACTIVAR_YA'])
  })

  it('y no la pide una y otra vez en cada vigía', async () => {
    registrarPwa({ base: '/' })
    await vi.advanceTimersByTimeAsync(0)

    falso.llegaVersionNuevaSinAviso()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(falso.mensajes).toEqual(['ACTIVAR_YA'])
  })
})
