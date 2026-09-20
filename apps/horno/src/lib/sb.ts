import { getSupabase } from '@shake/supabase'
// Cliente Supabase único de la app (anon key vía .env).
export const sb = getSupabase()
