export type AccessLogEntry = {
  event_id: string; user_id: string | null; login_identifier: string; full_name: string | null
  occurred_at: string; renewed_at: string | null; event_kind: 'LOGIN' | 'SESSION' | 'LAST_SIGN_IN'
  ip_address: string | null; ip_source: 'forwarded_header' | 'auth_server' | 'auth_session' | 'unavailable'
  user_agent: string | null
}
export function accessDevice(agent: string | null) {
  if (!agent) return 'No disponible'
  if (/SupabaseEdgeRuntime|^Deno\//i.test(agent)) return 'Servidor de autenticación'
  const os = /Android/i.test(agent) ? 'Android' : /iPhone|iPad/i.test(agent) ? 'iOS / iPadOS' : /Windows/i.test(agent) ? 'Windows' : /Macintosh|Mac OS/i.test(agent) ? 'macOS' : /Linux/i.test(agent) ? 'Linux' : 'Sistema sin identificar'
  const browser = /Edg\//i.test(agent) ? 'Edge' : /OPR\//i.test(agent) ? 'Opera' : /Firefox|FxiOS/i.test(agent) ? 'Firefox' : /Chrome|CriOS/i.test(agent) ? 'Chrome' : /Safari/i.test(agent) ? 'Safari' : 'Navegador sin identificar'
  return `${os} · ${browser}`
}
export function madridDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = (type: string) => parts.find(p => p.type === type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}
export function madridMidnight(day: string, nextDay = false) {
  const base = Date.parse(day + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(base) || new Date(base).toISOString().slice(0,10) !== day) throw new Error('Revisa las fechas del filtro.')
  const target = base + (nextDay ? 86400000 : 0)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(target)))
  return new Date(target - hour * 3600000).toISOString()
}
export function accessDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—'
}
