export type DemoActivityKind = 'PAGE_OPEN' | 'PAGE_REFRESH' | 'MODULE_OPEN' | 'APP_RESUME' | 'PDF_REQUEST' | 'WRITE_BLOCKED'
export const demoActivityLabels: Record<DemoActivityKind, string> = {
  PAGE_OPEN: 'Aplicación abierta', PAGE_REFRESH: 'Pantalla recargada', MODULE_OPEN: 'Módulo abierto',
  APP_RESUME: 'Aplicación vuelve a primer plano', PDF_REQUEST: 'PDF solicitado', WRITE_BLOCKED: 'Intento de cambio bloqueado',
}
export function activityRouteAllowed(route: string) {
  return /^\/[a-z0-9/_-]*$/i.test(route) && route.length <= 180 && !['/login','/activate','/forgot-password','/update-password'].includes(route)
}
export function createActivityReporter(send: (event: { client_event_id: string; event_type: DemoActivityKind; route: string }) => Promise<unknown>, now = () => Date.now(), id = () => crypto.randomUUID()) {
  const last = new Map<string, number>()
  let previousRoute: string | null = null
  function report(event_type: DemoActivityKind, route: string) {
    if (!activityRouteAllowed(route)) return
    const key = event_type + ':' + route, time = now()
    if (time - (last.get(key) ?? -Infinity) < 1000) return
    if (last.size > 200) last.clear()
    last.set(key, time)
    void send({ client_event_id: id(), event_type, route }).catch(() => { /* Telemetry must never interrupt reading or PDF generation. */ })
  }
  return {
    report,
    reset() { previousRoute = null; last.clear() },
    routeOpened(route: string, reloaded: boolean) {
      if (!activityRouteAllowed(route) || previousRoute === route) return
      const kind = previousRoute === null ? reloaded ? 'PAGE_REFRESH' : 'PAGE_OPEN' : 'MODULE_OPEN'
      previousRoute = route
      report(kind, route)
    },
  }
}
