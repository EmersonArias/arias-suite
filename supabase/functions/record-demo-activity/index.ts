import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { TRACKED_USER_ID, boundedActivityBody } from './contract.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) }
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sesión no válida.' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'Servicio no disponible.' }, 503)
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return json({ error: 'Sesión no válida.' }, 401)
    if (data.user.id !== TRACKED_USER_ID) return json({ error: 'Acceso no autorizado.' }, 403)
    const profile = await admin.from('profiles').select('active, account_status').eq('id', data.user.id).maybeSingle()
    if (profile.error || !profile.data?.active || profile.data.account_status !== 'ACTIVE') return json({ error: 'Acceso no autorizado.' }, 403)
    const access = await admin.rpc('user_has_suite_access', { target_user_id: data.user.id })
    if (access.error || access.data !== true) return json({ error: 'Acceso no autorizado.' }, 403)
    const entry = await boundedActivityBody(req)
    if (!entry) return json({ error: 'Evento no válido.' }, 400)
    const recent = await admin.from('demo_activity_events').select('id', { count: 'exact', head: true }).eq('user_id', data.user.id).gte('occurred_at', new Date(Date.now() - 60000).toISOString())
    if (recent.error) return json({ error: 'Registro temporalmente no disponible.' }, 503)
    if ((recent.count ?? 0) >= 120) return json({ error: 'Demasiados eventos.' }, 429)
    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const ip = forwarded.length <= 45 && /^[0-9a-f:.]+$/i.test(forwarded) ? forwarded : null
    const stored = await admin.from('demo_activity_events').insert({ ...entry, user_id: data.user.id, ip_address: ip, user_agent: req.headers.get('user-agent')?.slice(0,512) || null })
    if (stored.error && stored.error.code !== '23505') return json({ error: 'No se ha podido registrar el evento.' }, 503)
    return json({ recorded: true }, 202)
  } catch { return json({ error: 'Registro temporalmente no disponible.' }, 503) }
})
