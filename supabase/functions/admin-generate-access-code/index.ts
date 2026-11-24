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

function randomAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Configuración del servicio incompleta.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const authHeader = req.headers.get('Authorization') ?? ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'Sesión no válida.' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(accessToken)
  if (callerError || !caller.user) return json({ error: 'Sesión no válida.' }, 401)

  const { data: callerAdmin, error: callerAdminError } = await admin
    .from('platform_admins')
    .select('active')
    .eq('user_id', caller.user.id)
    .maybeSingle()

  if (callerAdminError || !callerAdmin?.active) return json({ error: 'No autorizado.' }, 403)

  let payload: { user_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Datos de entrada no válidos.' }, 400)
  }

  const userId = payload.user_id?.trim() ?? ''
  if (!userId) return json({ error: 'Usuario obligatorio.' }, 400)

  const [{ data: targetPlatformAdmin, error: targetPlatformError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
      admin
        .from('profiles')
        .select('id, full_name, email, active, account_status, login_identifier')
        .eq('id', userId)
        .maybeSingle(),
    ])

  if (targetPlatformError || profileError || !profile) {
    return json({ error: 'No se ha podido localizar el usuario.' }, 404)
  }

  if (targetPlatformAdmin) {
    return json({ error: 'Esta cuenta no puede modificarse desde Usuarios.' }, 403)
  }

  if (profile.email) {
    return json({
      error: 'Esta cuenta tiene correo electrónico. Utiliza Reenviar invitación o recuperación por email.',
    }, 400)
  }

  if (!profile.active) {
    return json({ error: 'El usuario está inactivo.' }, 400)
  }

  const activationCode = randomAccessCode()
  const activationHash = await hash(activationCode)

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      activation_code_hash: activationHash,
      activation_code_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      activation_code_used_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (updateError) return json({ error: 'No se ha podido generar el código de acceso.' }, 500)

  return json({
    id: userId,
    login_identifier: profile.login_identifier,
    full_name: profile.full_name,
    activation_code: activationCode,
    account_status: profile.account_status,
  })
})
