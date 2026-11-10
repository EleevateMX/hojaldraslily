import type { ClienteLily } from '../client'

// La terminal bancaria (Banorte por DLL) y su agente de la PC, desde Admin.
// El token es la identidad del agente ante la cola de cobros; viaja UNA vez al
// crearlo o rotarlo, nunca se lista.

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ClienteLily, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/** Una terminal registrada, como la ve Admin (sin el token). */
export interface TerminalRegistrada {
  id: string
  sucursal_id: string
  nombre: string
  activa: boolean
  /** PRD cobra de verdad; AUT/DEC/RND simulan. Lo reporta el agente en su latido. */
  modo: string | null
  agente_version: string | null
  ultima_conexion: string | null
  /** Latió hace menos de 90 s. */
  conectada: boolean
}

/** Las terminales dadas de alta. */
export async function listarTerminales(sb: ClienteLily): Promise<TerminalRegistrada[]> {
  return (await rpc<TerminalRegistrada[] | null>(sb, 'fn_terminales_listar', {})) ?? []
}

/**
 * Registra (o re-registra) la terminal de una sucursal y devuelve su token UNA
 * vez — se copia al `.env` del agente de la PC (`TERMINAL_TOKEN`).
 */
export async function registrarTerminal(
  sb: ClienteLily,
  sucursalId: string,
  nombre = 'Banorte',
): Promise<{ id: string; agente_token: string }> {
  const filas = await rpc<{ id: string; agente_token: string }[]>(sb, 'fn_terminal_registrar', {
    p_sucursal_id: sucursalId,
    p_nombre: nombre,
  })
  return filas[0]
}

/** Rota el token (se perdió el .env o hay sospecha). Devuelve el nuevo token UNA vez. */
export async function rotarTokenTerminal(sb: ClienteLily, id: string): Promise<string> {
  return rpc<string>(sb, 'fn_terminal_rotar_token', { p_id: id })
}

/** Enciende/apaga la terminal sin perder su token. */
export async function activarTerminal(sb: ClienteLily, id: string, activa: boolean): Promise<void> {
  await rpc(sb, 'fn_terminal_activar', { p_id: id, p_activa: activa })
}

/** Una operación reciente de la terminal (cobro o verificación), para elegir el
 *  número de control a verificar en la matriz de certificación. */
export interface OperacionTerminal {
  cobro_id: string
  operacion: 'cobro' | 'verificacion' | 'cancelacion'
  estado: string
  monto: number
  control_number: string
  folio: number | null
  autorizacion: string | null
  created_at: string
}

/** Los últimos cobros/operaciones de la terminal (para la «Verificación Banorte»). */
export async function cobrosRecientesTerminal(sb: ClienteLily, limite = 10): Promise<OperacionTerminal[]> {
  return (await rpc<OperacionTerminal[] | null>(sb, 'fn_terminal_cobros_recientes', { p_limite: limite })) ?? []
}
