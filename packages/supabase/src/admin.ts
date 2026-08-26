import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@shake/types'

/**
 * Cliente server-side con service_role. SOLO para scripts (ETL) y
 * funciones server-side. Importar desde '@shake/supabase/admin'.
 * PROHIBIDO usarlo en cualquier app de apps/ (frontend).
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
