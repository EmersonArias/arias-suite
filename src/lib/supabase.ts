import { createClient } from '@supabase/supabase-js'
import { createDemoReadOnlyFetch } from '../core/access/demoReadOnly'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
let currentUserId: string | null = null

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    global: { fetch: createDemoReadOnlyFetch(supabaseUrl, globalThis.fetch.bind(globalThis), () => currentUserId) },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  },
)

supabase.auth.onAuthStateChange((_event, session) => { currentUserId = session?.user.id ?? null })
