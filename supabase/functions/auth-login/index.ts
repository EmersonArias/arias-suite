import { accessAuditRow } from './accessAudit.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const genericError = 'No se ha podido iniciar sesión.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Configuración del servicio incompleta.' }, 500)
  }

  let payload: { identifier?: string; password?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: genericError }, 401)
  }

  const rawIdentifier = payload.identifier?.trim() ?? ''
  const password = payload.password ?? ''

  if (!rawIdentifier || !password) {
    return json({ error: genericError }, 401)
  }

  const identifier = rawIdentifier.toUpperCase()
  const emailIdentifier = rawIdentifier.toLowerCase()

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [identifierResult, emailResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, active, account_status, email, login_identifier')
      .eq('login_identifier', identifier)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id, active, account_status, email, login_identifier')
      .eq('email', emailIdentifier)
      .maybeSingle(),
  ])

  if (identifierResult.error || emailResult.error) {
    return json({ error: genericError }, 401)
  }

  const candidates = [identifierResult.data, emailResult.data]
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .filter(
      (profile, index, array) =>
        array.findIndex((item) => item.id === profile.id) === index,
    )

  if (candidates.length !== 1) {
    return json({ error: genericError }, 401)
  }

  const profile = candidates[0]

  if (!profile.active || profile.account_status !== 'ACTIVE') {
    return json({ error: genericError }, 401)
  }

  const { data: hasAccess, error: accessError } = await admin.rpc(
    'user_has_suite_access',
    { target_user_id: profile.id },
  )

  if (accessError || hasAccess !== true) {
    return json({ error: genericError }, 401)
  }

  const { data: targetAuth, error: targetAuthError } =
    await admin.auth.admin.getUserById(profile.id)

  if (targetAuthError || !targetAuth.user?.email) {
    return json({ error: genericError }, 401)
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: signInData, error: signInError } =
    await publicClient.auth.signInWithPassword({
      email: targetAuth.user.email,
      password,
    })

  if (
    signInError ||
    !signInData.session ||
    !signInData.user ||
    !signInData.user.email_confirmed_at
  ) {
    return json({ error: genericError }, 401)
  }

  // A telemetry failure must not lock a valid user out. Never log credentials or tokens.
  try {
    const row = accessAuditRow(req, profile.id, profile.login_identifier, signInData.session.access_token)
    const { error: auditError } = await admin.from('user_access_events').insert(row)
    if (auditError && auditError.code !== '23505') console.warn('access_audit_write_failed')
  } catch { console.warn('access_audit_write_failed') }

  return json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  })
})
