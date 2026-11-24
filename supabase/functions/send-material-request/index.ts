import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

function isValidEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? '').trim())
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('MATERIAL_REQUEST_FROM_EMAIL') ?? Deno.env.get('RESEND_FROM_EMAIL')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Configuración de Supabase incompleta en la función.' }, 500)
  if (!resendKey || !fromEmail) {
    return json({
      error: 'Falta configurar RESEND_API_KEY y MATERIAL_REQUEST_FROM_EMAIL en los secretos de Supabase Edge Functions.',
      code: 'EMAIL_SERVICE_NOT_CONFIGURED',
    }, 503)
  }

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sesión no válida. Inicia sesión de nuevo.' }, 401)

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userResult, error: authError } = await supabase.auth.getUser(token)
  if (authError || !userResult.user) return json({ error: 'No se pudo validar la sesión.' }, 401)

  // El usuario autenticado es el destino de las respuestas. Nunca se acepta esta
  // dirección desde el payload del navegador. Si la sesión usa un correo interno,
  // se recurre al correo de contacto del perfil propio protegido por RLS.
  let replyToEmail = (userResult.user.email ?? '').trim().toLowerCase()
  if (replyToEmail.startsWith('internal+') || !isValidEmail(replyToEmail)) replyToEmail = ''
  if (!replyToEmail) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userResult.user.id)
      .maybeSingle()
    const profileEmail = profile?.email?.trim().toLowerCase() ?? ''
    if (isValidEmail(profileEmail)) replyToEmail = profileEmail
  }
  if (!isValidEmail(replyToEmail)) {
    return json({ error: 'La cuenta activa no tiene un correo de contacto válido. Revisa el correo del perfil antes de enviar.' }, 422)
  }

  // Solo se usa el cliente administrativo en el servidor para registrar el resultado
  // de un envío después de que la autorización del usuario ya ha sido comprobada.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let payload: { request_id?: string; recipient_email?: string; pdf_base64?: string; pdf_filename?: string }
  try { payload = await request.json() } catch { return json({ error: 'El contenido enviado no es válido.' }, 400) }

  const requestId = payload.request_id?.trim() ?? ''
  const recipientEmail = payload.recipient_email?.trim().toLowerCase() ?? ''
  const pdfBase64 = payload.pdf_base64?.trim() ?? ''
  const pdfFilename = (payload.pdf_filename?.trim() || 'peticion-material.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')

  if (!requestId) return json({ error: 'Falta identificar la petición.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return json({ error: 'El destinatario no es un correo válido.' }, 400)
  if (!pdfBase64 || pdfBase64.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
    return json({ error: 'El PDF adjunto no es válido o supera el límite permitido.' }, 400)
  }

  const { data: materialRequest, error: requestError } = await supabase
    .from('maintenance_material_requests')
    .select('id, request_number, hotel_id, requester_name, department, cause, delivery_date, notes, status, email_status')
    .eq('id', requestId)
    .single()
  if (requestError || !materialRequest) return json({ error: 'No se encuentra la petición o no tienes permiso para consultarla.' }, 404)
  if (materialRequest.status !== 'CONFIRMED') return json({ error: 'Solo se pueden enviar peticiones confirmadas.' }, 409)
  if (materialRequest.email_status === 'SENT') return json({ error: 'Esta petición ya consta como enviada. No se volverá a enviar automáticamente.' }, 409)
  if (materialRequest.email_status === 'SENDING') return json({ error: 'Esta petición ya tiene un envío en curso.' }, 409)

  const { data: lines, error: linesError } = await supabase
    .from('maintenance_material_request_lines')
    .select('description, order_code, reference_code, provider_name, unit_of_measure, quantity, purchase_url, delivery_date')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
  if (linesError || !lines?.length) return json({ error: 'No se han podido cargar las líneas de la petición.' }, 400)

  // La función SQL comprueba maintenance.update y bloquea la fila para impedir
  // que dos peticiones concurrentes envíen el mismo documento.
  const { data: claimResult, error: claimError } = await supabase.rpc(
    'claim_maintenance_material_request_email_send',
    { target_request_id: requestId, target_recipient_email: recipientEmail },
  )
  if (claimError || !claimResult) {
    const message = claimError?.message ?? 'La petición ya se ha procesado o no tienes permiso para enviarla.'
    return json({ error: message }, claimError ? 403 : 409)
  }

  const lineHtml = lines.map((line) => {
    const link = line.purchase_url
      ? '<div style="font-size:12px"><a href="' + escapeHtml(line.purchase_url) + '">Enlace de compra</a></div>'
      : ''
    return '<tr><td style="border:1px solid #dbe1e7;padding:8px">' + escapeHtml(line.quantity) + ' ' + escapeHtml(line.unit_of_measure) +
      '</td><td style="border:1px solid #dbe1e7;padding:8px">' + escapeHtml(line.description) +
      '<div style="color:#64748b;font-size:12px">' + escapeHtml(line.order_code || line.reference_code || '') + '</div>' + link +
      '</td><td style="border:1px solid #dbe1e7;padding:8px">' + escapeHtml(line.delivery_date || '—') + '</td>' +
      '<td style="border:1px solid #dbe1e7;padding:8px">' + escapeHtml(line.provider_name || '—') + '</td></tr>'
  }).join('')

  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:760px;margin:0 auto">' +
    '<div style="font-size:14px;letter-spacing:3px;color:#64748b;font-weight:bold">SB HOTELS</div>' +
    '<h1 style="font-size:22px;margin:18px 0">Petición de material ' + escapeHtml(materialRequest.request_number) + '</h1>' +
    '<p>Se adjunta el formulario PDF confirmado en Arias Suite.</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
    '<tr><td style="padding:6px 0;color:#64748b">Solicitante</td><td style="padding:6px 0"><strong>' + escapeHtml(materialRequest.requester_name) + '</strong></td></tr>' +
    '<tr><td style="padding:6px 0;color:#64748b">Departamento</td><td style="padding:6px 0">' + escapeHtml(materialRequest.department) + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#64748b">Causa</td><td style="padding:6px 0">' + escapeHtml(materialRequest.cause) + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#64748b">Entrega prevista</td><td style="padding:6px 0">' + escapeHtml(materialRequest.delivery_date || 'Sin fecha indicada') + '</td></tr>' +
    '</table><table style="border-collapse:collapse;width:100%;margin-top:18px;font-size:13px">' +
    '<thead><tr style="background:#f1f5f9"><th style="border:1px solid #dbe1e7;padding:8px;text-align:left">Unidades</th><th style="border:1px solid #dbe1e7;padding:8px;text-align:left">Descripción</th><th style="border:1px solid #dbe1e7;padding:8px;text-align:left">Fecha entrega</th><th style="border:1px solid #dbe1e7;padding:8px;text-align:left">Proveedor</th></tr></thead>' +
    '<tbody>' + lineHtml + '</tbody></table>' +
    (materialRequest.notes ? '<p style="margin-top:18px"><strong>Observaciones:</strong> ' + escapeHtml(materialRequest.notes) + '</p>' : '') +
    '<p style="margin-top:24px;color:#64748b;font-size:11px">Mensaje generado por Arias Suite. El PDF adjunto corresponde a la petición confirmada ' + escapeHtml(materialRequest.request_number) + '.</p></div>'

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        reply_to: replyToEmail,
        subject: materialRequest.request_number + ' · Petición de material',
        html,
        attachments: [{ filename: pdfFilename, content: pdfBase64 }],
      }),
    })
    const emailPayload = await emailResponse.json().catch(() => ({})) as Record<string, unknown>
    if (!emailResponse.ok) {
      const message = String(emailPayload.message ?? emailPayload.error ?? ('Proveedor de correo respondió ' + emailResponse.status)).slice(0, 1000)
      await admin.from('maintenance_material_requests').update({
        email_status: 'FAILED', email_error: message, updated_at: new Date().toISOString(),
      }).eq('id', requestId)
      return json({ error: 'El proveedor de correo rechazó el envío: ' + message }, 502)
    }

    const { error: updateError } = await admin
      .from('maintenance_material_requests')
      .update({
        email_status: 'SENT',
        recipient_email: recipientEmail,
        email_sent_at: new Date().toISOString(),
        email_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (updateError) return json({ ok: true, warning: 'El correo se aceptó, pero no se pudo guardar el estado. Revisa el historial antes de volver a enviarlo.' })
    return json({ ok: true, recipient_email: recipientEmail, reply_to: replyToEmail, request_number: materialRequest.request_number })
  } catch (error) {
    const message = (error instanceof Error ? error.message : 'Error de red al enviar el correo.').slice(0, 1000)
    await admin.from('maintenance_material_requests').update({
      email_status: 'FAILED', email_error: message, updated_at: new Date().toISOString(),
    }).eq('id', requestId)
    return json({ error: 'No se pudo contactar con el servicio de correo: ' + message }, 502)
  }
})
