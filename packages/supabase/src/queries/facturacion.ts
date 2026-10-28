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
  const { data, error } = await sb.functions.invoke('contadigital-facturar', {
    body: { fecha, ambiente: opts.ambiente, solo_guardar: opts.soloGuardar },
  })
  // La función contesta JSON con `ok:false` en los errores de negocio
  // (empresa no dada de alta, sin ventas…); supabase-js los marca como error
  // HTTP, así que se rescata el cuerpo para enseñar el mensaje de verdad.
  if (error) {
    const cuerpo = (error as { context?: { body?: unknown } }).context?.body
    if (cuerpo) {
      try { return typeof cuerpo === 'string' ? JSON.parse(cuerpo) : (cuerpo as ResultadoTimbrado) } catch { /* cae abajo */ }
    }
    return { ok: false, error: { codigo: 'red', mensaje: (error as Error).message } }
  }
  return data as ResultadoTimbrado
}
