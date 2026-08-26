import { getSupabase } from '@shake/supabase'
// Cliente Supabase único de la app (anon key vía .env).
// El sitio público solo lee el menú: nunca escribe.
export const sb = getSupabase()
