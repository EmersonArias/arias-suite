// Never accepts identity, IP or user agent from the JSON body.
export function accessAuditRow(request: Request, userId: string, identifier: string, accessToken: string) {
  let sessionId: string | null = null
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof payload.session_id === 'string' && /^[a-f0-9-]{36}$/i.test(payload.session_id)) sessionId = payload.session_id
  } catch { /* Audit remains useful even if the token format changes. */ }
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  const ip = forwarded.length <= 45 && /^[0-9a-f:.]+$/i.test(forwarded) ? forwarded : null
  return {
    user_id: userId, session_id: sessionId, login_identifier: identifier.slice(0, 254),
    ip_address: ip, ip_source: ip ? 'forwarded_header' : 'unavailable',
    user_agent: request.headers.get('user-agent')?.slice(0, 512) || null,
  }
}
