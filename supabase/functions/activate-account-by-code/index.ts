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

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function genericError() {
  return 'No se ha podido validar el código de acceso.'
}

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

  let payload: {
    login_identifier?: string
    activation_code?: string
    password?: string
  }

  try {
    payload = await req.json()
  } catch {
    return json({ error: genericError() }, 401)
  }

  const loginIdentifier = payload.login_identifier?.trim().toUpperCase() ?? ''
  const activationCode = payload.activation_code?.trim().toUpperCase() ?? ''
  const password = payload.password ?? ''

  if (
    !loginIdentifier ||
    !activationCode ||
    password.length < 10
  ) {
    return json({ error: genericError() }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select(
      'id, active, account_status, email, login_identifier, activation_code_hash, activation_code_expires_at',
    )
    .eq('login_identifier', loginIdentifier)
    .maybeSingle()

  if (profileError || !profile) {
    return json({ error: genericError() }, 401)
  }

  if (
    !profile.active ||
    !['PENDING_INVITATION', 'ACTIVE'].includes(profile.account_status) ||
    !profile.activation_code_hash ||
    !profile.activation_code_expires_at
  ) {
    return json({ error: genericError() }, 401)
  }

  if (new Date(profile.activation_code_expires_at).getTime() <= Date.now()) {
    return json({ error: 'El código de acceso ha caducado. Solicita uno nuevo al administrador.' }, 401)
  }

  const suppliedHash = await sha256(activationCode)
  if (suppliedHash !== profile.activation_code_hash) {
    return json({ error: genericError() }, 401)
  }

  const { data: targetAuth, error: targetAuthError } =
    await admin.auth.admin.getUserById(profile.id)

  if (targetAuthError || !targetAuth.user?.email) {
    return json({ error: genericError() }, 401)
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    profile.id,
    { password },
  )

  if (passwordError) {
    return json({ error: passwordError.message }, 400)
  }

  const nextStatus =
    profile.account_status === 'PENDING_INVITATION'
      ? 'ACTIVE'
      : profile.account_status

  const { error: profileUpdateError } = await admin
    .from('profiles')
    .update({
      account_status: nextStatus,
      activation_code_hash: null,
      activation_code_expires_at: null,
      activation_code_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)

  if (profileUpdateError) {
    return json({ error: 'La contraseña se ha actualizado, pero no se ha podido completar la activación.' }, 500)
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
    !signInData.session
  ) {
    return json({ error: 'La cuenta se ha actualizado. Vuelve al login para entrar.' }, 500)
  }

  return json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  })
})
