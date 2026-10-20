// Cómo se le habla a Interredes Remotas (Banorte / Payworks, vía TPV Solutions).
//
// La API vive en `posbridgetpv.tpvsolutions.com.mx` y se documenta en
// `docs/interredes-manual.md` (Anexo IX del manual de Interredes). Esto es
// lo compartido entre las funciones que la usan: la base, el certificado
// que le falta al servidor, el login con su token, y las tres operaciones
// que la caja necesita (venta, verificación, cancelación).
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

// ---------------------------------------------------------------------------
// Secretos
// ---------------------------------------------------------------------------

/** Faltan secretos del proyecto. `faltan` dice cuáles, por nombre. */
export class InterredesSinCredenciales extends Error {
  readonly faltan: string[]
  constructor(faltan: string[]) {
    super(`Faltan en los secrets del proyecto: ${faltan.join(', ')}.`)
    this.name = 'InterredesSinCredenciales'
    this.faltan = faltan
  }
}

/** Las credenciales de la API (las de TPV Solutions, no las de Payworks). */
export function credencialesInterredes(): { username: string; password: string } {
  const username = Deno.env.get('INTERREDES_API_USER')
  const password = Deno.env.get('INTERREDES_API_PASSWORD')
  const faltan = [!username && 'INTERREDES_API_USER', !password && 'INTERREDES_API_PASSWORD'].filter(Boolean) as string[]
  if (faltan.length) throw new InterredesSinCredenciales(faltan)
  return { username: username!, password: password! }
}

export type ModoInterredes = 'PRD' | 'AUT' | 'DEC' | 'RND'

/**
 * Todo lo que hace falta para COBRAR, no solo para entrar.
 *
 * Son dos juegos de credenciales distintos, y confundirlos es el error más
 * fácil: las de la API (`INTERREDES_API_*`) abren el `/login`; las de
 * Payworks (`PAYWORKS_*`) viajan DENTRO de cada venta como `user` y
 * `password`, junto con la afiliación que representan.
 *
 * `PAYWORKS_MODE` decide si la pinpad cobra de verdad: `PRD` cobra; `AUT`,
 * `DEC` y `RND` simulan (aprobada, declinada, al azar) sin tocar la tarjeta.
 * Se exige explícito: un `PRD` por omisión es la forma de cobrarle de
 * verdad a alguien durante una prueba.
 */
export interface ConfigInterredes {
  api: { username: string; password: string }
  payworks: { user: string; password: string }
  /** Número de serie de la pinpad, como lo quiere Payworks («0» + últimos 8 en PAX). */
  serial: string
  /** Grupo/caja al que pertenece la terminal; va en cada venta y en el cierre. */
  group: string
  modo: ModoInterredes
}

export function configInterredes(): ConfigInterredes {
  const lee = (k: string) => Deno.env.get(k)?.trim() || null
  const api = { username: lee('INTERREDES_API_USER'), password: lee('INTERREDES_API_PASSWORD') }
  const payworks = { user: lee('PAYWORKS_USER'), password: lee('PAYWORKS_PASSWORD') }
  const serial = lee('PINPAD_SERIAL')
  const group = lee('PAYWORKS_GROUP')
  const modo = lee('PAYWORKS_MODE')?.toUpperCase() ?? null
  const faltan: string[] = []
  if (!api.username) faltan.push('INTERREDES_API_USER')
  if (!api.password) faltan.push('INTERREDES_API_PASSWORD')
  if (!payworks.user) faltan.push('PAYWORKS_USER')
  if (!payworks.password) faltan.push('PAYWORKS_PASSWORD')
  if (!serial) faltan.push('PINPAD_SERIAL')
  if (!group) faltan.push('PAYWORKS_GROUP')
  if (!modo || !['PRD', 'AUT', 'DEC', 'RND'].includes(modo)) faltan.push('PAYWORKS_MODE (PRD | AUT | DEC | RND)')
  if (faltan.length) throw new InterredesSinCredenciales(faltan)
  return {
    api: { username: api.username!, password: api.password! },
    payworks: { user: payworks.user!, password: payworks.password! },
    serial: serial!,
    group: group!,
    modo: modo as ModoInterredes,
  }
}

