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

function invitationRedirectUrl(req: Request) {
  const configuredUrl = (Deno.env.get('ARIAS_APP_URL') ?? '').trim().replace(/\/$/, '')
  if (configuredUrl) return `${configuredUrl}/activate`

  const origin = (req.headers.get('origin') ?? '').trim().replace(/\/$/, '')
  return origin ? `${origin}/activate` : undefined
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Configuración del servicio incompleta.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const authHeader = req.headers.get('Authorization') ?? ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'Sesión no válida.' }, 401)

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
  if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401)

  const { data: platformAdmin, error: platformError } = await admin
    .from('platform_admins')
    .select('active')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (platformError) return json({ error: 'No se ha podido verificar el acceso.' }, 500)
  if (!platformAdmin?.active) return json({ error: 'No autorizado.' }, 403)

  let payload: { user_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Datos de entrada no válidos.' }, 400)
  }

  const userId = payload.user_id?.trim() ?? ''
  if (!userId) return json({ error: 'Usuario obligatorio.' }, 400)

  const [{ data: targetPlatformAdmin, error: targetPlatformError }, { data: profile, error: profileError }, { data: targetAuth, error: targetAuthError }] =
    await Promise.all([
      admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
      admin.from('profiles').select('full_name, email, login_identifier, active, account_status').eq('id', userId).maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ])

  if (targetPlatformError || profileError || targetAuthError || !profile || !targetAuth.user) {
    return json({ error: 'No se ha podido localizar el usuario.' }, 404)
  }

  if (targetPlatformAdmin) {
    return json({ error: 'Esta cuenta no puede modificarse desde Usuarios.' }, 403)
  }

  if (!profile.active || profile.account_status !== 'PENDING_INVITATION') {
    return json({ error: 'Solo se pueden reenviar invitaciones pendientes de activación.' }, 400)
  }

  const email = (profile.email ?? targetAuth.user.email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'El usuario no tiene un correo válido.' }, 400)

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: profile.full_name ?? targetAuth.user.user_metadata?.full_name ?? '',
      login_identifier: profile.login_identifier,
      arias_real_email: email,
    },
    redirectTo: invitationRedirectUrl(req),
  })

  if (inviteError) return json({ error: inviteError.message }, 400)

  return json({
    id: userId,
    email,
    account_status: 'PENDING_INVITATION',
  })
})
