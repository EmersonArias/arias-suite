import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import {
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  RefreshCw,
  Search,
  Settings2,
  Wrench,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import { supabase } from '../../../lib/supabase'

type PeriodicityUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'VARIABLE'
type MaintenanceType = 'INTERNAL' | 'EXTERNAL'

type Plan = {
  id: string
  hotel_id: string
  apparatus_registry_id: string | null
  apparatus_code: string | null
  apparatus_name: string | null
  plant: string | null
  location: string | null
  maintenance_code: string | null
  maintenance_name: string
  description: string | null
  maintenance_type: MaintenanceType
  provider_id: string | null
  provider_name: string | null
  provider_service_id: string | null
  provider_service_name: string | null
  external_company: string | null
  contract_reference: string | null
  periodicity_value: number | null
  periodicity_unit: PeriodicityUnit | null
  start_date: string | null
  schedule_anchor_date: string | null
  scheduled_day_of_month: number | null
  scheduled_weekday: number | null
  tolerance_days: number
  alert_lead_days: number
  booking_required: boolean
  visit_duration_minutes: number | null
  schedule_notes: string | null
  next_due_date: string | null
  active: boolean
}

type ScheduleRow = {
  maintenance_plan_id: string
  plan_year: number
  mark_code: string
  action_name: string | null
  source_maintenance_name: string | null
  month_number: number
  week_slot: number
}

type Provider = { id: string; name: string }
type ProviderService = { id: string; provider_id: string; service_name: string }

type Execution = {
  id: string
  scheduled_date: string | null
  executed_at: string | null
  performer_name: string | null
  performer_company: string | null
  result: string
  observations: string | null
}

type Control = {
  id: string
  code: string | null
  label: string
  description: string | null
  input_type: string
  unit: string | null
  required: boolean
  sort_order: number
  active: boolean
}

type AlertConfig = {
  id: string
  email_enabled: boolean
  days_before: number
  notify_on_due: boolean
  notify_when_overdue: boolean
  overdue_repeat_days: number
}

type Alert = {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  due_date: string | null
  triggered_at: string
  acknowledged_at: string | null
  resolved_at: string | null
}

type Task = Plan & {
  mark_code: string | null
  action_name: string | null
  source_maintenance_name: string | null
}

type EquipmentGroup = {
  id: string
  code: string
  name: string
  plant: string | null
  location: string | null
  plans: Task[]
}

type DetailTab = 'SUMMARY' | 'SCHEDULE' | 'CHECKLIST' | 'HISTORY' | 'ALERTS'

const ACTION_LABELS: Record<string, string> = {
  CP: 'Control de presiones',
  DE: 'Dosificar encimas',
  E: 'Engrase',
  EXT: 'Mantenimiento externo',
  F: 'Ficha de revisión',
  L: 'Limpieza',
  LF: 'Limpieza de filtros',
  N: 'Limpieza general',
  RG: 'Revisión general',
  RK: 'Revisión KONE',
  RO: 'Aceite hidráulico',
  SD: 'Supervisión diaria',
}

function actionLabel(task: Task) {
  return task.action_name || (task.mark_code ? ACTION_LABELS[task.mark_code] : null) || task.maintenance_name
}

function periodicityLabel(value: number | null, unit: PeriodicityUnit | null) {
  if (!value || !unit || unit === 'VARIABLE') return 'Sin definir'
  if (unit === 'DAY') return value === 1 ? 'Diaria' : 'Cada ' + value + ' días'
  if (unit === 'WEEK') return value === 1 ? 'Semanal' : 'Cada ' + value + ' semanas'
  if (unit === 'MONTH') {
    if (value === 1) return 'Mensual'
    if (value === 2) return 'Bimestral'
    if (value === 3) return 'Trimestral'
    if (value === 4) return 'Cuatrimestral'
    if (value === 6) return 'Semestral'
    return 'Cada ' + value + ' meses'
  }
  if (unit === 'YEAR') return value === 1 ? 'Anual' : 'Cada ' + value + ' años'
  return 'Sin definir'
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(value + 'T12:00:00')
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function stateOf(plan: Plan) {
  if (!plan.active) return 'Inactivo'
  if (!plan.next_due_date) return 'Por programar'

  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const due = new Date(plan.next_due_date + 'T12:00:00')
  const diff = Math.round(
    (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000,
  )

  if (diff < 0) return 'Vencido'
  if (diff === 0) return 'Hoy'
  if (diff <= 7) return 'Próximo'
  return 'Programado'
}

function stateClass(state: string) {
  switch (state) {
    case 'Vencido':
      return 'bg-rose-100 text-rose-700'
    case 'Hoy':
      return 'bg-amber-100 text-amber-700'
    case 'Próximo':
      return 'bg-blue-100 text-blue-700'
    case 'Por programar':
      return 'bg-slate-100 text-slate-500'
    default:
      return 'bg-emerald-100 text-emerald-700'
  }
}

function worstState(plans: Task[]) {
  const rank: Record<string, number> = {
    Vencido: 5,
    Hoy: 4,
    Próximo: 3,
    'Por programar': 2,
    Programado: 1,
    Inactivo: 0,
  }
  return plans.reduce((best, plan) => {
    const state = stateOf(plan)
    return rank[state] > rank[best] ? state : best
  }, 'Inactivo')
}

function sortPlans(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const aTime = a.next_due_date ? new Date(a.next_due_date).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.next_due_date ? new Date(b.next_due_date).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime || actionLabel(a).localeCompare(actionLabel(b), 'es')
  })
}

export default function PamPage() {
  const navigate = useNavigate()
  const [hotelId, setHotelId] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerServices, setProviderServices] = useState<ProviderService[]>([])
  const [search, setSearch] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [detailTab, setDetailTab] = useState<DetailTab>('SUMMARY')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [controls, setControls] = useState<Control[]>([])
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scheduleDraft, setScheduleDraft] = useState({
    provider_id: '',
    provider_service_id: '',
    contract_reference: '',
    next_due_date: '',
    schedule_anchor_date: '',
    scheduled_day_of_month: '',
    scheduled_weekday: '',
    tolerance_days: '0',
    alert_lead_days: '7',
    booking_required: false,
    visit_duration_minutes: '',
    schedule_notes: '',
  })

  async function resolveHotel() {
    if (hotelId) return hotelId

    const assignment = await supabase
      .from('user_hotel_roles')
      .select('hotel_id')
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (assignment.error || !assignment.data?.hotel_id) {
      throw new Error('No se ha podido determinar el hotel activo.')
    }

    const id = assignment.data.hotel_id as string
    setHotelId(id)

    const hotel = await supabase
      .from('hotels')
      .select('name')
      .eq('id', id)
      .maybeSingle()

    setHotelName(hotel.data?.name ?? 'Hotel activo')
    return id
  }

  async function loadBase() {
    setLoading(true)
    setError('')
    try {
      const id = await resolveHotel()

      const [planResult, scheduleResult, relationResult] = await Promise.all([
        supabase
          .from('maintenance_plan_overview')
          .select('*')
          .eq('hotel_id', id)
          .eq('active', true)
          .order('apparatus_code', { ascending: true })
          .order('next_due_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('pam_maintenance_schedule')
          .select('maintenance_plan_id,plan_year,mark_code,action_name,source_maintenance_name,month_number,week_slot')
          .eq('hotel_id', id)
          .order('plan_year', { ascending: false })
          .order('month_number', { ascending: true })
          .order('week_slot', { ascending: true }),
        supabase
          .from('provider_hotels')
          .select('provider_id')
          .eq('hotel_id', id)
          .eq('active', true),
      ])

      if (planResult.error) throw planResult.error
      if (scheduleResult.error) throw scheduleResult.error
      if (relationResult.error) throw relationResult.error

      const providerIds = (relationResult.data ?? []).map((row) => row.provider_id as string)
      let loadedProviders: Provider[] = []
      let loadedServices: ProviderService[] = []

      if (providerIds.length > 0) {
        const providerResult = await supabase
          .from('providers')
          .select('id,legal_name,trade_name')
          .in('id', providerIds)
          .eq('active', true)
          .order('legal_name', { ascending: true })

        if (providerResult.error) throw providerResult.error

        const serviceResult = await supabase
          .from('provider_services')
          .select('id,provider_id,service_name')
          .in('provider_id', providerIds)
          .eq('active', true)
          .order('service_name', { ascending: true })

        if (serviceResult.error) throw serviceResult.error

        loadedProviders = (providerResult.data ?? []).map((item) => ({
          id: item.id as string,
          name: String(item.trade_name || item.legal_name),
        }))
        loadedServices = (serviceResult.data ?? []) as ProviderService[]
      }

      const loadedPlans = (planResult.data ?? []) as Plan[]
      setPlans(loadedPlans)
      setSchedule((scheduleResult.data ?? []) as ScheduleRow[])
      setProviders(loadedProviders)
      setProviderServices(loadedServices)
      setSelectedPlanId((current) =>
        loadedPlans.some((plan) => plan.id === current) ? current : loadedPlans[0]?.id ?? '',
      )
    } catch (loadError) {
      setPlans([])
      setSchedule([])
      setProviders([])
      setProviderServices([])
      setError(loadError instanceof Error ? loadError.message : 'No se ha podido cargar el PAM.')
    } finally {
      setLoading(false)
    }
  }

  async function loadDetailData(planId: string, tab: DetailTab) {
    if (!planId) return
    setDetailsLoading(true)

    try {
      if (tab === 'HISTORY') {
        const result = await supabase
          .from('maintenance_executions')
          .select('id,scheduled_date,executed_at,performer_name,performer_company,result,observations')
          .eq('maintenance_plan_id', planId)
          .order('executed_at', { ascending: false })

        setExecutions(result.error ? [] : ((result.data ?? []) as Execution[]))
      }

      if (tab === 'CHECKLIST') {
        const result = await supabase
          .from('maintenance_controls')
          .select('id,code,label,description,input_type,unit,required,sort_order,active')
          .eq('maintenance_plan_id', planId)
          .eq('active', true)
          .order('sort_order', { ascending: true })

        setControls(result.error ? [] : ((result.data ?? []) as Control[]))
      }

      if (tab === 'ALERTS') {
        const [configResult, alertResult] = await Promise.all([
          supabase
            .from('maintenance_alert_configs')
            .select('id,email_enabled,days_before,notify_on_due,notify_when_overdue,overdue_repeat_days')
            .eq('maintenance_plan_id', planId)
            .maybeSingle(),
          supabase
            .from('maintenance_alerts')
            .select('id,alert_type,severity,title,message,due_date,triggered_at,acknowledged_at,resolved_at')
            .eq('maintenance_plan_id', planId)
            .order('triggered_at', { ascending: false })
            .limit(20),
        ])

        setAlertConfig(configResult.error ? null : (configResult.data as AlertConfig | null))
        setAlerts(alertResult.error ? [] : ((alertResult.data ?? []) as Alert[]))
      }
    } finally {
      setDetailsLoading(false)
    }
  }

  useEffect(() => {
    void loadBase()
  }, [])

  useEffect(() => {
    if (selectedPlanId) void loadDetailData(selectedPlanId, detailTab)
  }, [selectedPlanId, detailTab])

  const tasks = useMemo<Task[]>(() => {
    const rowsByPlan = new Map<string, ScheduleRow[]>()

    for (const row of schedule) {
      const list = rowsByPlan.get(row.maintenance_plan_id) ?? []
      list.push(row)
      rowsByPlan.set(row.maintenance_plan_id, list)
    }

    return plans.map((plan) => {
      const row = rowsByPlan.get(plan.id)?.[0]
      return {
        ...plan,
        mark_code: row?.mark_code ?? null,
        action_name: row?.action_name ?? null,
        source_maintenance_name: row?.source_maintenance_name ?? null,
      }
    })
  }, [plans, schedule])

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')
    if (!query) return tasks

    return tasks.filter((task) =>
      [
        task.apparatus_code,
        task.apparatus_name,
        task.plant,
        task.location,
        task.maintenance_name,
        actionLabel(task),
        task.provider_name,
        task.external_company,
        task.contract_reference,
        task.mark_code,
        task.source_maintenance_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query),
    )
  }, [tasks, search])

  const groups = useMemo<EquipmentGroup[]>(() => {
    const map = new Map<string, EquipmentGroup>()

    for (const task of filteredTasks) {
      if (!task.apparatus_registry_id || !task.apparatus_code) continue
      const current = map.get(task.apparatus_registry_id)

      if (!current) {
        map.set(task.apparatus_registry_id, {
          id: task.apparatus_registry_id,
          code: task.apparatus_code,
          name: task.apparatus_name || 'Activo',
          plant: task.plant,
          location: task.location,
          plans: [task],
        })
      } else {
        current.plans.push(task)
      }
    }

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code, 'es'))
  }, [filteredTasks])

  const selectedTask = tasks.find((task) => task.id === selectedPlanId) ?? null

  const stats = useMemo(() => {
    const upcoming = tasks.filter((task) => {
      if (!task.next_due_date) return false
      const today = new Date()
      today.setHours(12, 0, 0, 0)
      const due = new Date(task.next_due_date + 'T12:00:00')
      const diff = Math.round(
        (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
          Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000,
      )
      return diff >= 0 && diff <= 7
    }).length

    return {
      assets: new Set(tasks.map((task) => task.apparatus_registry_id).filter(Boolean)).size,
      preventive: tasks.length,
      upcoming,
      overdue: tasks.filter((task) => stateOf(task) === 'Vencido').length,
      unprogrammed: tasks.filter((task) => stateOf(task) === 'Por programar').length,
      external: tasks.filter((task) => task.maintenance_type === 'EXTERNAL').length,
    }
  }, [tasks])

  function openPlan(planId: string) {
    setSelectedPlanId(planId)
    setDetailTab('SUMMARY')
    setDetailOpen(true)
  }

  useEffect(() => {
    if (!selectedTask) return
    setScheduleDraft({
      provider_id: selectedTask.provider_id ?? '',
      provider_service_id: selectedTask.provider_service_id ?? '',
      contract_reference: selectedTask.contract_reference ?? '',
      next_due_date: selectedTask.next_due_date ?? '',
      schedule_anchor_date: selectedTask.schedule_anchor_date ?? '',
      scheduled_day_of_month: selectedTask.scheduled_day_of_month ? String(selectedTask.scheduled_day_of_month) : '',
      scheduled_weekday: selectedTask.scheduled_weekday ? String(selectedTask.scheduled_weekday) : '',
      tolerance_days: String(selectedTask.tolerance_days ?? 0),
      alert_lead_days: String(selectedTask.alert_lead_days ?? 7),
      booking_required: selectedTask.booking_required ?? false,
      visit_duration_minutes: selectedTask.visit_duration_minutes ? String(selectedTask.visit_duration_minutes) : '',
      schedule_notes: selectedTask.schedule_notes ?? '',
    })
  }, [selectedPlanId, selectedTask?.id])

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTask || saving) return

    setSaving(true)
    setError('')

    try {
      const result = await supabase
        .from('maintenance_plans')
        .update({
          provider_id: scheduleDraft.provider_id || null,
          provider_service_id: scheduleDraft.provider_service_id || null,
          contract_reference: scheduleDraft.contract_reference.trim() || null,
          next_due_date: scheduleDraft.next_due_date || null,
          schedule_anchor_date: scheduleDraft.schedule_anchor_date || scheduleDraft.next_due_date || null,
          scheduled_day_of_month: scheduleDraft.scheduled_day_of_month ? Number(scheduleDraft.scheduled_day_of_month) : null,
          scheduled_weekday: scheduleDraft.scheduled_weekday ? Number(scheduleDraft.scheduled_weekday) : null,
          tolerance_days: Math.max(0, Number(scheduleDraft.tolerance_days) || 0),
          alert_lead_days: Math.max(0, Number(scheduleDraft.alert_lead_days) || 0),
          booking_required: scheduleDraft.booking_required,
          visit_duration_minutes: scheduleDraft.visit_duration_minutes ? Math.max(1, Number(scheduleDraft.visit_duration_minutes) || 1) : null,
          schedule_notes: scheduleDraft.schedule_notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTask.id)

      if (result.error) throw result.error
      await loadBase()
      setDetailTab('SUMMARY')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se ha podido guardar la programación.')
    } finally {
      setSaving(false)
    }
  }

  async function saveAlerts() {
    if (!selectedTask || saving) return
    setSaving(true)
    setError('')

    try {
      if (alertConfig?.id) {
        const result = await supabase
          .from('maintenance_alert_configs')
          .update({
            email_enabled: alertConfig.email_enabled,
            days_before: Math.max(0, alertConfig.days_before),
            notify_on_due: alertConfig.notify_on_due,
            notify_when_overdue: alertConfig.notify_when_overdue,
            overdue_repeat_days: Math.max(1, alertConfig.overdue_repeat_days),
            updated_at: new Date().toISOString(),
          })
          .eq('id', alertConfig.id)

        if (result.error) throw result.error
      } else {
        const result = await supabase
          .from('maintenance_alert_configs')
          .insert({
            maintenance_plan_id: selectedTask.id,
            email_enabled: alertConfig?.email_enabled ?? true,
            days_before: Math.max(0, alertConfig?.days_before ?? selectedTask.alert_lead_days ?? 7),
            notify_on_due: alertConfig?.notify_on_due ?? true,
            notify_when_overdue: alertConfig?.notify_when_overdue ?? true,
            overdue_repeat_days: Math.max(1, alertConfig?.overdue_repeat_days ?? 2),
          })
          .select('id,email_enabled,days_before,notify_on_due,notify_when_overdue,overdue_repeat_days')
          .single()

        if (result.error) throw result.error
        setAlertConfig(result.data as AlertConfig)
      }

      await loadDetailData(selectedTask.id, 'ALERTS')
    } catch (alertError) {
      setError(alertError instanceof Error ? alertError.message : 'No se ha podido guardar la configuración de avisos.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-3 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">PAM</h1>
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">2026 · ACTIVO</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">2025 · CERRADO</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                  Mantenimiento preventivo · {hotelName || 'Hotel activo'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <BackButton onBack={() => navigate('/')} />
              <HomeButton onHome={() => navigate('/')} />
              <IconButton icon={RefreshCw} label="Actualizar PAM" title="Actualizar" onClick={() => void loadBase()} disabled={loading} />
            </div>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Activos', stats.assets],
            ['Preventivos', stats.preventive],
            ['Próximos 7 días', stats.upcoming],
            ['Vencidos', stats.overdue],
            ['Por programar', stats.unprogrammed],
            ['Externos', stats.external],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,0.75fr)]">
          <section className="rounded-2xl bg-white shadow-lg">
            <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Wrench size={16} className="text-slate-500" />
                  Equipos y mantenimientos
                </div>
                <div className="mt-0.5 text-xs text-slate-500">Solo lo esencial aquí. La ficha completa se abre al entrar en un mantenimiento.</div>
              </div>
              <div className="relative w-full sm:max-w-[320px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar equipo, mantenimiento, empresa…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-sm text-slate-400">Cargando PAM…</div>
            ) : groups.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">No hay mantenimientos preventivos activos.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {groups.map((group) => {
                  const groupState = worstState(group.plans)

                  return (
                    <div key={group.id} className="p-2 sm:p-3">
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex items-center gap-3 bg-slate-50 px-3 py-3 sm:px-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500">
                            <Building2 size={17} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900">{group.code}</span>
                              <span className="truncate text-xs text-slate-500">{group.name}</span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {group.plant || '—'} · {group.location || '—'} · {group.plans.length} preventivo{group.plans.length === 1 ? '' : 's'}
                            </div>
                          </div>
                          <span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ' + stateClass(groupState)}>{groupState}</span>
                        </div>

                        <div className="divide-y divide-slate-100 bg-white">
                          {sortPlans(group.plans).map((task) => {
                            const provider = task.provider_name || task.external_company || (task.maintenance_type === 'EXTERNAL' ? 'Empresa no definida' : 'SSTT interno')
                            const state = stateOf(task)

                            return (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => openPlan(task.id)}
                                className="grid w-full gap-2 px-3 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[minmax(220px,1.35fr)_120px_minmax(150px,0.9fr)_130px_105px] sm:items-center sm:px-4"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    {task.mark_code && <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-600">{task.mark_code}</span>}
                                    <span className="truncate text-xs font-semibold text-slate-800">{actionLabel(task)}</span>
                                  </div>
                                  <div className="mt-1 truncate text-[10px] text-slate-400">{task.maintenance_name}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Frecuencia</div>
                                  <div className="text-xs font-semibold text-slate-700">{periodicityLabel(task.periodicity_value, task.periodicity_unit)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Responsable</div>
                                  <div className="truncate text-xs text-slate-700">{provider}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Próxima</div>
                                  <div className="text-xs font-semibold text-slate-700">{dateLabel(task.next_due_date)}</div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end sm:gap-2">
                                  <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' + stateClass(state)}>{state}</span>
                                  <ChevronRight size={15} className="text-slate-300" />
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="hidden xl:block rounded-2xl bg-white shadow-lg">
            <PamDetail
              plan={selectedTask}
              tab={detailTab}
              setTab={setDetailTab}
              scheduleDraft={scheduleDraft}
              setScheduleDraft={setScheduleDraft}
              providers={providers}
              providerServices={providerServices}
              controls={controls}
              executions={executions}
              alertConfig={alertConfig}
              setAlertConfig={setAlertConfig}
              alerts={alerts}
              detailsLoading={detailsLoading}
              saving={saving}
              onSaveSchedule={saveSchedule}
              onSaveAlerts={saveAlerts}
            />
          </aside>
        </div>
      </div>

      {detailOpen && selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 p-2 backdrop-blur-[2px] xl:hidden">
          <div className="mx-auto h-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">{selectedTask.apparatus_code} · {actionLabel(selectedTask)}</div>
              <button type="button" onClick={() => setDetailOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="h-[calc(100%-57px)] overflow-auto">
              <PamDetail
                plan={selectedTask}
                tab={detailTab}
                setTab={setDetailTab}
                scheduleDraft={scheduleDraft}
                setScheduleDraft={setScheduleDraft}
                providers={providers}
                providerServices={providerServices}
                controls={controls}
                executions={executions}
                alertConfig={alertConfig}
                setAlertConfig={setAlertConfig}
                alerts={alerts}
                detailsLoading={detailsLoading}
                saving={saving}
                onSaveSchedule={saveSchedule}
                onSaveAlerts={saveAlerts}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type ScheduleDraft = {
  provider_id: string
  provider_service_id: string
  contract_reference: string
  next_due_date: string
  schedule_anchor_date: string
  scheduled_day_of_month: string
  scheduled_weekday: string
  tolerance_days: string
  alert_lead_days: string
  booking_required: boolean
  visit_duration_minutes: string
  schedule_notes: string
}

type PamDetailProps = {
  plan: Task | null
  tab: DetailTab
  setTab: (tab: DetailTab) => void
  scheduleDraft: ScheduleDraft
  setScheduleDraft: Dispatch<SetStateAction<ScheduleDraft>>
  providers: Provider[]
  providerServices: ProviderService[]
  controls: Control[]
  executions: Execution[]
  alertConfig: AlertConfig | null
  setAlertConfig: Dispatch<SetStateAction<AlertConfig | null>>
  alerts: Alert[]
  detailsLoading: boolean
  saving: boolean
  onSaveSchedule: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onSaveAlerts: () => Promise<void>
}

function PamDetail({
  plan,
  tab,
  setTab,
  scheduleDraft,
  setScheduleDraft,
  providers,
  providerServices,
  controls,
  executions,
  alertConfig,
  setAlertConfig,
  alerts,
  detailsLoading,
  saving,
  onSaveSchedule,
  onSaveAlerts,
}: PamDetailProps) {
  if (!plan) {
    return (
      <div className="flex min-h-[520px] items-center justify-center p-10 text-center">
        <div>
          <Wrench className="mx-auto text-slate-300" size={34} />
          <div className="mt-3 text-sm font-semibold text-slate-600">Selecciona un mantenimiento</div>
          <div className="mt-1 text-xs text-slate-400">Aquí aparecerá su ficha completa.</div>
        </div>
      </div>
    )
  }

  const services = providerServices.filter((service) => !scheduleDraft.provider_id || service.provider_id === scheduleDraft.provider_id)

  return (
    <div className="min-h-[520px]">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Wrench size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{plan.apparatus_code}</div>
            <div className="truncate text-base font-bold text-slate-900">{plan.apparatus_name || 'Activo'}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
              <span>{actionLabel(plan)}</span>
              <span>·</span>
              <span>{periodicityLabel(plan.periodicity_value, plan.periodicity_unit)}</span>
            </div>
          </div>
          <span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ' + stateClass(stateOf(plan))}>{stateOf(plan)}</span>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 py-2">
        {[
          ['SUMMARY', 'Resumen', Wrench],
          ['SCHEDULE', 'Programación', CalendarClock],
          ['CHECKLIST', 'Checklist', ClipboardCheck],
          ['HISTORY', 'Histórico', History],
          ['ALERTS', 'Alertas', Bell],
        ].map(([value, label, Icon]) => {
          const TabIcon = Icon as typeof Wrench
          return (
            <button
              key={String(value)}
              type="button"
              onClick={() => setTab(value as DetailTab)}
              className={'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold ' + (tab === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              <TabIcon size={13} />
              {String(label)}
            </button>
          )
        })}
      </div>

      {detailsLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">Cargando ficha…</div>
      ) : (
        <>
          {tab === 'SUMMARY' && (
            <div className="space-y-4 p-4">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lo esencial</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Metric label="Frecuencia" value={periodicityLabel(plan.periodicity_value, plan.periodicity_unit)} />
                  <Metric label="Próxima intervención" value={dateLabel(plan.next_due_date)} />
                  <Metric label="Responsable" value={plan.provider_name || plan.external_company || (plan.maintenance_type === 'EXTERNAL' ? 'Empresa no definida' : 'SSTT interno')} />
                  <Metric label="Contrato" value={plan.contract_reference || 'No definido'} />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <Building2 size={13} />
                  Activo
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{plan.apparatus_name || 'Activo'}</div>
                <div className="mt-1 text-xs text-slate-500">{plan.apparatus_code} · {plan.plant || '—'} · {plan.location || '—'}</div>
              </section>

              <section className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <FileText size={13} />
                  Origen
                </div>
                <div className="mt-2 text-xs text-slate-600">{plan.source_maintenance_name || plan.maintenance_name}</div>
                <div className="mt-1 text-[10px] text-slate-400">{plan.mark_code ? 'Marca PAM: ' + plan.mark_code : 'Mantenimiento creado directamente en Arias Suite'}</div>
              </section>

              {plan.description && (
                <section className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Descripción</div>
                  <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{plan.description}</div>
                </section>
              )}

              <button
                type="button"
                onClick={() => setTab('SCHEDULE')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Settings2 size={14} />
                Definir / modificar programación
              </button>
            </div>
          )}

          {tab === 'SCHEDULE' && (
            <form onSubmit={onSaveSchedule} className="space-y-4 p-4">
              <section className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">Empresa y servicio</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Empresa">
                    <select
                      value={scheduleDraft.provider_id}
                      onChange={(event) => setScheduleDraft((current) => ({ ...current, provider_id: event.target.value, provider_service_id: '' }))}
                      className="field"
                    >
                      <option value="">Sin empresa</option>
                      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Servicio">
                    <select
                      value={scheduleDraft.provider_service_id}
                      onChange={(event) => setScheduleDraft((current) => ({ ...current, provider_service_id: event.target.value }))}
                      className="field"
                      disabled={!scheduleDraft.provider_id}
                    >
                      <option value="">Sin servicio</option>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.service_name}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Referencia de contrato">
                    <input
                      value={scheduleDraft.contract_reference}
                      onChange={(event) => setScheduleDraft((current) => ({ ...current, contract_reference: event.target.value }))}
                      className="field"
                      placeholder="Contrato, expediente, pedido…"
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">Cuándo toca</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Próxima intervención">
                    <input type="date" value={scheduleDraft.next_due_date} onChange={(event) => setScheduleDraft((current) => ({ ...current, next_due_date: event.target.value }))} className="field" />
                  </Field>
                  <Field label="Fecha de referencia">
                    <input type="date" value={scheduleDraft.schedule_anchor_date} onChange={(event) => setScheduleDraft((current) => ({ ...current, schedule_anchor_date: event.target.value }))} className="field" />
                  </Field>
                  <Field label="Día del mes">
                    <input type="number" min="1" max="31" value={scheduleDraft.scheduled_day_of_month} onChange={(event) => setScheduleDraft((current) => ({ ...current, scheduled_day_of_month: event.target.value }))} className="field" placeholder="Ej. 15" />
                  </Field>
                  <Field label="Día de la semana">
                    <select value={scheduleDraft.scheduled_weekday} onChange={(event) => setScheduleDraft((current) => ({ ...current, scheduled_weekday: event.target.value }))} className="field">
                      <option value="">Sin definir</option>
                      <option value="1">Lunes</option>
                      <option value="2">Martes</option>
                      <option value="3">Miércoles</option>
                      <option value="4">Jueves</option>
                      <option value="5">Viernes</option>
                      <option value="6">Sábado</option>
                      <option value="7">Domingo</option>
                    </select>
                  </Field>
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[10px] text-slate-500">
                  Frecuencia heredada del PAM: <span className="font-semibold text-slate-700">{periodicityLabel(plan.periodicity_value, plan.periodicity_unit)}</span>. Aquí concretamos la programación sin volver a una matriz de 12 meses.
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">Reglas operativas</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Margen de tolerancia (días)">
                    <input type="number" min="0" value={scheduleDraft.tolerance_days} onChange={(event) => setScheduleDraft((current) => ({ ...current, tolerance_days: event.target.value }))} className="field" />
                  </Field>
                  <Field label="Aviso con antelación (días)">
                    <input type="number" min="0" value={scheduleDraft.alert_lead_days} onChange={(event) => setScheduleDraft((current) => ({ ...current, alert_lead_days: event.target.value }))} className="field" />
                  </Field>
                  <Field label="Duración prevista (min)">
                    <input type="number" min="1" value={scheduleDraft.visit_duration_minutes} onChange={(event) => setScheduleDraft((current) => ({ ...current, visit_duration_minutes: event.target.value }))} className="field" />
                  </Field>
                  <label className="flex items-center gap-2 pt-6 text-xs text-slate-700">
                    <input type="checkbox" checked={scheduleDraft.booking_required} onChange={(event) => setScheduleDraft((current) => ({ ...current, booking_required: event.target.checked }))} />
                    Requiere coordinar visita
                  </label>
                </div>

                <div className="mt-3">
                  <Field label="Observaciones de programación">
                    <textarea
                      value={scheduleDraft.schedule_notes}
                      onChange={(event) => setScheduleDraft((current) => ({ ...current, schedule_notes: event.target.value }))}
                      className="field min-h-[82px] resize-y"
                      placeholder="Horario habitual, acceso, aviso previo, persona de contacto, restricciones…"
                    />
                  </Field>
                </div>
              </section>

              <div className="flex justify-end">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                  <CheckCircle2 size={14} />
                  {saving ? 'Guardando…' : 'Guardar programación'}
                </button>
              </div>
            </form>
          )}

          {tab === 'CHECKLIST' && (
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-500">
                La antigua FICHA DE REVISIÓN se convierte aquí en una ficha digital. Los controles quedan separados del activo y podrán evolucionar por tipo de equipo.
              </div>

              {controls.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                  <ClipboardCheck className="mx-auto text-slate-300" size={28} />
                  <div className="mt-2 text-sm font-semibold text-slate-600">Checklist todavía no definido</div>
                  <div className="mt-1 text-xs text-slate-400">La estructura está preparada para incorporar los puntos de revisión reales.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {controls.map((control) => (
                    <div key={control.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{control.label}</div>
                          {control.description && <div className="mt-1 text-[10px] text-slate-500">{control.description}</div>}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">
                          {control.input_type}{control.unit ? ' · ' + control.unit : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'HISTORY' && (
            <div className="space-y-3 p-4">
              {executions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                  <History className="mx-auto text-slate-300" size={28} />
                  <div className="mt-2 text-sm font-semibold text-slate-600">Sin ejecuciones registradas</div>
                  <div className="mt-1 text-xs text-slate-400">Cada intervención quedará registrada aquí.</div>
                </div>
              ) : (
                executions.map((execution) => (
                  <div key={execution.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">{dateLabel(execution.executed_at || execution.scheduled_date)}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{execution.performer_company || execution.performer_name || 'Sin responsable registrado'}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">
                        {execution.result === 'COMPLETED' ? 'Conforme' : execution.result}
                      </span>
                    </div>
                    {execution.observations && <div className="mt-2 text-xs leading-5 text-slate-600">{execution.observations}</div>}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'ALERTS' && (
            <div className="space-y-4 p-4">
              <section className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-slate-500" />
                  <div className="text-sm font-semibold text-slate-800">Avisos automáticos</div>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">Aviso previo, aviso del día y aviso de vencimiento.</div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={alertConfig?.email_enabled ?? false}
                      onChange={(event) => setAlertConfig((current) => ({
                        id: current?.id ?? '',
                        email_enabled: event.target.checked,
                        days_before: current?.days_before ?? plan.alert_lead_days ?? 7,
                        notify_on_due: current?.notify_on_due ?? true,
                        notify_when_overdue: current?.notify_when_overdue ?? true,
                        overdue_repeat_days: current?.overdue_repeat_days ?? 2,
                      }))}
                    />
                    Enviar avisos por correo
                  </label>

                  <Field label="Antelación">
                    <input
                      type="number"
                      min="0"
                      value={alertConfig?.days_before ?? plan.alert_lead_days ?? 7}
                      onChange={(event) => setAlertConfig((current) => ({
                        id: current?.id ?? '',
                        email_enabled: current?.email_enabled ?? true,
                        days_before: Number(event.target.value) || 0,
                        notify_on_due: current?.notify_on_due ?? true,
                        notify_when_overdue: current?.notify_when_overdue ?? true,
                        overdue_repeat_days: current?.overdue_repeat_days ?? 2,
                      }))}
                      className="field"
                    />
                  </Field>

                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={alertConfig?.notify_on_due ?? true}
                      onChange={(event) => setAlertConfig((current) => ({
                        id: current?.id ?? '',
                        email_enabled: current?.email_enabled ?? true,
                        days_before: current?.days_before ?? plan.alert_lead_days ?? 7,
                        notify_on_due: event.target.checked,
                        notify_when_overdue: current?.notify_when_overdue ?? true,
                        overdue_repeat_days: current?.overdue_repeat_days ?? 2,
                      }))}
                    />
                    Avisar el día previsto
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={alertConfig?.notify_when_overdue ?? true}
                      onChange={(event) => setAlertConfig((current) => ({
                        id: current?.id ?? '',
                        email_enabled: current?.email_enabled ?? true,
                        days_before: current?.days_before ?? plan.alert_lead_days ?? 7,
                        notify_on_due: current?.notify_on_due ?? true,
                        notify_when_overdue: event.target.checked,
                        overdue_repeat_days: current?.overdue_repeat_days ?? 2,
                      }))}
                    />
                    Avisar si queda vencido
                  </label>

                  <Field label="Repetir aviso cada (días)">
                    <input
                      type="number"
                      min="1"
                      value={alertConfig?.overdue_repeat_days ?? 2}
                      onChange={(event) => setAlertConfig((current) => ({
                        id: current?.id ?? '',
                        email_enabled: current?.email_enabled ?? true,
                        days_before: current?.days_before ?? plan.alert_lead_days ?? 7,
                        notify_on_due: current?.notify_on_due ?? true,
                        notify_when_overdue: current?.notify_when_overdue ?? true,
                        overdue_repeat_days: Math.max(1, Number(event.target.value) || 1),
                      }))}
                      className="field"
                    />
                  </Field>
                </div>

                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => void onSaveAlerts()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                    <Bell size={14} />
                    {saving ? 'Guardando…' : 'Guardar avisos'}
                  </button>
                </div>
              </section>

              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Avisos generados</div>
                {alerts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">No hay avisos generados para este mantenimiento.</div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-800">{alert.title}</div>
                            <div className="mt-1 text-[10px] leading-4 text-slate-500">{alert.message}</div>
                          </div>
                          <span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ' + (alert.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>
                            {alert.severity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}
