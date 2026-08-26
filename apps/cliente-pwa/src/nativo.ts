import type { ShakeClient } from '@shake/supabase'

/**
 * Lo que cambia cuando la app corre envuelta en iOS o Android.
 *
 * Casi nada: la misma web, la misma base, las mismas funciones. Lo unico
 * que NO se puede reutilizar es el login de Google, porque en la web
 * Supabase redirige el navegador y vuelve con el codigo en la URL, y
 * dentro de una app nativa no hay a donde redirigir: la vuelta llega como
 * un enlace profundo (com.hojaldraslily.rewards://auth) que hay que atender
 * a mano.
 *
 * Todo esto se carga con `import()` y solo cuando de verdad corre en un
 * telefono. En la web no entra al paquete, asi que envolver la app no le
 * cuesta peso a rewards.hojaldraslily.com.
 */

const ESQUEMA = 'com.hojaldraslily.rewards'
export const VUELTA_LOGIN = `${ESQUEMA}://auth`

/** ¿Esto corre dentro de la app de la tienda, o en un navegador? */
export function esNativo(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(cap?.isNativePlatform?.())
}

/**
 * Login de Google en el telefono.
 *
 * `skipBrowserRedirect` hace que Supabase devuelva la URL en vez de
 * navegar a ella: dentro de la app hay que abrirla en el navegador del
 * sistema, no en la vista de la app. Google rechaza los login hechos
 * dentro de un WebView, asi que este rodeo no es opcional.
 */
export async function iniciarSesionGoogleNativa(sb: ShakeClient): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: VUELTA_LOGIN, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data?.url) throw new Error('Supabase no devolvio la URL de Google')
  await Browser.open({ url: data.url, presentationStyle: 'popover' })
}

/**
 * Atiende la vuelta del login.
 *
 * Devuelve la funcion para dejar de escuchar. En la web no hace nada y
 * devuelve una funcion vacia, para que quien llame no tenga que preguntar.
 */
export async function escucharVueltaDeLogin(
  sb: ShakeClient,
  alEntrar: () => void,
): Promise<() => void> {
  if (!esNativo()) return () => {}

  const { App } = await import('@capacitor/app')
  const { Browser } = await import('@capacitor/browser')

  const suscripcion = await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(VUELTA_LOGIN)) return
    try {
      // El codigo puede venir como ?code= o como #code=, segun el flujo.
      const partes = new URL(url.replace(`${ESQUEMA}://`, 'https://'))
      const codigo =
        partes.searchParams.get('code') ??
        new URLSearchParams(partes.hash.replace(/^#/, '')).get('code')
      if (codigo) await sb.auth.exchangeCodeForSession(codigo)
    } finally {
      // Cerrar siempre: si el navegador se queda abierto encima, el
      // cliente ya entro pero no ve su tarjeta y cree que fallo.
      await Browser.close().catch(() => {})
      alEntrar()
    }
  })

  return () => { void suscripcion.remove() }
}
