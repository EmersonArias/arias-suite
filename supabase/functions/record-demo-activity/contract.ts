export const TRACKED_USER_ID = '6d755017-7348-41ea-aad7-d1b8334fff99'
export const activityKinds = ['PAGE_OPEN','PAGE_REFRESH','MODULE_OPEN','APP_RESUME','PDF_REQUEST','WRITE_BLOCKED'] as const
export type ActivityKind = typeof activityKinds[number]
export function validActivity(value: unknown): { client_event_id: string; event_type: ActivityKind; route: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !['client_event_id','event_type','route'].includes(key))) return null
  if (typeof input.client_event_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.client_event_id)) return null
  if (!activityKinds.includes(input.event_type as ActivityKind)) return null
  if (typeof input.route !== 'string' || input.route.length > 180 || !/^\/[a-z0-9/_-]*$/i.test(input.route)) return null
  if (['/login','/activate','/forgot-password','/update-password'].includes(input.route)) return null
  return { client_event_id: input.client_event_id, event_type: input.event_type as ActivityKind, route: input.route }
}
export async function boundedActivityBody(req: Request) {
  const reader = req.body?.getReader()
  if (!reader) return null
  let text = '', size = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > 2048) { await reader.cancel(); return null }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    return validActivity(JSON.parse(text))
  } catch { return null }
}