/** Qué secretos faltan para cobrar, sin lanzar. Para la sonda. */
export function secretosQueFaltan(): string[] {
  try {
    configInterredes()
    return []
  } catch (e) {
    if (e instanceof InterredesSinCredenciales) return e.faltan
    throw e
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

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

/** La API contestó, pero con un error (RFC 7807: el texto útil va en `detail`). */
export class InterredesError extends Error {
  readonly http: number
  readonly cuerpo: unknown
  constructor(http: number, cuerpo: unknown, mensaje: string) {
    super(mensaje)
    this.name = 'InterredesError'
    this.http = http
    this.cuerpo = cuerpo
  }
}

/** Lee una respuesta: JSON si lo es, texto si no, y el mensaje útil de un error. */
async function leerRespuesta(r: Response): Promise<{ http: number; cuerpo: unknown; texto: string }> {
  const texto = await r.text()
  let cuerpo: unknown = texto
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    /* no era JSON */
  }
  return { http: r.status, cuerpo, texto }
}

function mensajeDeError(http: number, cuerpo: unknown, texto: string): string {
  const c = cuerpo as Record<string, unknown> | null
  const detalle = c && typeof c === 'object' ? (c.detail ?? c.message ?? c.title) : null
  return typeof detalle === 'string' && detalle ? detalle : `La API de Interredes respondió ${http}: ${texto.slice(0, 200)}`
}

export interface LoginInterredes {
  /** Código HTTP que contestó la API. */
  http: number
  /** El token, o null si no vino. */
  token: string | null
  /** Lo que dijo la API cuando no dio token (`message`, o el cuerpo crudo). */
  mensaje: string | null
}

/**
 * `POST /login` → `{ status: true, token }` con un JWT de 2 horas, o un
 * error. Un usuario que no existe es un **500** con `detail: "El cliente X
 * no existe."`, no un 401 — comprobado el 20/10/26.
 */
export async function loginInterredes(username: string, password: string): Promise<LoginInterredes> {
  const r = await fetchInterredes('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const { http, cuerpo, texto } = await leerRespuesta(r)
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { status?: boolean; token?: string; message?: string }
  const token = c.status && c.token ? c.token : null
  return { http, token, mensaje: token ? null : mensajeDeError(http, cuerpo, texto) }
}

// El token vive 2 h. Se guarda por instancia de la función y se renueva
// cuando le quedan menos de 5 minutos, o si la API lo rechaza (401).
let tokenCache: { token: string; vence: number } | null = null

function venceSegunJwt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export async function tokenInterredes(cfg: ConfigInterredes, forzar = false): Promise<string> {
  if (!forzar && tokenCache && tokenCache.vence - Date.now() > 5 * 60_000) return tokenCache.token
  const r = await loginInterredes(cfg.api.username, cfg.api.password)
  if (!r.token) throw new InterredesError(r.http, null, `No se pudo entrar a la API de Interredes: ${r.mensaje}`)
  tokenCache = { token: r.token, vence: venceSegunJwt(r.token) ?? Date.now() + 110 * 60_000 }
  return r.token
}

/**
 * Una llamada autenticada. Si el token ya no sirve (401), entra de nuevo y
 * reintenta UNA vez. Devuelve el cuerpo tal cual; si la API contestó un
 * error, lanza `InterredesError` con su `detail`.
 */
export async function llamarInterredes(cfg: ConfigInterredes, ruta: string, body: Record<string, unknown>): Promise<unknown> {
  let token = await tokenInterredes(cfg)
  for (let intento = 0; intento < 2; intento++) {
    const r = await fetchInterredes(ruta, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const { http, cuerpo, texto } = await leerRespuesta(r)
    if (http === 401 && intento === 0) {
      token = await tokenInterredes(cfg, true)
      continue
    }
    if (http < 200 || http >= 300) throw new InterredesError(http, cuerpo, mensajeDeError(http, cuerpo, texto))
    return cuerpo
  }
  throw new InterredesError(401, null, 'La API de Interredes rechazó el token dos veces.')
}

// ---------------------------------------------------------------------------
// Leer lo que contesta la pinpad
// ---------------------------------------------------------------------------

/**
 * Lo del voucher (Anexo VII del manual): lo que el papel tiene que decir de
 * una venta con tarjeta. Todo opcional porque viene de la respuesta y el
 * manual no fija los nombres de las claves; lo que no venga no se imprime.
 */
export interface VoucherInterredes {
  afiliacion: string | null
  /** Número de control que mandamos nosotros. */
  controlNumber: string | null
  /** Código de autorización del banco. */
  autorizacion: string | null
  /** `paywReference`: con esto se cancela o devuelve. */
  referencia: string | null
  terminalId: string | null
  marca: string | null
  /** Crédito / débito. */
  tipo: string | null
  banco: string | null
  /** PAN enmascarado, tal cual viene. */
  pan: string | null
  /** CHIP, CONTACTLESSCHIP, BANDA… */
  entrada: string | null
  /** 1 = con NIP, 2 = QPS (sin firma ni NIP), 0 = con firma. */
  pin: string | null
  aid: string | null
  /** Application Preferred Name, o Application Label si no hay. */
  aplicacion: string | null
  tvr: string | null
  tsi: string | null
}

export interface ResultadoTerminal {
  /** A aprobada · D declinada · R rechazada · T sin respuesta · ? no se entendió. */
  resultado: 'A' | 'D' | 'R' | 'T' | '?'
  aprobado: boolean
  /** `paywCode`: el motivo, cuando no se aprobó. */
  codigo: string | null
  /** `text`: lo que dice la red, para la pantalla. */
  texto: string | null
  voucher: VoucherInterredes
  /** La respuesta entera, tal cual llegó. Se guarda antes de interpretarla. */
  crudo: unknown
}

/**
 * Aplana la respuesta a un solo nivel con las claves normalizadas (minúsculas,
 * sin guiones ni guiones bajos). El Anexo IX enseña las PETICIONES en
 * capturas y los campos de la respuesta por su nombre del DLL (`paywResult`,
 * `authCode`…) sin decir si la API los devuelve así, envueltos en `data`, o
 * en mayúsculas. Buscarlos sin importar forma ni nivel es lo que hace que la
 * primera venta en modo AUT los encuentre en vez de reventar.
 */
export function aplanar(o: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) aplanar(v, out)
      else {
        const kk = k.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (!(kk in out)) out[kk] = v
      }
    }
  }
  return out
}

