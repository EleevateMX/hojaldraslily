import type { ShakeClient } from '../client'

/**
 * ¿Está habilitado un proveedor de OAuth en Supabase Auth?
 *
 * Hace falta preguntarlo ANTES de llamar a `signInWithOAuth`: ese método
 * redirige el navegador a Supabase, así que si el proveedor está apagado
 * el usuario acaba viendo el JSON crudo de GoTrue ("Unsupported provider:
 * provider is not enabled") en una pantalla en blanco, fuera de la app —
 * ya no hay forma de atrapar ese error desde el código.
 *
 * Ante cualquier duda (endpoint caído, red intermitente) devuelve `true`
 * para no bloquear un login que sí funcionaría: el objetivo es evitar la
 * pantalla de error fea, no ser un guardia estricto.
 */
export async function proveedorAuthHabilitado(
  sb: ShakeClient,
  proveedor: 'google' | 'facebook' | 'apple' = 'google',
): Promise<boolean> {
  try {
    // La URL y la anon key ya viven dentro del cliente creado en client.ts.
    const cfg = sb as unknown as { supabaseUrl?: string; supabaseKey?: string }
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return true
    const r = await fetch(`${cfg.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: cfg.supabaseKey },
    })
    if (!r.ok) return true
    const settings = (await r.json()) as { external?: Record<string, boolean> }
    const externos = settings.external
    if (!externos || typeof externos[proveedor] !== 'boolean') return true
    return externos[proveedor]
  } catch {
    return true
  }
}

/**
 * Inicia sesión con Google (OAuth de Supabase Auth). Redirige.
 * Lanza un error legible si Google todavía no está habilitado, para que la
 * app muestre su propio aviso en vez de mandar al usuario a la pantalla de
 * error de Supabase.
 */
export async function iniciarSesionGoogle(sb: ShakeClient, redirectTo: string): Promise<void> {
  if (!(await proveedorAuthHabilitado(sb, 'google'))) {
    throw new Error('provider is not enabled')
  }
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
}

export async function sesionActual(sb: ShakeClient) {
  const { data } = await sb.auth.getSession()
  return data.session
}

export async function usuarioActual(sb: ShakeClient) {
  const { data } = await sb.auth.getUser()
  return data.user
}

export async function cerrarSesion(sb: ShakeClient): Promise<void> {
  await sb.auth.signOut()
}

/** Suscribe a cambios de sesión; devuelve función para desuscribir. */
export function onCambioSesion(sb: ShakeClient, cb: () => void): () => void {
  const { data } = sb.auth.onAuthStateChange(() => cb())
  return () => data.subscription.unsubscribe()
}
