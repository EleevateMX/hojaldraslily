import type { ClienteLily } from '../client'

/**
 * Sesión del personal: el PIN deja de ser un candado de pantalla.
 *
 * Antes `fn_login_cajero` validaba el PIN y el resultado se guardaba en
 * memoria del navegador; la base seguía viendo `anon`. Ahora el PIN se canjea
 * por una sesión de Supabase Auth de verdad, y a partir de ahí cada consulta
 * viaja como `authenticated` con el empleado detrás. Es lo que le permite al
 * RLS distinguir a la cajera de cualquier persona con la llave publicable
 * —que vive dentro del frontend desplegado y por tanto es de dominio público.
 */

export interface EmpleadoSesion {
  id: string
  nombre: string
  rol: string
  sucursal_id: string | null
}

export interface ResultadoLogin {
  ok: boolean
  empleado: EmpleadoSesion | null
  /** Mensaje listo para mostrar. Null si todo salió bien. */
  error: string | null
}

interface RespuestaStaffLogin {
  ok: boolean
  token_hash?: string
  empleado?: EmpleadoSesion
  error?: { codigo: string; mensaje: string }
}

/**
 * Canjea el PIN por una sesión.
 *
 * Devuelve un resultado en vez de tronar: quien llama es una pantalla de
 * login y siempre tiene algo que decirle a la persona que está tecleando.
 */
export async function entrarConPin(sb: ClienteLily, pin: string): Promise<ResultadoLogin> {
  const { data, error } = await sb.functions.invoke('staff-login', { body: { pin } })

  if (error) {
    // Un PIN incorrecto llega como error HTTP 401, no como excepción de red.
    // Se intenta leer el cuerpo antes de rendirse y decir "falló la red",
    // que sería mentirle a la cajera.
    const cuerpo = await leerCuerpoDeError(error)
    return { ok: false, empleado: null, error: cuerpo ?? 'No se pudo conectar. Revisa la red.' }
  }

  const r = data as RespuestaStaffLogin | null
  if (!r?.ok || !r.token_hash || !r.empleado) {
    return { ok: false, empleado: null, error: r?.error?.mensaje ?? 'PIN incorrecto' }
  }

  // El token es de un solo uso: aquí se convierte en sesión con refresco.
  const { error: errorSesion } = await sb.auth.verifyOtp({
    type: 'email',
    token_hash: r.token_hash,
  })
  if (errorSesion) {
    return { ok: false, empleado: null, error: `No se pudo abrir la sesión: ${errorSesion.message}` }
  }

  return { ok: true, empleado: r.empleado, error: null }
}

/** Cierra la sesión del personal (fin de turno). */
export async function salirDeSesion(sb: ClienteLily): Promise<void> {
  await sb.auth.signOut()
}

/**
 * El empleado de la sesión viva, o null.
 *
 * Se le pregunta a la BASE y no a lo que el navegador tenga guardado: si el
 * administrador desactiva a alguien a media jornada, su sesión deja de valer
 * en la siguiente consulta, sin esperar a que cierre la pestaña.
 */
export async function empleadoDeLaSesion(sb: ClienteLily): Promise<EmpleadoSesion | null> {
  const { data: sesion } = await sb.auth.getSession()
  if (!sesion.session) return null

  const { data, error } = await sb
    .from('empleados')
    .select('id, nombre, sucursal_id, roles(slug)')
    .eq('auth_user_id', sesion.session.user.id)
    .eq('activo', true)
    .maybeSingle()
  if (error || !data) return null

  const fila = data as unknown as {
    id: string; nombre: string; sucursal_id: string | null; roles: { slug: string } | null
  }
  return { id: fila.id, nombre: fila.nombre, rol: fila.roles?.slug ?? '', sucursal_id: fila.sucursal_id }
}

/**
 * Sostiene la sesión cuando la pantalla vuelve del fondo.
 *
 * Una tableta que se bloquea deja de correr el navegador: el temporizador que
 * renueva el token no corre, el canal de Realtime se muere en silencio y, si
 * al sistema le hizo falta memoria, la página se descarta entera. Al
 * desbloquear pasan las tres cosas a la vez, y lo que se veía era «me sacó
 * del programa» o un error rojo que se iba solo al rato.
 *
 * Esto hace lo que hay que hacer en ese momento, una vez y en orden:
 *
 *  1. Le pide la sesión al cliente. Si el token venció mientras dormía, esa
 *     llamada lo renueva ANTES de que la pantalla vuelva a consultar nada —
 *     sin esto, la primera consulta sale con el token viejo y el servidor
 *     contesta 401.
 *  2. Si la sesión ya no existe (la cerraron desde otra pestaña, o venció del
 *     todo), avisa `alSalir` para que la pantalla vuelva al PIN en vez de
 *     seguir enseñando errores.
 *  3. Si sigue viva, avisa `alVolver` para que la pantalla relea lo suyo: lo
 *     que pasó en el horno mientras la tableta estaba bloqueada no llegó por
 *     Realtime, porque el canal estaba muerto.
 *
 * Y escucha el cierre de sesión del propio cliente, que es como se entera una
 * pestaña de que otra hizo «Salir».
 *
 * Devuelve la función para dejar de vigilar.
 */
export function vigilarSesion(
  sb: ClienteLily,
  { alVolver, alSalir }: { alVolver?: () => void; alSalir?: () => void },
): () => void {
  let revisando = false

  const revisar = async () => {
    if (revisando) return
    revisando = true
    try {
      const { data } = await sb.auth.getSession()
      if (!data.session) alSalir?.()
      else alVolver?.()
    } catch {
      // Sin red no se puede saber; la pantalla sigue con lo que tiene y el
      // siguiente sondeo lo dirá.
    } finally {
      revisando = false
    }
  }

  const alCambiarVisibilidad = () => {
    if (document.visibilityState === 'visible') void revisar()
  }
  // `pageshow` con `persisted` es la vuelta desde la caché del navegador
  // (Safari la usa mucho): la página revive tal cual estaba, sin recargar y
  // sin disparar `visibilitychange`.
  const alMostrar = (e: PageTransitionEvent) => {
    if (e.persisted) void revisar()
  }

  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  window.addEventListener('pageshow', alMostrar)
  const { data } = sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') alSalir?.()
  })

  return () => {
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    window.removeEventListener('pageshow', alMostrar)
    data.subscription.unsubscribe()
  }
}

/** Lee el mensaje que la Edge Function puso en el cuerpo de una respuesta de error. */
async function leerCuerpoDeError(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown })?.context
  if (!contexto || typeof (contexto as Response).json !== 'function') return null
  try {
    const cuerpo = (await (contexto as Response).json()) as RespuestaStaffLogin
    return cuerpo?.error?.mensaje ?? null
  } catch {
    return null
  }
}
