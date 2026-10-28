// El puente con ContaDigital (Isyconta) para timbrar la factura global diaria.
//
// Dos secretos y nada en el repo:
//   CONTADIGITAL_API_KEY   — la llave de facturación (genera el token).
//   CONTADIGITAL_RFC       — RFC del emisor; se busca entre las empresas que
//                            la llave puede facturar. HOY Hojaldras Lily (KHO…)
//                            NO está dada de alta en ContaDigital: hasta que lo
//                            esté, `empresaPorRfc` devuelve null y el timbrado
//                            se detiene con un mensaje claro.
// Opcionales (afinan cuando la empresa ya exista):
//   CONTADIGITAL_AMBIENTE  — 'pro' (default) | 'pruebas'.
//   CONTADIGITAL_SERIE     — descripción de la serie a usar (ej. 'FACTURA').
//   CONTADIGITAL_ID_PRODUCTO / CONTADIGITAL_ID_UM — producto/unidad genéricos
//                            del catálogo de la empresa para el renglón global.
//
// El token del plug-in de CFDI (CONTADIGITAL_PLUGIN_TOKEN) se guarda también
// como secreto por si otra parte de ContaDigital lo pide; el flujo REST usa la
// API Key -> token.

const BASES: Record<string, string> = {
  pro: 'https://app.contadigital.mx/dev/pro/api',
  pruebas: 'https://app.contadigital.mx/dev/pruebas/api',
}

/** Faltan secretos. `faltan` dice cuáles, por nombre. */
export class ContaDigitalSinCredenciales extends Error {
  readonly faltan: string[]
  constructor(faltan: string[]) {
    super(`Faltan en los secrets del proyecto: ${faltan.join(', ')}.`)
    this.name = 'ContaDigitalSinCredenciales'
    this.faltan = faltan
  }
}

/** ContaDigital contestó, pero con un código de error. */
export class ContaDigitalError extends Error {
  readonly codigo: number
  readonly crudo: unknown
  constructor(codigo: number, mensaje: string, crudo: unknown) {
    super(mensaje || `ContaDigital devolvió el código ${codigo}`)
    this.name = 'ContaDigitalError'
    this.codigo = codigo
    this.crudo = crudo
  }
}

export interface ConfigContaDigital {
  apiKey: string
  rfc: string | null
  ambiente: string
  base: string
  serie: string | null
  idProducto: number | null
  idUm: number | null
}

const lee = (k: string) => Deno.env.get(k)?.trim() || null

export function configContaDigital(): ConfigContaDigital {
  const apiKey = lee('CONTADIGITAL_API_KEY')
  if (!apiKey) throw new ContaDigitalSinCredenciales(['CONTADIGITAL_API_KEY'])
  const ambiente = (lee('CONTADIGITAL_AMBIENTE') || 'pro').toLowerCase()
  const base = BASES[ambiente] ?? BASES.pro
  const idProd = lee('CONTADIGITAL_ID_PRODUCTO')
  const idUm = lee('CONTADIGITAL_ID_UM')
  return {
    apiKey,
    rfc: lee('CONTADIGITAL_RFC'),
    ambiente: ambiente in BASES ? ambiente : 'pro',
    base,
    serie: lee('CONTADIGITAL_SERIE'),
    idProducto: idProd ? Number(idProd) : null,
    idUm: idUm ? Number(idUm) : null,
  }
}

/** Qué secretos faltan, sin lanzar. Para una sonda o para avisar en Admin. */
export function secretosQueFaltan(): string[] {
  const faltan: string[] = []
  if (!lee('CONTADIGITAL_API_KEY')) faltan.push('CONTADIGITAL_API_KEY')
  if (!lee('CONTADIGITAL_RFC')) faltan.push('CONTADIGITAL_RFC')
  if (!lee('CONTADIGITAL_ID_PRODUCTO')) faltan.push('CONTADIGITAL_ID_PRODUCTO')
  if (!lee('CONTADIGITAL_ID_UM')) faltan.push('CONTADIGITAL_ID_UM')
  return faltan
}

