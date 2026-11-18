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

  let payload: {
    user_id?: string
    full_name?: string
    email?: string
    login_identifier?: string
    active?: boolean
    assignments?: Assignment[]
  }

  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Datos de entrada no válidos.' }, 400)
  }

  const userId = payload.user_id?.trim() ?? ''
  const fullName = payload.full_name?.trim() ?? ''
  const requestedEmail = payload.email?.trim().toLowerCase() ?? ''
  const loginIdentifier = payload.login_identifier?.trim().toUpperCase() ?? ''
  const active = payload.active !== false
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : []

  if (!userId || !fullName || !loginIdentifier) {
    return json({ error: 'Usuario, nombre e identificador de acceso son obligatorios.' }, 400)
  }

  if (!/^[A-Z0-9._-]{3,64}$/.test(loginIdentifier)) {
    return json({ error: 'El identificador de acceso no es válido.' }, 400)
  }

  const [
    { data: targetPlatformAdmin, error: targetPlatformError },
    { data: targetAuthUser, error: targetAuthError },
    { data: targetProfile, error: targetProfileError },
    { data: previousAssignments, error: previousAssignmentsError },
  ] = await Promise.all([
    admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
    admin
      .from('profiles')
      .select('full_name, email, login_identifier, active, account_status')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('user_hotel_roles')
      .select('hotel_id, role_id, active')
      .eq('user_id', userId),
  ])

  if (
    targetPlatformError ||
    targetAuthError ||
    targetProfileError ||
    previousAssignmentsError ||
    !targetAuthUser.user ||
    !targetProfile
  ) {
    return json({ error: 'No se ha podido localizar el usuario.' }, 404)
  }

  if (targetPlatformAdmin) {
    return json({ error: 'Esta cuenta no puede modificarse desde Usuarios.' }, 403)
  }

  const currentEmail = (targetProfile.email ?? '').trim().toLowerCase()

  if (loginIdentifier !== targetProfile.login_identifier) {
    const { data: existingIdentifier, error: identifierError } = await admin
      .from('profiles')
      .select('id')
      .eq('login_identifier', loginIdentifier)
      .neq('id', userId)
      .maybeSingle()

    if (identifierError) {
      return json({ error: 'No se ha podido validar el identificador.' }, 500)
    }

    if (existingIdentifier) {
      return json({ error: 'Ese identificador de acceso ya está en uso.' }, 409)
    }
  }
  if (requestedEmail && requestedEmail !== currentEmail) {
    return json({
      error: 'El correo identifica la cuenta y no puede modificarse desde esta pantalla.',
    }, 400)
  }

  const normalizedAssignments = assignments.map((assignment) => ({
    hotel_id: assignment.hotel_id?.trim() ?? '',
    role_id: assignment.role_id?.trim() ?? '',
  }))

  const hotelIds = normalizedAssignments.map((assignment) => assignment.hotel_id)
  const roleIds = normalizedAssignments.map((assignment) => assignment.role_id)

  if (
    hotelIds.length !== normalizedAssignments.length ||
    roleIds.length !== normalizedAssignments.length ||
    hotelIds.some((id) => !id) ||
    roleIds.some((id) => !id) ||
    new Set(hotelIds).size !== hotelIds.length
  ) {
    return json({ error: 'Las asignaciones de hotel y rol no son válidas.' }, 400)
  }

  if (normalizedAssignments.length > 0) {
    const [{ data: hotels, error: hotelsError }, { data: roles, error: rolesError }] =
      await Promise.all([
        admin.from('hotels').select('id, active').in('id', hotelIds),
        admin.from('roles').select('id, active').in('id', roleIds),
      ])

    if (hotelsError || rolesError) {
      return json({ error: 'No se han podido validar las asignaciones.' }, 500)
    }

    if ((hotels ?? []).length !== hotelIds.length) {
      return json({ error: 'Uno de los hoteles no existe.' }, 400)
    }

    if ((roles ?? []).length !== roleIds.length) {
      return json({ error: 'Uno de los roles no existe.' }, 400)
    }

    if ((hotels ?? []).some((hotel) => !hotel.active)) {
      return json({ error: 'No se puede asignar un hotel inactivo.' }, 400)
    }

    if ((roles ?? []).some((role) => !role.active)) {
      return json({ error: 'No se puede asignar un rol inactivo.' }, 400)
    }
  }

  const previousProfile = {
    full_name: targetProfile.full_name,
    email: targetProfile.email,
    active: targetProfile.active,
    account_status: targetProfile.account_status,
    login_identifier: targetProfile.login_identifier,
  }

  const nextAccountStatus = active
    ? targetProfile.account_status === 'PENDING_INVITATION' ||
      !targetAuthUser.user.email_confirmed_at
      ? 'PENDING_INVITATION'
      : 'ACTIVE'
    : 'INACTIVE'

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...targetAuthUser.user.user_metadata,
      full_name: fullName,
      login_identifier: loginIdentifier,
    },
  })

  if (authUpdateError) return json({ error: authUpdateError.message }, 400)

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      login_identifier: loginIdentifier,
      active,
      account_status: nextAccountStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (profileError) {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...targetAuthUser.user.user_metadata },
    })
    return json({ error: 'No se ha podido actualizar el perfil.' }, 500)
  }

  const { error: deleteAssignmentsError } = await admin
    .from('user_hotel_roles')
    .delete()
    .eq('user_id', userId)

  if (deleteAssignmentsError) {
    await admin
      .from('profiles')
      .update(previousProfile)
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...targetAuthUser.user.user_metadata },
    })
    await admin.from('user_hotel_roles').insert(
      (previousAssignments ?? []).map((assignment) => ({
        user_id: userId,
        hotel_id: assignment.hotel_id,
        role_id: assignment.role_id,
        active: assignment.active,
      })),
    )
    return json({ error: 'No se han podido actualizar los accesos del usuario.' }, 500)
  }

  if (normalizedAssignments.length > 0) {
    const { error: insertAssignmentsError } = await admin
      .from('user_hotel_roles')
      .insert(
        normalizedAssignments.map((assignment) => ({
          user_id: userId,
          hotel_id: assignment.hotel_id,
          role_id: assignment.role_id,
          active,
        })),
      )

    if (insertAssignmentsError) {
      await admin.from('profiles').update(previousProfile)
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...targetAuthUser.user.user_metadata },
      })
      if ((previousAssignments ?? []).length > 0) {
        await admin.from('user_hotel_roles').insert(
          (previousAssignments ?? []).map((assignment) => ({
            user_id: userId,
            hotel_id: assignment.hotel_id,
            role_id: assignment.role_id,
            active: assignment.active,
          })),
        )
      }
      return json({ error: 'No se han podido guardar los nuevos accesos del usuario.' }, 500)
    }
  }

  return json({
    id: userId,
    email: currentEmail || null,
    full_name: fullName,
    login_identifier: loginIdentifier,
    active,
    account_status: nextAccountStatus,
    assignments: normalizedAssignments.length,
  })
})
