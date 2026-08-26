import type { Cliente } from '@shake/types'
import type { ShakeClient } from '../client'

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que ordenes.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface ClienteInput {
  nombre: string
  telefono?: string | null
  email?: string | null
  notas?: string | null
}

export async function listarClientes(sb: ShakeClient): Promise<Cliente[]> {
  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data
}

export async function buscarClientes(sb: ShakeClient, texto: string): Promise<Cliente[]> {
  const q = texto.trim()
  if (!q) return listarClientes(sb)
  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`)
    .order('nombre')
    .limit(20)
  if (error) throw error
  return data
}

/**
 * Alta de cliente. Va por RPC porque la tabla ya no acepta escritura directa:
 * el servidor es quien fija mancuernas en 0 y rechaza un teléfono repetido,
 * así que nadie puede darse de alta con saldo ni partir en dos la ficha de un
 * cliente que ya existía. Ver supabase/migrations/lealtad_cierre_escrituras.sql.
 */
export async function crearCliente(sb: ShakeClient, input: ClienteInput): Promise<Cliente> {
  return rpc<Cliente>(sb, 'fn_cliente_registrar', {
    p_nombre: input.nombre,
    p_telefono: input.telefono ?? null,
    p_email: input.email ?? null,
    p_notas: input.notas ?? null,
  })
}

/** Edita solo datos de contacto: el saldo de mancuernas no se toca desde aquí. */
export async function actualizarCliente(
  sb: ShakeClient,
  id: string,
  input: ClienteInput,
): Promise<Cliente> {
  return rpc<Cliente>(sb, 'fn_cliente_actualizar', {
    p_id: id,
    p_nombre: input.nombre,
    p_telefono: input.telefono ?? null,
    p_email: input.email ?? null,
    p_notas: input.notas ?? null,
  })
}

/** Baja lógica. */
export async function desactivarCliente(sb: ShakeClient, id: string): Promise<void> {
  await rpc<null>(sb, 'fn_cliente_desactivar', { p_id: id })
}

// ── Admin → Clientes ───────────────────────────────────────────────────────

export interface ClienteAdmin {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  codigo: string | null
  mancuernas: number
  alta: string
  con_google: boolean
  compras: number
  ultima_compra: string | null
  cupones_activos: number
}

export interface ExpedienteFavorito {
  producto: string
  veces: number
  ultima_vez: string
}

export interface ExpedienteCompra {
  folio: number
  fecha: string
  total: number
  items: Array<{ producto: string; cantidad: number; personalizacion: string | null }> | null
}

export interface ExpedienteCliente {
  favoritos: ExpedienteFavorito[]
  compras: ExpedienteCompra[]
}

/** Lista de clientes para Admin, con búsqueda y números de un vistazo. */
export async function clientesAdmin(
  sb: ShakeClient,
  busqueda?: string | null,
  limite = 100,
): Promise<ClienteAdmin[]> {
  return (
    (await rpc<ClienteAdmin[]>(sb, 'fn_clientes_admin', {
      p_busqueda: busqueda ?? null,
      p_limite: limite,
    })) ?? []
  )
}

/** Lo que siempre pide + últimas compras de UN cliente (para recomendar). */
export async function expedienteCliente(sb: ShakeClient, clienteId: string): Promise<ExpedienteCliente> {
  const e = await rpc<ExpedienteCliente | null>(sb, 'fn_expediente_cliente', {
    p_cliente_id: clienteId,
  })
  return { favoritos: e?.favoritos ?? [], compras: e?.compras ?? [] }
}
