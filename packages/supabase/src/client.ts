import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@shake/types'

export type ShakeClient = SupabaseClient<Database>

let cliente: ShakeClient | null = null

/**
 * El proyecto sirve el MISMO backend en su dominio propio
 * (Custom Domain de Supabase, add-on de pago). Usarlo importa por una razón
 * visible: la pantalla de "Entrar con Google" le muestra al cliente
 * "continuar a api.hojaldraslily.com" en vez del id del proyecto.
 *
 * La traducción vive aquí —y no en los .env de cada app— porque las
 * variables reales están en Cloudflare Pages y este es el único punto
 * común a todas las apps. La URL original sigue funcionando en paralelo
 * (el agente de impresión la usa tal cual); si el dominio propio se
 * apagara algún día, basta con vaciar este mapa.
 */
const DOMINIO_PROPIO: Record<string, string> = {
  // Hojaldras Lily aún no contrata el Custom Domain de Supabase. Cuando
  // exista api.hojaldraslily.com (add-on + DNS), descomentar esta línea:
  // 'fzkdgqqvfkogmxdgqsxj.supabase.co': 'api.hojaldraslily.com',
}

function conDominioPropio(url: string): string {
  try {
    const u = new URL(url)
    const propio = DOMINIO_PROPIO[u.host]
    if (!propio) return url
    u.host = propio
    return u.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

/**
 * Cliente Supabase para frontend (anon key). Singleton por app.
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el .env de la app.
 */
export function getSupabase(): ShakeClient {
  if (cliente) return cliente
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env de la app.',
    )
  }
  cliente = createClient<Database>(conDominioPropio(url), anonKey)
  return cliente
}
