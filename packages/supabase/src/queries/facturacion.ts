import type { ClienteLily } from '../client'

// Facturación global diaria con ContaDigital. El timbrado vive en la Edge
// Function `contadigital-facturar` (ahí están los secretos); aquí solo se lee
// qué se factura y se dispara la función.

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

async function rpc<T>(sb: ClienteLily, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/** Una venta del día, como va a salir en la factura: folio = total. */
export interface VentaDelDia {
  folio: number
  total: number
  hora: string
  canal: string
}

/** Una factura global ya guardada (timbrada o con error). */
export interface FacturaGlobal {
  id: string
  fecha: string
  folio_original: string
  ambiente: string
  id_empresa: number | null
  uuid: string | null
  serie: string | null
  folio_cfdi: number | null
  estatus: 'pendiente' | 'timbrada' | 'error' | 'cancelada'
  num_folios: number
  subtotal: number
  iva: number
  total: number
  pdf_link: string | null
  xml_link: string | null
  mensaje: string | null
  created_at: string
}

/** Qué se factura ese día: las ventas pagadas, una por folio. */
export async function ventasDelDia(sb: ClienteLily, fecha: string): Promise<VentaDelDia[]> {
  return (await rpc<VentaDelDia[] | null>(sb, 'fn_facturacion_dia', { p_fecha: fecha })) ?? []
}

/** El historial de facturas globales en un rango de fechas. */
export async function facturasListar(sb: ClienteLily, desde: string, hasta: string): Promise<FacturaGlobal[]> {
  return (await rpc<FacturaGlobal[] | null>(sb, 'fn_facturas_listar', { p_desde: desde, p_hasta: hasta })) ?? []
}

export interface ResultadoTimbrado {
  ok: boolean
  yaExistia?: boolean
  factura?: FacturaGlobal
  error?: { codigo: string; mensaje: string }
  faltan?: string[]
  empresas_disponibles?: { RFC: string; Nombre: string; Creditos: number }[]
}

/**
 * Timbra la factura global del día. Devuelve el resultado tal cual lo da la
 * Edge Function: `ok` con la factura, o `error` con el código y el mensaje
 * (por ejemplo `empresa_no_alta` mientras el RFC no esté en ContaDigital).
 */
export async function timbrarGlobal(
  sb: ClienteLily,
  fecha: string,
  opts: { ambiente?: 'pro' | 'pruebas'; soloGuardar?: boolean } = {},
): Promise<ResultadoTimbrado> {
  return invocarFn<ResultadoTimbrado>(sb, 'contadigital-facturar', {
    fecha, ambiente: opts.ambiente, solo_guardar: opts.soloGuardar,
  })
}

/**
 * Invoca una Edge Function y desenvuelve su respuesta.
 *
 * Las funciones de ContaDigital contestan JSON con `ok:false` en los errores de
 * negocio (empresa no dada de alta, sin ventas, folio ya facturado…), pero
 * supabase-js los marca como error HTTP. Se rescata el cuerpo para enseñar el
 * mensaje de verdad en vez de un «falló la red».
 */
async function invocarFn<T>(sb: ClienteLily, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body })
  if (error) {
    const cuerpo = (error as { context?: { body?: unknown } }).context?.body
    if (cuerpo) {
      try { return (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo) as T } catch { /* cae abajo */ }
    }
    return { ok: false, error: { codigo: 'red', mensaje: (error as Error).message } } as unknown as T
  }
  return data as T
}

// ----------------------- Facturación NOMINATIVA ----------------------------
// Timbrar un FOLIO de venta a un cliente real (persona física o moral), aparte
// de la global. Vive en la Edge Function `contadigital-nominativa`.

/** Un cliente dado de alta en ContaDigital. */
export interface ClienteCD {
  id: number
  rfc: string
  razonSocial: string
  regimenFiscal: string | null
  usoCFDI: string | null
  cp: string | null
}

/** Lo que el servidor sabe de un folio para poder nominarlo. */
export interface FolioFacturable {
  folio: number
  total: number
  fecha: string
  canal: string
  ya_nominada: boolean
  dia_global_timbrado: boolean
}

/** Una factura nominativa guardada. */
export interface FacturaNominativa {
  id: string
  folio_venta: number
  rfc_receptor: string
  nombre_receptor: string | null
  ambiente: string
  uuid: string | null
  serie: string | null
  folio_cfdi: number | null
  uso_cfdi: string | null
  estatus: 'pendiente' | 'timbrada' | 'error' | 'cancelada'
  subtotal: number
  iva: number
  total: number
  pdf_link: string | null
  xml_link: string | null
  mensaje: string | null
  created_at: string
}

/** Los datos para dar de alta un cliente. */
export interface ClienteNuevo {
  rfc: string
  razonSocial: string
  regimenFiscal: string
  usoCFDI: string
  cp: string
  calle: string
  noExterior?: string
  colonia?: string
  municipio?: string
  estado?: string
  email?: string
}

export interface ResultadoClientes {
  ok: boolean
  clientes?: ClienteCD[]
  error?: { codigo: string; mensaje: string }
  faltan?: string[]
}

export interface ResultadoCliente {
  ok: boolean
  cliente?: { id: number; rfc: string; razonSocial: string }
  error?: { codigo: string; mensaje: string }
}

export interface ResultadoNominativa {
  ok: boolean
  factura?: FacturaNominativa
  error?: { codigo: string; mensaje: string }
  faltan?: string[]
}

/** Los clientes de ContaDigital (para elegir a quién facturar). */
export async function clientesContaDigital(sb: ClienteLily): Promise<ResultadoClientes> {
  return invocarFn<ResultadoClientes>(sb, 'contadigital-nominativa', { accion: 'clientes' })
}

/** Da de alta un cliente (persona física o moral) en ContaDigital. */
export async function agregarClienteContaDigital(sb: ClienteLily, cliente: ClienteNuevo): Promise<ResultadoCliente> {
  return invocarFn<ResultadoCliente>(sb, 'contadigital-nominativa', { accion: 'agregar_cliente', cliente })
}

/** Lo que el servidor sabe de un folio (total, si ya se nominó, si su día ya es global). */
export async function folioFacturable(sb: ClienteLily, folio: number): Promise<FolioFacturable | null> {
  const filas = await rpc<FolioFacturable[] | null>(sb, 'fn_folio_facturable', { p_folio: folio })
  return (filas && filas[0]) ?? null
}

/** Timbra un folio a un cliente (por su RFC). */
export async function timbrarFolio(
  sb: ClienteLily,
  args: { folio: number; rfc: string; uso?: string; ambiente?: 'pro' | 'pruebas' },
): Promise<ResultadoNominativa> {
  return invocarFn<ResultadoNominativa>(sb, 'contadigital-nominativa', {
    accion: 'timbrar_folio', folio: args.folio, rfc: args.rfc, uso: args.uso, ambiente: args.ambiente,
  })
}

/** El historial de facturas nominativas en un rango de fechas. */
export async function facturasNominativasListar(sb: ClienteLily, desde: string, hasta: string): Promise<FacturaNominativa[]> {
  return (await rpc<FacturaNominativa[] | null>(sb, 'fn_facturas_nominativas_listar', { p_desde: desde, p_hasta: hasta })) ?? []
}
