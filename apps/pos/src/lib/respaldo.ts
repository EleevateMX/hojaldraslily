/**
 * La última respuesta buena, guardada en este navegador.
 *
 * Sin internet la caja tiene que **seguir mostrando el menú**. El service
 * worker se encarga de que la app abra (guarda el programa, nunca los datos:
 * un precio servido de una caché vieja es la forma de que `fn_cobrar_orden`
 * rechace el cobro con el cliente enfrente). Pero el catálogo sí hay que
 * tenerlo de algún lado, y ese lado es esto.
 *
 * Tres reglas que no son de estilo:
 *
 * - **La red va PRIMERO, siempre.** El respaldo solo entra si la consulta
 *   falla o si tarda demasiado. Nunca se sirve de aquí habiendo internet.
 * - **Se guarda solo lo que se usa para PINTAR**, y el servidor sigue siendo
 *   el que cobra. El precio del respaldo se le muestra al cliente; el que se
 *   cobra lo recalcula `fn_crear_orden`, y si no coinciden la diferencia
 *   queda anotada en `ventas_sin_internet` para revisión.
 * - **Un respaldo que no se puede escribir no se finge.** `localStorage`
 *   puede estar lleno o apagado; en ese caso esto devuelve `false` y quien
 *   llama decide, en vez de creer que quedó guardado.
 *
 * Y el tiempo de espera importa: ocho segundos. Sin él, una conexión que está
 * cayéndose —la que contesta en treinta segundos en vez de no contestar— deja
 * la caja mirando un «Cargando…» con gente formada, que es peor que decir
 * «sin internet» y seguir vendiendo.
 */

const PREFIJO = 'lily_pos_respaldo_'
const ESPERA_MS = 8000

export function leerRespaldo<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave)
    if (!crudo) return null
    return (JSON.parse(crudo) as { v: T }).v ?? null
  } catch {
    return null
  }
}

export function guardarRespaldo(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify({ en: Date.now(), v: valor }))
    return true
  } catch {
    return false
  }
}

/** Cuándo se guardó, para poder decir «el menú es de hace un rato». */
export function fechaDelRespaldo(clave: string): Date | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave)
    if (!crudo) return null
    const en = (JSON.parse(crudo) as { en?: number }).en
    return en ? new Date(en) : null
  } catch {
    return null
  }
}

function conEspera<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error('La consulta tardó demasiado (timeout)')), ESPERA_MS)
    p.then(
      (v) => { clearTimeout(t); resolver(v) },
      (e) => { clearTimeout(t); rechazar(e) },
    )
  })
}

/**
 * Corre la consulta y guarda su respuesta. Si falla —o tarda más de ocho
 * segundos— devuelve la última buena.
 *
 * Si nunca hubo una buena, el error se propaga tal cual: que la pantalla diga
 * qué pasó es mejor que enseñar un menú vacío como si la tienda no tuviera
 * nada que vender.
 */
export async function conRespaldo<T>(clave: string, consulta: () => Promise<T>): Promise<T> {
  try {
    const v = await conEspera(consulta())
    guardarRespaldo(clave, v)
    return v
  } catch (e) {
    const guardado = leerRespaldo<T>(clave)
    if (guardado !== null) return guardado
    throw e
  }
}