function campo(plano: Record<string, unknown>, ...nombres: string[]): string | null {
  for (const n of nombres) {
    const v = plano[n.toLowerCase().replace(/[^a-z0-9]/g, '')]
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

export function leerResultado(crudo: unknown): ResultadoTerminal {
  const p = aplanar(crudo)
  const bruto = (campo(p, 'paywResult', 'payw_result', 'result', 'resultado') ?? '?').toUpperCase()
  const resultado = (['A', 'D', 'R', 'T'].includes(bruto[0]) ? bruto[0] : '?') as ResultadoTerminal['resultado']
  return {
    resultado,
    aprobado: resultado === 'A',
    codigo: campo(p, 'paywCode', 'payw_code', 'code'),
    texto: campo(p, 'text', 'message', 'detail'),
    voucher: {
      afiliacion: campo(p, 'affiliation', 'afiliacion', 'merchantId'),
      controlNumber: campo(p, 'controlNumber', 'control_number'),
      autorizacion: campo(p, 'authCode', 'auth_code', 'authorization'),
      referencia: campo(p, 'paywReference', 'payw_reference', 'reference'),
      terminalId: campo(p, 'terminalId', 'terminal_id', 'tid'),
      marca: campo(p, 'cardBrand', 'card_brand', 'brand'),
      tipo: campo(p, 'cardType', 'card_type'),
      banco: campo(p, 'issuingBank', 'issuing_bank', 'bank'),
      pan: campo(p, 'pan', 'maskedPan', 'cardNumber'),
      entrada: campo(p, 'entryMode', 'entry_mode'),
      pin: campo(p, 'pinRequested', 'pin_requested'),
      aid: campo(p, 'appId', 'app_id', 'aid'),
      aplicacion: campo(p, 'appPrefName', 'app_pref_name', 'appLabel', 'app_label'),
      tvr: campo(p, 'tvr'),
      tsi: campo(p, 'tsi'),
    },
    crudo,
  }
}

// ---------------------------------------------------------------------------
// Las operaciones
// ---------------------------------------------------------------------------

/**
 * El importe como lo quiere la API: en pesos, y con punto decimal SOLO si
 * hay centavos («4301», «100.01» — los dos ejemplos del manual).
 */
export function montoInterredes(n: number): string {
  const v = Math.round(n * 100) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/** Lo que va en toda transacción: credenciales de Payworks, pinpad, grupo, modo. */
function base(cfg: ConfigInterredes, controlNumber: string) {
  return {
    controlNumber,
    customerRef1: '',
    customerRef3: '',
    // Lo exige el manual, siempre con este valor exacto.
    customerRef5: 'PaxInterredAPI',
    group: cfg.group,
    mode: cfg.modo,
    user: cfg.payworks.user,
    password: cfg.payworks.password,
    serialPinpad: cfg.serial,
    timeout: '90',
  }
}

/**
 * Venta: el importe aparece en la pinpad, el cliente pone la tarjeta, y la
 * llamada se queda esperando hasta que hay resultado o pasan 90 s.
 */
export async function ventaInterredes(cfg: ConfigInterredes, p: { controlNumber: string; monto: number }): Promise<ResultadoTerminal> {
  const crudo = await llamarInterredes(cfg, '/transaction/sale', {
    ...base(cfg, p.controlNumber),
    deferment: '',
    paymentNumber: '',
    planType: '',
    transactionAmount: montoInterredes(p.monto),
  })
  return leerResultado(crudo)
}

/**
 * Cancelación del día (`void`): deshace una venta aprobada hoy. Pide la
 * `paywReference` y el `authCode` de la venta original.
 */
export async function anularInterredes(
  cfg: ConfigInterredes,
  p: { controlNumber: string; monto: number; referencia: string; autorizacion: string },
): Promise<ResultadoTerminal> {
  const crudo = await llamarInterredes(cfg, '/transaction/void', {
    ...base(cfg, p.controlNumber),
    transactionAmount: montoInterredes(p.monto),
    paywReference: p.referencia,
    authCode: p.autorizacion,
  })
  return leerResultado(crudo)
}

/**
 * Verificación: «¿qué pasó con el número de control X?». Es la pregunta que
 * se hace cuando la venta no contestó (red, timeout): la pinpad pudo haber
 * cobrado y nosotros no enterarnos. Devuelve null si la API no la encuentra.
 */
export async function verificarInterredes(
  cfg: ConfigInterredes,
  p: { controlNumber: string; referencia?: string | null },
): Promise<ResultadoTerminal | null> {
  try {
    const crudo = await llamarInterredes(cfg, '/transaction', {
      ...base(cfg, p.controlNumber),
      ...(p.referencia ? { paywReference: p.referencia } : {}),
    })
    const r = leerResultado(crudo)
    return r.resultado === '?' ? null : r
  } catch (e) {
    if (e instanceof InterredesError && (e.http === 404 || e.http === 500)) return null
    throw e
  }
}
