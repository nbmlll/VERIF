import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!url || !key) throw new Error('Supabase service credentials are missing')

export const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})