async function pedir(
  base: string,
  ruta: string,
  init: RequestInit,
): Promise<unknown> {
  const r = await fetch(`${base}${ruta}`, init)
  const texto = await r.text()
  let cuerpo: unknown = texto
  try { cuerpo = texto ? JSON.parse(texto) : null } catch { /* queda el texto */ }
  if (!r.ok) {
    throw new ContaDigitalError(r.status, `HTTP ${r.status} en ${ruta}`, cuerpo)
  }
  return cuerpo
}

// ContaDigital envuelve todo en { Codigo, Mensaje, Resultado }.
function desenvolver(crudo: unknown): unknown {
  const o = crudo as { Codigo?: number; Mensaje?: string; Resultado?: unknown }
  if (o && typeof o === 'object' && 'Codigo' in o) {
    if (o.Codigo !== 0) throw new ContaDigitalError(o.Codigo ?? -1, o.Mensaje ?? '', crudo)
    return o.Resultado
  }
  return crudo
}

export interface EmpresaCD { Id: number; RFC: string; Nombre: string; CP: string | null; Creditos: number }

/** API Key -> token + empresas que esa llave puede facturar. */
export async function conectar(cfg: ConfigContaDigital): Promise<{ token: string; empresas: EmpresaCD[] }> {
  const res = await pedir(cfg.base, '/conectar.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ APIKEY: cfg.apiKey }),
  })
  const r = desenvolver(res) as { Token: string; Empresas: EmpresaCD[] }
  return { token: r.Token, empresas: r.Empresas ?? [] }
}

/** La empresa emisora, buscada por RFC entre las que da la llave. null si no está de alta. */
export function empresaPorRfc(empresas: EmpresaCD[], rfc: string): EmpresaCD | null {
  const limpio = (s: string) => s.replace(/\s+/g, '').toUpperCase()
  return empresas.find((e) => limpio(e.RFC) === limpio(rfc)) ?? null
}

/** Catálogos e IDs que el emisor necesita para armar un CFDI. */
export async function utiles(cfg: ConfigContaDigital, token: string, idEmpresa: number): Promise<any> {
  const res = await pedir(cfg.base, `/cfdi/utiles.json/${idEmpresa}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  })
  return desenvolver(res)
}

/** El cliente de la empresa que empate con ese RFC (p. ej. XAXX010101000). null si no existe. */
export async function clientePorRfc(
  cfg: ConfigContaDigital,
  token: string,
  idEmpresa: number,
  rfc: string,
): Promise<any | null> {
  try {
    const res = await pedir(cfg.base, `/clientes.json/${idEmpresa}/${rfc}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    })
    return desenvolver(res)
  } catch (e) {
    if (e instanceof ContaDigitalError) return null
    throw e
  }
}

/** Timbra (o guarda) la factura. Devuelve la respuesta cruda CfdiNuevoRes. */
export async function timbrar(
  cfg: ConfigContaDigital,
  token: string,
  factura: Record<string, unknown>,
): Promise<{ Codigo: number; Mensaje: string; PdfLink?: string; XmlLink?: string; Resultado?: any }> {
  const res = await pedir(cfg.base, '/cfdi.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(factura),
  })
  return res as any
}

// --- Elegir del catálogo por descripción/clave --------------------------------

type Cat1 = { Id: number; Descripcion: string }
type Cat2 = { Clave: string; Descripcion: string }

export function porDescripcion(lista: Cat1[] | undefined, incluye: string): Cat1 | null {
  if (!lista) return null
  const q = incluye.toLowerCase()
  return lista.find((c) => (c.Descripcion ?? '').toLowerCase().includes(q)) ?? null
}

export function porClave(lista: Cat2[] | undefined, clave: string): Cat2 | null {
  if (!lista) return null
  return lista.find((c) => (c.Clave ?? '') === clave) ?? null
}
