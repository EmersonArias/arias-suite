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

type Assignment = {
  hotel_id?: string
  role_id?: string
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validLoginIdentifier(value: string) {
  return value.length >= 3 && value.length <= 64 && /^[A-Z0-9._-]+$/.test(value)
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

function invitationRedirectUrl(req: Request) {
  const configuredUrl = (Deno.env.get('ARIAS_APP_URL') ?? '').trim().replace(/\/$/, '')
  if (configuredUrl) return `${configuredUrl}/activate`

  const origin = (req.headers.get('origin') ?? '').trim().replace(/\/$/, '')
  return origin ? `${origin}/activate` : undefined
}

function internalAuthEmail() {
  const domain = new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname
  return `internal+${crypto.randomUUID()}@${domain}`
}

function temporaryPassword() {
  return `${crypto.randomUUID()}A9!`
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

  let payload: {
    full_name?: string
    email?: string
    login_identifier?: string
    assignments?: Assignment[]
  }

  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Datos de entrada no válidos.' }, 400)
  }

  const fullName = payload.full_name?.trim() ?? ''
  const email = payload.email?.trim().toLowerCase() ?? ''
  const loginIdentifier = payload.login_identifier?.trim().toUpperCase() ?? ''
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : []

  if (!fullName || !loginIdentifier) {
    return json({ error: 'Nombre e identificador de acceso son obligatorios.' }, 400)
  }

  if (!validLoginIdentifier(loginIdentifier)) {
    return json({ error: 'El identificador de acceso no es válido.' }, 400)
  }

  if (email && !validEmail(email)) {
    return json({ error: 'El correo electrónico no tiene un formato válido.' }, 400)
  }

  const { data: existingIdentifier, error: identifierError } = await admin
    .from('profiles')
    .select('id')
    .eq('login_identifier', loginIdentifier)
    .maybeSingle()

  if (identifierError) return json({ error: 'No se ha podido validar el identificador.' }, 500)
  if (existingIdentifier) return json({ error: 'Ese identificador de acceso ya está en uso.' }, 409)

  if (email) {
    const { data: existingEmail, error: emailError } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (emailError) return json({ error: 'No se ha podido validar el correo.' }, 500)
    if (existingEmail) return json({ error: 'Ese correo ya está asociado a una cuenta.' }, 409)
  }

  if (assignments.length === 0) {
    return json({ error: 'Debes asignar al menos un hotel y un rol.' }, 400)
  }

  const normalizedAssignments = assignments.map((assignment) => ({
    hotel_id: assignment.hotel_id?.trim() ?? '',
    role_id: assignment.role_id?.trim() ?? '',
  }))

  const hotelIds = normalizedAssignments.map((assignment) => assignment.hotel_id)
  const roleIds = normalizedAssignments.map((assignment) => assignment.role_id)

  if (
    hotelIds.some((id) => !id) ||
    roleIds.some((id) => !id) ||
    new Set(hotelIds).size !== hotelIds.length
  ) {
    return json({ error: 'Las asignaciones de hotel y rol no son válidas.' }, 400)
  }

  const [{ data: hotels, error: hotelsError }, { data: roles, error: rolesError }] =
    await Promise.all([
      admin.from('hotels').select('id, active').in('id', hotelIds),
      admin.from('roles').select('id, active').in('id', roleIds),
    ])

  if (hotelsError || rolesError) return json({ error: 'No se han podido validar las asignaciones.' }, 500)

  if ((hotels ?? []).length !== hotelIds.length) return json({ error: 'Uno de los hoteles no existe.' }, 400)
  if ((roles ?? []).length !== roleIds.length) return json({ error: 'Uno de los roles no existe.' }, 400)
  if ((hotels ?? []).some((hotel) => !hotel.active)) return json({ error: 'No se puede asignar un hotel inactivo.' }, 400)
  if ((roles ?? []).some((role) => !role.active)) return json({ error: 'No se puede asignar un rol inactivo.' }, 400)

  const noEmail = !email
  const activationCode = noEmail ? randomAccessCode() : null
  const activationHash = activationCode ? await hash(activationCode) : null
  const activationExpires = activationCode
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null

  let userId = ''
  let createdUser: { id: string } | null = null

  if (email) {
    const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        login_identifier: loginIdentifier,
        arias_real_email: email,
      },
      redirectTo: invitationRedirectUrl(req),
    })

    if (inviteError || !data.user) {
      return json({ error: inviteError?.message ?? 'No se ha podido crear la invitación.' }, 400)
    }

    createdUser = { id: data.user.id }
  } else {
    const { data, error: createError } = await admin.auth.admin.createUser({
      email: internalAuthEmail(),
      password: temporaryPassword(),
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        login_identifier: loginIdentifier,
      },
    })

    if (createError || !data.user) {
      return json({ error: createError?.message ?? 'No se ha podido crear la cuenta.' }, 400)
    }

    createdUser = { id: data.user.id }
  }

  userId = createdUser.id

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      full_name: fullName,
      email: email || null,
      login_identifier: loginIdentifier,
      active: true,
      account_status: 'PENDING_INVITATION',
      activation_code_hash: activationHash,
      activation_code_expires_at: activationExpires,
      activation_code_used_at: null,
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return json({ error: 'No se ha podido preparar el perfil del usuario.' }, 500)
  }

  const { error: assignmentError } = await admin
    .from('user_hotel_roles')
    .insert(
      normalizedAssignments.map((assignment) => ({
        user_id: userId,
        hotel_id: assignment.hotel_id,
        role_id: assignment.role_id,
        active: true,
      })),
    )

  if (assignmentError) {
    await admin.auth.admin.deleteUser(userId)
    return json({ error: 'No se han podido guardar los accesos del usuario.' }, 500)
  }

  return json({
    id: userId,
    email: email || null,
    full_name: fullName,
    login_identifier: loginIdentifier,
    account_status: 'PENDING_INVITATION',
    assignments: normalizedAssignments.length,
    activation_code: activationCode,
  }, 201)
})
