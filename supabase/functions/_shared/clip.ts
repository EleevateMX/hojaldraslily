// Autenticación contra la API de Clip.
//
// Clip no usa un token único: se arma en el momento a partir del par
// API key + clave secreta, unidos por dos puntos y codificados en base64,
// con el prefijo "Basic" — el mismo esquema que documenta su portal:
//
//     echo -n Tu_API_Key:Tu_Clave_Secreta | base64
//     Basic YWJhNWJkNjQtOTYwOC00N2E4...
//
// Se arma aquí, del lado del servidor, y NUNCA se guarda ya armado: si el
// token precalculado se filtrara, quien lo tenga puede cobrar en nombre del
// negocio, y no hay forma de revocarlo sin regenerar las credenciales.
//
// Según la API que se consuma, el token viaja en `authorization` o en
// `x-api-key`. Por eso `headersClip()` recibe cuál usar en vez de asumirlo.

/** Faltan las credenciales en los secrets del proyecto. */
export class ClipSinCredenciales extends Error {
  constructor() {
    super('CLIP_API_KEY / CLIP_API_SECRET no están configuradas en los secrets del proyecto.')
    this.name = 'ClipSinCredenciales'
  }
}

/**
 * `Basic <base64(api_key:clave_secreta)>`.
 *
 * El paso por `TextEncoder` no es adorno: `btoa` solo acepta latin-1 y
 * reventaría si una credencial trajera algún carácter fuera de ASCII.
 */
export function tokenAuthClip(apiKey: string, claveSecreta: string): string {
  const bytes = new TextEncoder().encode(`${apiKey}:${claveSecreta}`)
  return `Basic ${btoa(String.fromCharCode(...bytes))}`
}

/**
 * Lee las credenciales de los secrets. Lanza si falta alguna.
 *
 * La mitad secreta se acepta bajo dos nombres: CLIP_API_SECRET (el
 * canónico — es la "Secret Key" del panel de Clip) o CLIP_WEBHOOK_SECRET
 * (el nombre que se usó al principio del proyecto). Así, con cualquiera
 * de los dos configurado, el cobro funciona.
 */
export function credencialesClip(): { apiKey: string; claveSecreta: string } {
  const apiKey = Deno.env.get('CLIP_API_KEY')
  const claveSecreta = Deno.env.get('CLIP_API_SECRET') ?? Deno.env.get('CLIP_WEBHOOK_SECRET')
  if (!apiKey || !claveSecreta) throw new ClipSinCredenciales()
  return { apiKey, claveSecreta }
}

/**
 * Cabeceras listas para llamar a Clip.
 *
 * @param donde  En qué campo va el token. La documentación de Clip dice que
 *               depende de la API concreta que se consuma, así que se pide
 *               explícito en lugar de adivinar.
 */
export function headersClip(donde: 'authorization' | 'x-api-key' = 'authorization'): HeadersInit {
  const { apiKey, claveSecreta } = credencialesClip()
  const token = tokenAuthClip(apiKey, claveSecreta)
  return {
    [donde]: token,
    accept: 'application/json',
    'content-type': 'application/json',
  }
}
