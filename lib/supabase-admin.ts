import { createClient } from '@supabase/supabase-js'

// Cliente Supabase com permissões de admin (service role)
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
