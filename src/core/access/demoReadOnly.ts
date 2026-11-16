// Stable account ID: changing the visible login identifier cannot remove the restriction.
export const DEMO_USER_ID = '6d755017-7348-41ea-aad7-d1b8334fff99'
export const DEMO_READ_ONLY_MESSAGE = 'Usuario de prueba: acceso de solo lectura. Consulte con el administrador.'
export const DEMO_READ_ONLY_EVENT = 'arias:demo-read-only'
export const isDemoUser = (userId?: string | null) => userId === DEMO_USER_ID

export function notifyDemoReadOnly() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEMO_READ_ONLY_EVENT))
}

export function assertDemoWriteAllowed(userId?: string | null) {
  if (!isDemoUser(userId)) return
  notifyDemoReadOnly()
  throw new Error(DEMO_READ_ONLY_MESSAGE)
}

const readRpcs = new Set([
  'has_suite_access', 'user_has_suite_access', 'has_hotel_access', 'has_hotel_permission',
  'get_active_hotel', 'get_maintenance_alert_recipients',
])

function tokenUser(headers: Headers): string | null {
  const token = headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(body)).sub ?? null
  } catch { return null }
}

export function demoRequestBlocked(url: URL, method: string) {
  const path = url.pathname
  const rpc = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1]
  if (rpc) return !readRpcs.has(rpc)
  if (path.startsWith('/auth/v1/')) {
    // Session establishment, renewal and logout remain available; profile/password edits do not.
    return !['/auth/v1/token', '/auth/v1/logout', '/auth/v1/user'].includes(path)
      || (path === '/auth/v1/user' && method !== 'GET')
  }
  if (path === '/functions/v1/auth-login') return false
  return !['GET', 'HEAD', 'OPTIONS'].includes(method)
}

export function createDemoReadOnlyFetch(backendUrl: string, fetcher: typeof fetch, currentUser: () => string | null): typeof fetch {
  const backendOrigin = new URL(backendUrl).origin
  return async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input))
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers ?? request?.headers)
    if (url.origin === backendOrigin && (isDemoUser(currentUser()) || isDemoUser(tokenUser(headers))) && demoRequestBlocked(url, method)) {
      notifyDemoReadOnly()
      return new Response(JSON.stringify({ code: 'DEMO_READ_ONLY', message: DEMO_READ_ONLY_MESSAGE, error: DEMO_READ_ONLY_MESSAGE }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }
    return fetcher(input, init)
  }
}

export function isDemoMutationLabel(label: string) {
  const text = label.trim().toLocaleLowerCase('es')
  if (/pdf|imprimir|exportar|descargar/.test(text)) return false
  return /^(guardar|crear|finalizar|rectificar|eliminar|borrar|suprimir|enviar|asignar|rechazar|activar|desactivar|confirmar|aceptar|cambiar estado|marcar|iniciar trabajo|generar (?!pdf))\b/.test(text)
}
