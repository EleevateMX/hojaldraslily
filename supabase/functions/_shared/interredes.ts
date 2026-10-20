// Cómo se le habla a Interredes Remotas (Banorte / Payworks, vía TPV Solutions).
//
// La API vive en `posbridgetpv.tpvsolutions.com.mx` y se documenta en
// `docs/interredes-manual.md` (Anexo IX del manual de Interredes). Esto es
// lo compartido entre las funciones que la usan: la base, el certificado
// que le falta al servidor, y el login.
//
// **El servidor manda su certificado dos veces y no manda el intermedio.**
// Comprobado el 20/10/26 desde tres sitios distintos: pg_net desde la base
// («SSL peer certificate … was not OK»), el proxy de Apify («Could not
// verify the TLS certificate») y un verificador externo («The order of
// certificates is invalid or certificates cannot build certification
// path»: dos copias de `*.tpvsolutions.com.mx`, ninguna de la CA). Un
// navegador en Windows lo acepta porque Windows va a buscar el intermedio
// solo (AIA); curl, pg_net y Deno no lo hacen, así que una Edge Function
// que haga `fetch()` a secas rebota ANTES de mandar un byte.
//
// Lo correcto es que TPV Solutions arregle su cadena, y hay que pedírselo.
// Mientras tanto se confía **explícitamente** en el intermedio que falta:
// «Sectigo Public Server Authentication CA DV R36», emitido por la raíz
// «Sectigo Public Server Authentication Root R46» que ya está en todos los
// almacenes. No se afloja nada: se verifica la misma cadena que verificaría
// un navegador, solo que con el eslabón que el servidor olvidó mandar. El
// certificado se bajó de `crt.sectigo.com` (la URL AIA que trae el propio
// certificado del servidor) y se comprobó con `openssl verify` contra las
// raíces del sistema antes de pegarlo aquí.
//
//   sha256: 8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:
//           29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0
//   vigente hasta el 21/03/2036
//
// Si un día el servidor manda la cadena completa, esto sobra y no estorba.

export const INTERREDES_BASE = 'https://posbridgetpv.tpvsolutions.com.mx/api/v1/pinpad'

export const SECTIGO_DV_R36_PEM = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----
`

/** Faltan las credenciales de la API en los secrets del proyecto. */
export class InterredesSinCredenciales extends Error {
  constructor() {
    super('INTERREDES_API_USER / INTERREDES_API_PASSWORD no están configuradas en los secrets del proyecto.')
    this.name = 'InterredesSinCredenciales'
  }
}

let cliente: Deno.HttpClient | null = null

/**
 * El cliente HTTP que confía en el intermedio que falta. Se crea una vez por
 * instancia de la función; `caCerts` SUMA raíces a las del sistema, no las
 * reemplaza.
 */
export function clienteInterredes(): Deno.HttpClient {
  if (!cliente) cliente = Deno.createHttpClient({ caCerts: [SECTIGO_DV_R36_PEM] })
  return cliente
}

/**
 * `fetch` contra la API de Interredes, con el cliente de arriba. `ruta` va
 * sin la base: `'/login'`, `'/transaction/sale'`…
 */
export function fetchInterredes(ruta: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${INTERREDES_BASE}${ruta}`, {
    ...init,
    // `client` es la extensión de Deno al RequestInit; el tipo estable no la
    // trae, pero el runtime sí la respeta.
    client: clienteInterredes(),
  } as RequestInit & { client: Deno.HttpClient })
}

/** Las credenciales de la API (las de TPV Solutions, no las de Payworks). */
export function credencialesInterredes(): { username: string; password: string } {
  const username = Deno.env.get('INTERREDES_API_USER')
  const password = Deno.env.get('INTERREDES_API_PASSWORD')
  if (!username || !password) throw new InterredesSinCredenciales()
  return { username, password }
}

export interface LoginInterredes {
  /** Código HTTP que contestó la API. */
  http: number
  /** `true` si vino un token. */
  token: string | null
  /** Lo que dijo la API cuando no dio token (`message`, o el cuerpo crudo). */
  mensaje: string | null
}

/**
 * `POST /login` → `{ status: true, token }` con un JWT de 2 horas, o
 * `{ status: false, message }`. El token va después en
 * `Authorization: Bearer …`.
 */
export async function loginInterredes(username: string, password: string): Promise<LoginInterredes> {
  const r = await fetchInterredes('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const texto = await r.text()
  let cuerpo: { status?: boolean; token?: string; message?: string } = {}
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    /* no era JSON: se devuelve el texto como mensaje */
  }
  return {
    http: r.status,
    token: cuerpo.status && cuerpo.token ? cuerpo.token : null,
    mensaje: cuerpo.token ? null : (cuerpo.message ?? texto.slice(0, 300)),
  }
}
