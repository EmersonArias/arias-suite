import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { supabase } from '../../../lib/supabase'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'

type Card = {
  title: string
  description: string
  icon: string
  href: string
  metric?: string
}

type Counts = {
  assets: number | null
  pendingTickets: number | null
  overdueTickets: number | null
  urgentTickets: number | null
  pendingPreventives: number | null
  overduePreventives: number | null
  inProgressTickets: number | null
  inManagementTickets: number | null
  scheduledJobs: number | null
  interventions: number | null
  pam: number | null
}

const EMPTY_COUNTS: Counts = {
  assets: null,
  pendingTickets: null,
  overdueTickets: null,
  urgentTickets: null,
  pendingPreventives: null,
  overduePreventives: null,
  inProgressTickets: null,
  inManagementTickets: null,
  scheduledJobs: null,
  interventions: null,
  pam: null,
}

const MAINTENANCE_ICONS = {
  equipment: '/assets/maintenance-icons-3d/equipment.webp',
  tickets: '/assets/record-icons-3d/daily.webp',
  warning: '/assets/maintenance-icons-3d/warning.webp',
  materials: '/assets/maintenance-icons-3d/materials.webp',
  led: '/assets/maintenance-icons-3d/led.webp',
  fancoil: '/assets/record-icons-3d/fancoil.webp',
  pam: '/assets/maintenance-icons-3d/pam.webp',
  interventions: '/assets/maintenance-icons-3d/interventions.webp',
  audit: '/assets/record-icons-3d/daily.webp',
  settings: '/assets/maintenance-icons-3d/settings.webp',
  pending: '/assets/maintenance-icons-3d/pending.webp',
}

function MaintenanceIcon({ src, className = 'h-14 w-14' }: { src: string; className?: string }) {
  return <img src={src} alt="" aria-hidden="true" width={512} height={512} loading="lazy" decoding="async" draggable={false} className={'shrink-0 object-contain ' + className} />
}

function localTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function MaintenanceLandingPage() {
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)

  useEffect(() => {
    let mounted = true

    async function loadCounts() {
      if (!hotel?.id) {
        setCounts(EMPTY_COUNTS)
        return
      }

      const [assets, pending, overdueTickets, urgentTickets, inProgress, inManagement, scheduledJobs, pendingPreventives, overduePreventives, interventions, pam] = await Promise.all([
        supabase
          .from('apparatus_registry')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('active', true),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('status', 'PENDING')
          .neq('work_type', 'PREVENTIVE')
          .or(`scheduled_date.is.null,scheduled_date.gte.${localTodayISO()}`),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .neq('work_type', 'PREVENTIVE')
          .in('status', ['PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS'])
          .lt('scheduled_date', localTodayISO()),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .in('priority', ['HIGH', 'CRITICAL'])
          .neq('status', 'COMPLETED')
          .neq('status', 'REJECTED')
          .neq('work_type', 'PREVENTIVE'),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('status', 'IN_PROGRESS')
          .neq('work_type', 'PREVENTIVE'),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('status', 'IN_MANAGEMENT')
          .neq('work_type', 'PREVENTIVE'),
        supabase
          .from('maintenance_scheduled_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('work_type', 'PREVENTIVE')
          .eq('status', 'PENDING')
          .or(`scheduled_date.is.null,scheduled_date.gte.${localTodayISO()}`),
        supabase
          .from('maintenance_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('work_type', 'PREVENTIVE')
          .in('status', ['PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS'])
          .lt('scheduled_date', localTodayISO()),
        supabase
          .from('maintenance_actions')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('active', true),
        supabase
          .from('maintenance_plans')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotel.id)
          .eq('active', true),
      ])

      if (!mounted) return

      setCounts({
        assets: assets.error ? null : assets.count ?? 0,
        pendingTickets: pending.error ? null : pending.count ?? 0,
        overdueTickets: overdueTickets.error ? null : overdueTickets.count ?? 0,
        urgentTickets: urgentTickets.error ? null : urgentTickets.count ?? 0,
        pendingPreventives: pendingPreventives.error ? null : pendingPreventives.count ?? 0,
        overduePreventives: overduePreventives.error ? null : overduePreventives.count ?? 0,
        inProgressTickets: inProgress.error ? null : inProgress.count ?? 0,
        inManagementTickets: inManagement.error ? null : inManagement.count ?? 0,
        scheduledJobs: scheduledJobs.error ? null : scheduledJobs.count ?? 0,
        interventions: interventions.error ? null : interventions.count ?? 0,
        pam: pam.error ? null : pam.count ?? 0,
      })
    }

    void loadCounts()

    return () => {
      mounted = false
    }
  }, [hotel?.id])

  const cards: Card[] = [
    {
      title: 'Equipos e instalaciones',
      description: 'Catálogo maestro de equipos e instalaciones.',
      icon: MAINTENANCE_ICONS.equipment,
      href: '/apparatusregistry',
      metric: counts.assets == null ? undefined : `${counts.assets} activos`,
    },
    {
      title: 'Tickets',
      description: 'Incidencias correctivas y actuaciones, separadas del mantenimiento preventivo.',
      icon: MAINTENANCE_ICONS.tickets,
      href: '/maintenance/tickets',
      metric:
        counts.pendingTickets == null || counts.inManagementTickets == null || counts.inProgressTickets == null
          ? undefined
          : `${counts.pendingTickets} pendientes · ${counts.inManagementTickets} en gestión · ${counts.inProgressTickets} en curso`,
    },
    {
      title: 'Alertas correctivas',
      description: 'Tickets abiertos con criticidad alta o crítica. Sin tareas preventivas.',
      icon: MAINTENANCE_ICONS.warning,
      href: '/maintenance/tickets?summary=URGENT',
      metric: counts.urgentTickets == null ? undefined : `${counts.urgentTickets} graves`,
    },
    {
      title: 'Materiales y stock',
      description: 'Catálogo de materiales, existencias, proveedores, enlaces de compra y peticiones.',
      icon: MAINTENANCE_ICONS.materials,
      href: '/materials',
    },
    {
      title: 'LED de armario',
      description: 'Control de luces LED de armario por habitación, con seguimiento y plano visual para recepción.',
      icon: MAINTENANCE_ICONS.led,
      href: '/maintenance/room-projects',
    },
    {
      title: 'Preventivos de Fancoils',
      description: 'Control por habitación y planta con los mismos colores, estados, filtros y PDF de LED de armario.',
      icon: MAINTENANCE_ICONS.fancoil,
      href: '/maintenance/fancoil-preventives',
    },
    {
      title: 'Preventivos',
      description: 'Seguimiento del PAM por separado de los tickets correctivos.',
      icon: MAINTENANCE_ICONS.pam,
      href: '/maintenance/planning',
      metric: counts.pendingPreventives == null || counts.overduePreventives == null
        ? undefined
        : `${counts.pendingPreventives} pendientes · ${counts.overduePreventives} atrasados`,
    },
    {
      title: 'Intervenciones',
      description: 'Registro de trabajos relevantes realizados en el hotel.',
      icon: MAINTENANCE_ICONS.interventions,
      href: '/maintenance/interventions',
      metric: counts.interventions == null ? undefined : `${counts.interventions} registradas`,
    },
    {
      title: 'PAM',
      description: 'Plan Anual de Mantenimiento preventivo del hotel.',
      icon: MAINTENANCE_ICONS.pam,
      href: '/maintenance/pam',
      metric: counts.pam == null ? undefined : `${counts.pam} planes activos`,
    },
    {
      title: 'Auditoría',
      description: 'Evidencias, certificados, históricos y documentos.',
      icon: MAINTENANCE_ICONS.audit,
      href: '/maintenance/audit',
    },
    {
      title: 'Configuración',
      description: 'Automatización, asignación, avisos y reglas por hotel.',
      icon: MAINTENANCE_ICONS.settings,
      href: '/maintenance/configuration',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">Mantenimiento</h1>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Centro operativo de mantenimiento del hotel</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BackButton onBack={() => navigate('/')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
          </div>
        </header>

        <main>
          <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-slate-800 sm:text-base">Centro de mantenimiento</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Equipos, tickets, trabajos programados, intervenciones, PAM y auditoría.
            </p>
          </section>

          <section className="mb-4 grid gap-3 xl:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <MaintenanceIcon src={MAINTENANCE_ICONS.tickets} />
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900 sm:text-lg">Correctivos · Tickets</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Incidencias y averías. Las tareas preventivas no se incluyen en estos contadores.</p>
                  </div>
                </div>
                <button type="button" onClick={() => navigate('/maintenance/tickets?new=1')} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 sm:text-sm"><Plus size={15}/>Nuevo</button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {[
                  { key: 'PENDING', label: 'Pendientes', count: counts.pendingTickets, icon: MAINTENANCE_ICONS.pending, tone: 'bg-amber-50 text-amber-700' },
                  { key: 'OVERDUE', label: 'Atrasados', count: counts.overdueTickets, icon: MAINTENANCE_ICONS.warning, tone: 'bg-rose-50 text-rose-700' },
                  { key: 'URGENT', label: 'Alta / crítica', count: counts.urgentTickets, icon: MAINTENANCE_ICONS.warning, tone: 'bg-rose-50 text-rose-700' },
                  { key: 'IN_MANAGEMENT', label: 'En gestión', count: counts.inManagementTickets, icon: MAINTENANCE_ICONS.tickets, tone: 'bg-violet-50 text-violet-700' },
                  { key: 'IN_PROGRESS', label: 'En curso', count: counts.inProgressTickets, icon: MAINTENANCE_ICONS.interventions, tone: 'bg-blue-50 text-blue-700' },
                ].map((metric) => {
                  return (
                    <button key={metric.key} type="button" onClick={() => navigate('/maintenance/tickets?summary=' + metric.key)} className="min-w-0 rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:shadow-sm active:scale-[0.99]">
                      <span className={'inline-flex rounded-xl p-1 ' + metric.tone}><MaintenanceIcon src={metric.icon} className="h-10 w-10" /></span>
                      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{metric.count == null ? '—' : metric.count}</div>
                      <div className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-600 sm:text-xs">{metric.label}</div>
                    </button>
                  )
                })}
              </div>
              <button type="button" onClick={() => navigate('/maintenance/tickets')} className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950">Ver todos los tickets <span aria-hidden="true">→</span></button>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <MaintenanceIcon src={MAINTENANCE_ICONS.pam} />
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900 sm:text-lg">Preventivos · PAM</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Seguimiento de trabajos programados, separado del flujo de incidencias correctivas.</p>
                  </div>
                </div>
                <button type="button" onClick={() => navigate('/maintenance/planning')} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:text-sm">Planificación</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'PENDING', label: 'Pendientes', count: counts.pendingPreventives, icon: MAINTENANCE_ICONS.pending, tone: 'bg-amber-50 text-amber-700', detail: 'OT preventivas por atender' },
                  { key: 'OVERDUE', label: 'Atrasados', count: counts.overduePreventives, icon: MAINTENANCE_ICONS.warning, tone: 'bg-rose-50 text-rose-700', detail: 'Fuera de fecha y sin finalizar' },
                ].map((metric) => {
                  return (
                    <button key={metric.key} type="button" onClick={() => navigate('/maintenance/planning?summary=' + metric.key)} className="min-w-0 rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:shadow-sm active:scale-[0.99] sm:p-4">
                      <div className="flex items-center gap-2">
                        <span className={'inline-flex shrink-0 rounded-xl p-1 ' + metric.tone}><MaintenanceIcon src={metric.icon} className="h-10 w-10" /></span>
                        <span className="truncate text-xs font-semibold text-slate-600">{metric.label}</span>
                      </div>
                      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{metric.count == null ? '—' : metric.count}</div>
                      <p className="mt-0.5 text-[10px] leading-4 text-slate-500 sm:text-xs">{metric.detail}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.filter((card) => !['Tickets', 'Alertas correctivas', 'Preventivos'].includes(card.title)).map((card) => {
              return (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => navigate(card.href)}
                  className="group min-h-[175px] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg active:translate-y-0 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <MaintenanceIcon src={card.icon} className="h-20 w-20 transition-transform duration-200 motion-safe:group-hover:scale-105 motion-reduce:transition-none sm:h-24 sm:w-24" />
                    <span className="text-slate-300 transition group-hover:translate-x-0.5">→</span>
                  </div>
                  <div className="mt-4 text-base font-bold text-slate-900">{card.title}</div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500 sm:text-sm">{card.description}</p>
                  {card.metric && (
                    <div className="mt-4 text-xs font-semibold text-slate-600">{card.metric}</div>
                  )}
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entrar</div>
                </button>
              )
            })}
          </section>
        </main>
      </div>
    </div>
  )
}
