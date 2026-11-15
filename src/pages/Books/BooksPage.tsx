import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CircleHelp,
  CalendarClock,
  Clock3,
  Maximize2,
  X,
  Minimize2,
  Search,
  Settings,
  UserRound,
} from 'lucide-react'
import BrandLogo from '../../shared/components/branding/BrandLogo'
import { useAuth } from '../../features/auth/context/AuthProvider'
import { ariasAuth } from '../../core/auth/authService'
import { supabase } from '../../lib/supabase'
import { useHotelScope } from '../../shared/context/HotelScopeContext'

type HomeRegister = {
  iconIndex: number | null
  name: string
  path: string | null
  comingSoon?: boolean
  metric?: string
}

type MaintenanceAlert = {
  id: string
  maintenance_plan_id: string
  alert_type: 'UPCOMING_REVIEW' | 'DUE_TODAY' | 'OVERDUE_REVIEW' | 'OUT_OF_RANGE'
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  title: string
  message: string
  due_date: string | null
  triggered_at: string
  apparatus_registry_id: string | null
  apparatus_code: string | null
  apparatus_name: string | null
}

function alertStatusView(alert: MaintenanceAlert) {
  if (alert.alert_type === 'OUT_OF_RANGE') {
    return { label: 'Fuera de rango', className: 'bg-rose-100 text-rose-700' }
  }

  if (!alert.due_date) {
    return { label: 'Sin fecha', className: 'bg-slate-100 text-slate-600' }
  }

  const today = new Date()
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const due = new Date(alert.due_date + 'T12:00:00')
  const diffDays = Math.round((due.getTime() - localToday.getTime()) / 86400000)

  if (diffDays < 0) {
    return {
      label: `Vencido · ${Math.abs(diffDays)} d`,
      className: 'bg-rose-100 text-rose-700',
    }
  }

  if (diffDays === 0) {
    return { label: 'Vence hoy', className: 'bg-amber-100 text-amber-700' }
  }

  if (diffDays <= 3) {
    return {
      label: `Vence en ${diffDays} d`,
      className: 'bg-orange-100 text-orange-700',
    }
  }

  if (diffDays <= 7) {
    return {
      label: `Próximo · ${diffDays} d`,
      className: 'bg-sky-100 text-sky-700',
    }
  }

  return {
    label: `Programado · ${diffDays} d`,
    className: 'bg-emerald-100 text-emerald-700',
  }
}

const registers: HomeRegister[] = [
  { iconIndex: 0, name: 'Mantenimiento', path: '/maintenance' },
  { iconIndex: 1, name: 'Pendientes', path: '/maintenance/pending' },
  { iconIndex: 2, name: 'Materiales y stock', path: '/materials' },
  { iconIndex: 3, name: 'Planificador horario', path: '/planificador-horario' },
  { iconIndex: 4, name: 'Proveedores', path: '/providers' },
  { iconIndex: null, name: 'Registro de jornada', path: '/registro-jornada' },
]

export default function BooksPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { hotel, hotels, isPlatformAdmin, setHotel } = useHotelScope()
  const [search, setSearch] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<MaintenanceAlert[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadPendingCount() {
      if (!hotel?.id) {
        if (mounted) setPendingCount(null)
        return
      }

      const result = await supabase
        .from('maintenance_pending_items')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotel.id)
        .eq('active', true)
        .eq('status', 'PENDING')

      if (mounted) setPendingCount(result.error ? null : result.count ?? 0)
    }

    void loadPendingCount()
    return () => {
      mounted = false
    }
  }, [hotel?.id])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === document.documentElement)
    }

    handleFullscreenChange()
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen can be denied by the browser or platform policy.
    }
  }



  async function loadMaintenanceAlerts(hotelId: string) {
    await supabase.rpc('refresh_maintenance_due_alerts', {
      target_hotel_id: hotelId,
    })

    const result = await supabase
      .from('maintenance_alerts')
      .select('id, maintenance_plan_id, alert_type, severity, title, message, due_date, triggered_at')
      .eq('hotel_id', hotelId)
      .is('resolved_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('triggered_at', { ascending: false })

    if (result.error) return []

    const rawAlerts = (result.data ?? []) as Array<Omit<MaintenanceAlert, 'apparatus_registry_id' | 'apparatus_code' | 'apparatus_name'>>
    const planIds = [...new Set(rawAlerts.map((item) => item.maintenance_plan_id).filter(Boolean))]
    if (!planIds.length) return rawAlerts.map((item) => ({ ...item, apparatus_registry_id: null, apparatus_code: null, apparatus_name: null }))

    const plansQuery = await supabase
      .from('maintenance_plans')
      .select('id, apparatus_registry_id')
      .in('id', planIds)

    const plans = (plansQuery.data ?? []) as Array<{ id: string; apparatus_registry_id: string | null }>
    const apparatusIds = [...new Set(plans.map((item) => item.apparatus_registry_id).filter(Boolean))] as string[]

    const apparatusQuery = apparatusIds.length
      ? await supabase
          .from('apparatus_registry')
          .select('id, code, name')
          .in('id', apparatusIds)
      : { data: [], error: null }

    const apparatus = (apparatusQuery.data ?? []) as Array<{ id: string; code: string | null; name: string | null }>
    const planMap = new Map(plans.map((item) => [item.id, item]))
    const apparatusMap = new Map(apparatus.map((item) => [item.id, item]))

    return rawAlerts.map((alert) => {
      const plan = planMap.get(alert.maintenance_plan_id)
      const asset = plan?.apparatus_registry_id ? apparatusMap.get(plan.apparatus_registry_id) : undefined
      return {
        ...alert,
        apparatus_registry_id: asset?.id ?? null,
        apparatus_code: asset?.code ?? null,
        apparatus_name: asset?.name ?? null,
      }
    })
  }

  useEffect(() => {
    let mounted = true

    async function loadNotifications() {
      if (!session?.user.id) {
        if (mounted) setMaintenanceAlerts([])
        return
      }

      setNotificationsLoading(true)

      if (!hotel?.id) {
        if (mounted) {
          setMaintenanceAlerts([])
          setNotificationsLoading(false)
        }
        return
      }

      const alerts = await loadMaintenanceAlerts(hotel.id)

      if (!mounted) return

      setMaintenanceAlerts(alerts)
      setNotificationsLoading(false)
    }

    void loadNotifications()

    return () => {
      mounted = false
    }
  }, [session?.user.id, hotel?.id])

  async function refreshNotifications() {
    if (!session?.user.id) return

    setNotificationsLoading(true)

    if (!hotel?.id) {
      setMaintenanceAlerts([])
      setNotificationsLoading(false)
      return
    }

    const alerts = await loadMaintenanceAlerts(hotel.id)

    setMaintenanceAlerts(alerts)
    setNotificationsLoading(false)
  }

  async function handleSignOut() {
    if (signingOut) return

    setSigningOut(true)
    const { error } = await ariasAuth.signOut()

    if (error) {
      setSigningOut(false)
      return
    }

    setUserMenuOpen(false)
    navigate('/login', { replace: true })
  }

  const filteredRegisters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')
    if (!query) return registers

    return registers.filter((register) => {
      const haystack = [register.name]
        .join(' ')
        .toLocaleLowerCase('es')
      return haystack.includes(query)
    })
  }, [search])

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-100 px-2 py-2 text-slate-900 sm:px-4 sm:py-3">
      <div className="mx-auto flex h-full min-h-0 w-full flex-col">
        <div className="mb-2 flex justify-center px-1 sm:mb-2">
          <BrandLogo
            onActivate={() => window.location.reload()}
            label="Actualizar Arias Suite"
            className="h-14 w-auto object-contain sm:h-16"
          />
        </div>

        <div className="mx-auto w-full px-2 sm:px-3 md:px-5 lg:px-[clamp(48px,5.5vw,90px)]">
          <header className="mb-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar en Arias Suite..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
              />
            </label>

            <div className="flex items-center justify-center gap-2 sm:justify-end">
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 sm:flex">
                {isPlatformAdmin && hotels.length > 1 ? (
                  <select
                    value={hotel?.id ?? ''}
                    onChange={(event) => setHotel(event.target.value)}
                    className="max-w-[220px] bg-transparent text-xs font-semibold text-slate-700 outline-none"
                    aria-label="Hotel actual"
                    title="Cambiar hotel"
                  >
                    {hotels.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="max-w-[220px] truncate text-xs font-semibold text-slate-700" title={hotel?.name ?? 'Hotel actual'}>
                    {hotel?.name ?? 'Hotel actual'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              >
                {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                <span className="hidden text-xs font-medium sm:inline">
                  {isFullscreen ? 'Salir' : 'Pantalla completa'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  setAdminMenuOpen(false)
                  const opening = !notificationsOpen
                  setNotificationsOpen(opening)
                  if (opening) void refreshNotifications()
                }}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                title="Centro de avisos"
                aria-label="Centro de avisos"
                aria-expanded={notificationsOpen}
              >
                <Bell size={18} />
                {maintenanceAlerts.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-bold leading-3 text-white">
                    {maintenanceAlerts.length > 9 ? '9+' : maintenanceAlerts.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                title="Ayuda"
                aria-label="Ayuda"
              >
                <CircleHelp size={18} />
              </button>
              {isPlatformAdmin && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminMenuOpen((open) => !open)
                      setUserMenuOpen(false)
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                    title="Administración"
                    aria-label="Administración"
                    aria-expanded={adminMenuOpen}
                    aria-haspopup="menu"
                  >
                    <Settings size={18} />
                  </button>

                  {adminMenuOpen && (
                    <div
                      className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                      role="menu"
                    >
                      <div className="border-b border-slate-100 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-800">
                          Administración
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          Gestión de accesos
                        </div>
                      </div>

                      <div className="p-1.5">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAdminMenuOpen(false)
                            navigate('/users')
                          }}
                          className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          Usuarios
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAdminMenuOpen(false)
                            navigate('/roles')
                          }}
                          className="mt-0.5 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          Roles y permisos
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen((open) => !open)
                    setAdminMenuOpen(false)
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                  title="Usuario"
                  aria-label="Usuario"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  <UserRound size={18} />
                </button>

                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                    role="menu"
                  >
                    <div className="border-b border-slate-100 px-4 py-3">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {session?.user.fullName || 'Usuario'}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {session?.user.email || 'Sin correo'}
                      </div>
                    </div>

                    <div className="p-1.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false)
                          navigate('/profile')
                        }}
                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        Mi perfil
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleSignOut()}
                        disabled={signingOut}
                        className="mt-0.5 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          </header>
        </div>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
          <div className="mx-auto grid w-full grid-cols-2 justify-center gap-2 px-2 sm:grid-cols-3 sm:px-3 md:grid-cols-4 md:px-5 lg:grid-cols-6 lg:gap-3 lg:px-[clamp(48px,5.5vw,90px)]">
            {filteredRegisters.map((register) => (
              <button
                key={register.name}
                type="button"
                onClick={() => {
                  if (register.path) navigate(register.path)
                }}
                disabled={register.comingSoon}
                aria-label={register.comingSoon ? register.name + ' — en preparación' : 'Entrar en ' + register.name}
                className="group flex min-h-[145px] flex-col items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-2 hover:scale-[1.025] hover:border-slate-300 hover:shadow-[0_18px_32px_rgba(15,23,42,0.18)] active:translate-y-0 active:scale-[0.99]"
              >
                <div className="flex min-h-[112px] flex-1 flex-col items-center justify-center px-3 py-3">
                  {register.iconIndex===null
                    ? <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 transition-transform duration-200 group-hover:scale-110"><Clock3 size={36}/></span>
                    : <span aria-hidden="true"
                        className="block h-14 w-14 shrink-0 bg-no-repeat transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110"
                        style={{
                          backgroundImage: 'url(/assets/home-icons-3d.webp)',
                          backgroundSize: '500% 100%',
                          backgroundPosition: `${register.iconIndex * 25}% 50%`,
                        }}
                      />}
                  <span className="mt-2 text-center text-xs font-medium leading-tight text-slate-700">
                    {register.name}
                  </span>
                  {register.name === 'Pendientes' && pendingCount !== null && (
                    <span className="mt-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                      {pendingCount} pendientes
                    </span>
                  )}
                </div>

                {register.comingSoon && (
                  <div className="border-t border-slate-200 px-2.5 py-1.5 text-center text-[9px] font-semibold text-slate-400">
                    En preparación
                  </div>
                )}
              </button>
            ))}
          </div>

          {filteredRegisters.length === 0 && (
            <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No se encontraron módulos para «{search}».
            </div>
          )}

          {notificationsOpen && (
            <>
              <button type="button" aria-label="Cerrar centro de avisos" onClick={() => setNotificationsOpen(false)} className="fixed inset-0 z-40 cursor-default bg-slate-950/10" />
              <section aria-label="Centro de avisos" className="fixed right-3 top-[4.5rem] z-50 flex max-h-[min(78vh,680px)] w-[min(94vw,440px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-5">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Bell size={19}/></span>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Centro de avisos</h2>
                      <p className="text-[11px] text-slate-500">{maintenanceAlerts.length} avisos activos · {hotel?.name ?? 'Hotel seleccionado'}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => void refreshNotifications()} disabled={notificationsLoading} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{notificationsLoading ? 'Actualizando…' : 'Actualizar'}</button>
                    <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Cerrar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={17}/></button>
                  </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {notificationsLoading && <div className="p-8 text-center text-xs text-slate-400">Actualizando avisos…</div>}
                  {!notificationsLoading && maintenanceAlerts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
                      <Bell size={22} className="mx-auto text-slate-300"/>
                      <p className="mt-2 text-sm font-semibold text-slate-700">No hay avisos activos</p>
                      <p className="mt-1 text-xs text-slate-500">Aquí aparecerán las alertas de mantenimiento que requieran atención.</p>
                    </div>
                  )}
                  {!notificationsLoading && maintenanceAlerts.length > 0 && (
                    <div className="space-y-2">
                      {maintenanceAlerts.map((alert) => {
                        const statusView = alertStatusView(alert)
                        return (
                          <button key={alert.id} type="button" onClick={() => {
                            setNotificationsOpen(false)
                            navigate(alert.apparatus_registry_id ? `/maintenance/pam/${alert.apparatus_registry_id}?planId=${alert.maintenance_plan_id}` : '/maintenance')
                          }} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><CalendarClock size={12}/>Preventivo · PAM</div>
                                <div className="text-sm font-semibold leading-5 text-slate-900">{alert.title}</div>
                                <div className="mt-1 text-xs font-medium text-slate-600">{alert.apparatus_code ? alert.apparatus_code + ' · ' : ''}{alert.apparatus_name ?? 'Equipo no identificado'}</div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusView.className}`}>{statusView.label}</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{alert.message}</p>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                              <span>Prevista: {alert.due_date ? new Date(alert.due_date + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}</span>
                              <span className="font-semibold text-slate-600">Abrir plan →</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <footer className="border-t border-slate-100 px-4 py-2.5">
                  <button type="button" onClick={() => { setNotificationsOpen(false); navigate('/maintenance/planning?summary=OVERDUE') }} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800">Ver planificación preventiva</button>
                </footer>
              </section>
            </>
          )}

        </main>
      </div>
    </div>
  )
}
