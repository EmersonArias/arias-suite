import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, TicketCheck } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'

type FrequencyFilter =
  | 'ALL'
  | 'DAILY'
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'BIMONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL'
  | 'OTHER'

type PlanningState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'

type ScheduledJob = {
  id: string
  hotel_id: string
  maintenance_plan_id: string
  source_mark_id: string | null
  plan_year: number
  month_number: number
  week_slot: number
  scheduled_date: string | null
  status: string | null
}

type MaintenancePlan = {
  id: string
  name: string
  description: string | null
  maintenance_type: 'INTERNAL' | 'EXTERNAL'
  apparatus_registry_id: string | null
  periodicity_value: number | null
  periodicity_unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'VARIABLE' | null
}

type Apparatus = {
  id: string
  code: string | null
  name: string | null
  plant: string | null
  location: string | null
}

type WorkOrder = {
  id: string
  scheduled_job_id: string | null
  maintenance_plan_id: string | null
  status: 'PENDING' | 'IN_MANAGEMENT' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
  ot_number: string
  assigned_user_name: string | null
}

type PlanningRow = ScheduledJob & {
  plan: MaintenancePlan | null
  apparatus: Apparatus | null
  workOrder: WorkOrder | null
  state: PlanningState
}

const monthLabels = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const frequencyOptions: Array<{ value: FrequencyFilter; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'DAILY', label: 'Diario' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'FORTNIGHTLY', label: 'Quincenal' },
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'BIMONTHLY', label: 'Bimensual' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
  { value: 'OTHER', label: 'Otras' },
]

function frequencyFromPlan(plan: MaintenancePlan | null): FrequencyFilter {
  if (!plan?.periodicity_unit || !plan.periodicity_value) return 'OTHER'
  if (plan.periodicity_unit === 'DAY' && plan.periodicity_value === 1) return 'DAILY'
  if (plan.periodicity_unit === 'WEEK' && plan.periodicity_value === 1) return 'WEEKLY'
  if (plan.periodicity_unit === 'WEEK' && plan.periodicity_value === 2) return 'FORTNIGHTLY'
  if (plan.periodicity_unit === 'MONTH' && plan.periodicity_value === 1) return 'MONTHLY'
  if (plan.periodicity_unit === 'MONTH' && plan.periodicity_value === 2) return 'BIMONTHLY'
  if (plan.periodicity_unit === 'MONTH' && plan.periodicity_value === 3) return 'QUARTERLY'
  if (plan.periodicity_unit === 'MONTH' && plan.periodicity_value === 6) return 'SEMIANNUAL'
  if (plan.periodicity_unit === 'YEAR' && plan.periodicity_value === 1) return 'ANNUAL'
  return 'OTHER'
}

function frequencyLabel(plan: MaintenancePlan | null) {
  return frequencyOptions.find((item) => item.value === frequencyFromPlan(plan))?.label ?? 'Otras'
}

function stateLabel(state: PlanningState) {
  if (state === 'COMPLETED') return 'Finalizado'
  if (state === 'IN_PROGRESS') return 'En curso'
  return 'Pendiente'
}

function stateClass(state: PlanningState) {
  if (state === 'COMPLETED') return 'bg-emerald-100 text-emerald-700'
  if (state === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700'
  return 'bg-amber-100 text-amber-700'
}

function deriveState(job: ScheduledJob, workOrder: WorkOrder | null): PlanningState {
  if (workOrder?.status === 'COMPLETED' || job.status === 'COMPLETED') return 'COMPLETED'
  if (workOrder?.status === 'IN_MANAGEMENT' || workOrder?.status === 'IN_PROGRESS' || job.status === 'IN_PROGRESS') {
    return 'IN_PROGRESS'
  }
  return 'PENDING'
}

function localTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value + 'T12:00:00').toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
  })
}

function weekday(value: string | null) {
  if (!value) return '—'
  return new Date(value + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' })
}

export default function MaintenancePlanningPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hotel } = useHotelScope()
  const currentYear = new Date().getFullYear()

  const [year, setYear] = useState<number | 'ALL'>(currentYear)
  const [summaryFilter, setSummaryFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE'>('ALL')
  const [month, setMonth] = useState('ALL')
  const [frequency, setFrequency] = useState<FrequencyFilter>('ALL')
  const [state, setState] = useState<'ALL' | PlanningState>('ALL')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<PlanningRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadRequestRef = useRef(0)

  async function loadPlanning() {
    const requestId = ++loadRequestRef.current
    if (!hotel?.id) {
      setRows([])
      setSelectedId('')
      setError('No se ha seleccionado un hotel de trabajo.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    let jobsQuery = supabase
      .from('maintenance_scheduled_jobs')
      .select('id, hotel_id, maintenance_plan_id, source_mark_id, plan_year, month_number, week_slot, scheduled_date, status')
      .eq('hotel_id', hotel.id)
    if (year !== 'ALL') jobsQuery = jobsQuery.eq('plan_year', year)
    if (summaryFilter === 'OVERDUE') jobsQuery = jobsQuery.lt('scheduled_date', localTodayISO())
    if (summaryFilter === 'PENDING') jobsQuery = jobsQuery.or(`scheduled_date.is.null,scheduled_date.gte.${localTodayISO()}`)
    const jobsResult = await jobsQuery
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('month_number', { ascending: true })
      .order('week_slot', { ascending: true })

    if (requestId !== loadRequestRef.current) return
    if (jobsResult.error) {
      setRows([])
      setSelectedId('')
      setError(jobsResult.error.message)
      setLoading(false)
      return
    }

    const jobs = (jobsResult.data ?? []) as ScheduledJob[]

    // Load the hotel's active plans by hotel scope instead of a long .in(id, ...)
    // list: large query strings can trigger HTTP 400 / "Bad Request" in PostgREST.
    let plansQuery = supabase
      .from('maintenance_plans')
      .select('id, name, description, maintenance_type, apparatus_registry_id, periodicity_value, periodicity_unit')
      .eq('hotel_id', hotel.id)
    if (summaryFilter === 'ALL') plansQuery = plansQuery.eq('active', true)
    const plansResult = jobs.length ? await plansQuery : { data: [], error: null }

    if (requestId !== loadRequestRef.current) return
    if (plansResult.error) {
      setRows([])
      setSelectedId('')
      setError(plansResult.error.message)
      setLoading(false)
      return
    }

    const plans = (plansResult.data ?? []) as MaintenancePlan[]
    const planById = new Map(plans.map((plan) => [plan.id, plan]))

    // The hotel filter keeps this query scoped and avoids another large .in list.
    const apparatusResult = plans.length
      ? await supabase
          .from('apparatus_registry')
          .select('id, code, name, plant, location')
          .eq('hotel_id', hotel.id)
      : { data: [], error: null }

    if (requestId !== loadRequestRef.current) return
    if (apparatusResult.error) {
      setRows([])
      setSelectedId('')
      setError(apparatusResult.error.message)
      setLoading(false)
      return
    }

    const apparatusById = new Map(
      ((apparatusResult.data ?? []) as Apparatus[]).map((item) => [item.id, item]),
    )

    // The resolved view exposes plan_year through its scheduled-job join. Filtering
    // by hotel/year replaces the oversized 1,900+ UUID URL that caused HTTP 400.
    let workOrdersQuery = supabase
      .from('maintenance_work_orders_resolved')
      .select('id, scheduled_job_id, maintenance_plan_id, status, ot_number, assigned_user_name')
      .eq('hotel_id', hotel.id)
    if (year !== 'ALL') workOrdersQuery = workOrdersQuery.eq('plan_year', year)
    const workOrdersResult = jobs.length
      ? await workOrdersQuery
      : { data: [], error: null }

    if (requestId !== loadRequestRef.current) return
    if (workOrdersResult.error) {
      setRows([])
      setSelectedId('')
      setError(workOrdersResult.error.message)
      setLoading(false)
      return
    }

    const workOrderByJobId = new Map<string, WorkOrder>()
    for (const item of (workOrdersResult.data ?? []) as WorkOrder[]) {
      if (item.scheduled_job_id && !workOrderByJobId.has(item.scheduled_job_id)) {
        workOrderByJobId.set(item.scheduled_job_id, item)
      }
    }

    const loadedRows = jobs
      .map((job) => {
        const plan = planById.get(job.maintenance_plan_id) ?? null
        const workOrder = workOrderByJobId.get(job.id) ?? null
        return {
          ...job,
          plan,
          apparatus: plan?.apparatus_registry_id ? apparatusById.get(plan.apparatus_registry_id) ?? null : null,
          workOrder,
          state: deriveState(job, workOrder),
        }
      })
      .filter((row) => row.plan !== null)

    setRows(loadedRows)
    setSelectedId((current) => loadedRows.some((row) => row.id === current) ? current : (loadedRows[0]?.id ?? ''))
    setLoading(false)
  }

  useEffect(() => {
    const requestedSummary = searchParams.get('summary')
    if (requestedSummary === 'PENDING' || requestedSummary === 'OVERDUE') {
      setSummaryFilter(requestedSummary)
      setYear('ALL')
      setMonth('ALL')
      setFrequency('ALL')
      setSearch('')
      setState(requestedSummary === 'PENDING' ? 'PENDING' : 'ALL')
    } else {
      setSummaryFilter('ALL')
    }
  }, [searchParams])

  useEffect(() => {
    void loadPlanning()
  }, [hotel?.id, year, summaryFilter])

  const normalizedSearch = search.trim().toLocaleLowerCase('es')

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (month !== 'ALL' && row.month_number !== Number(month)) return false
      if (frequency !== 'ALL' && frequencyFromPlan(row.plan) !== frequency) return false
      if (state !== 'ALL' && row.state !== state) return false
      if (summaryFilter === 'PENDING' && (row.workOrder?.status !== 'PENDING' || (row.scheduled_date !== null && row.scheduled_date < localTodayISO()))) return false
      if (summaryFilter === 'OVERDUE') {
        const openWorkOrder = row.workOrder && ['PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS'].includes(row.workOrder.status)
        if (!openWorkOrder || !row.scheduled_date || row.scheduled_date >= localTodayISO()) return false
      }
      if (!normalizedSearch) return true

      const haystack = [
        row.scheduled_date,
        row.plan?.name,
        row.apparatus?.code,
        row.apparatus?.name,
        row.apparatus?.plant,
        row.apparatus?.location,
        row.workOrder?.ot_number,
        row.workOrder?.assigned_user_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')

      return haystack.includes(normalizedSearch)
    })
  }, [rows, month, frequency, state, summaryFilter, normalizedSearch])

  const selected = filteredRows.find((row) => row.id === selectedId) ?? null

  const gridIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows])

  const { currentIndex, moveSelection, getGridProps, getRowProps } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId,
    onSelectedIdChange: setSelectedId,
    onOpen: (id) => {
      const row = filteredRows.find((item) => item.id === id)
      if (row?.workOrder?.id) {
        const returnTo = `/maintenance/planning${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
        navigate('/maintenance/tickets/' + row.workOrder.id, { state: { returnTo } })
      }
    },
    autoFocusFirst: true,
  })

  function clearFilters() {
    setMonth('ALL')
    setFrequency('ALL')
    setState('ALL')
    setSearch('')
    setSummaryFilter('ALL')
    setYear(currentYear)
    setSearchParams({}, { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="maintenance-planning-header-layout">
            <div className="maintenance-planning-title flex min-w-0 items-center gap-2">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight sm:text-2xl">{summaryFilter === 'PENDING' ? 'Preventivos pendientes' : summaryFilter === 'OVERDUE' ? 'Preventivos atrasados' : 'Planificación'}</h1>
                <p className="text-xs text-slate-500 sm:text-sm">{summaryFilter === 'OVERDUE' ? `${year === 'ALL' ? 'Todos los años' : year} · trabajos fuera de fecha todavía sin finalizar` : summaryFilter === 'PENDING' ? `${year === 'ALL' ? 'Todos los años' : year} · órdenes preventivas pendientes de atención` : 'Trabajos programados derivados del PAM'}</p>
              </div>
            </div>
            <div className="maintenance-planning-toolbar arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto">
              <IconButton icon={RefreshCw} label="Actualizar" title="Actualizar" onClick={() => void loadPlanning()} disabled={loading} />
              <BackButton onBack={() => navigate('/maintenance')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[120px_180px_180px_180px_minmax(0,1fr)]">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Año</span>
              <select
                value={year === 'ALL' ? 'ALL' : String(year)}
                onChange={(event) => setYear(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todos los años</option>
                {[currentYear - 1, currentYear, currentYear + 1].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mes</span>
              <select
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todos</option>
                {monthLabels.map((label, index) => (
                  <option key={index + 1} value={index + 1}>{label}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Periodicidad</span>
              <select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as FrequencyFilter)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
              <select
                value={state}
                onChange={(event) => setState(event.target.value as typeof state)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="IN_PROGRESS">En curso</option>
                <option value="COMPLETED">Finalizado</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Equipo, mantenimiento, ticket, responsable…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              />
            </label>
          </div>

          {(summaryFilter !== 'ALL' || year === 'ALL' || month !== 'ALL' || frequency !== 'ALL' || state !== 'ALL' || search) && (
            <div className="mt-3 flex justify-end">
              <ActionButton label="Limpiar filtros" onClick={clearFilters} className="min-h-9 px-3 py-1.5 text-xs" />
            </div>
          )}
        </section>

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.5fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{summaryFilter === 'PENDING' ? 'Órdenes preventivas pendientes' : summaryFilter === 'OVERDUE' ? 'Órdenes preventivas atrasadas' : 'Trabajos programados'}</div>
                <div className="text-xs text-slate-400">PAM → planificación → ejecución · {year === 'ALL' ? 'todos los años' : year}</div>
              </div>
              <span className="text-xs text-slate-500">{filteredRows.length} resultado{filteredRows.length === 1 ? '' : 's'}</span>
            </div>

            <GridViewport className="max-h-[calc(100vh-390px)]">
              <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
              <table className="min-w-[1080px] w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5">Día</th>
                    <th className="px-3 py-2.5">Semana</th>
                    <th className="px-3 py-2.5">Mes</th>
                    <th className="px-3 py-2.5">Equipo</th>
                    <th className="px-3 py-2.5">Mantenimiento</th>
                    <th className="px-3 py-2.5">Periodicidad</th>
                    <th className="px-3 py-2.5">Estado</th>
                    <th className="px-3 py-2.5">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isSelected = row.id === selectedId
                    const rowProps = getRowProps(row.id)
                    return (
                      <tr
                        key={row.id}
                        {...rowProps}
                        className={`border-b last:border-b-0 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        onClick={() => setSelectedId(row.id)}
                        onDoubleClick={() => {
                          if (row.workOrder?.id) {
                            const returnTo = `/maintenance/planning${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
                            navigate('/maintenance/tickets/' + row.workOrder.id, { state: { returnTo } })
                          }
                        }}
                      >
                        <td className="px-2 py-1.5 font-semibold text-slate-800">
                          <div>{weekday(row.scheduled_date)}</div>
                          <div className="text-xs font-normal text-slate-400">{formatDate(row.scheduled_date)}</div>
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">S{row.week_slot || '—'}</td>
                        <td className="px-2 py-1.5 text-slate-600">{monthLabels[row.month_number - 1] ?? '—'}</td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-slate-800">{row.apparatus?.code ?? '—'}</div>
                          <div className="text-xs text-slate-500">{row.apparatus?.name ?? 'Equipo sin resolver'}</div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="max-w-[320px] font-semibold text-slate-800">{row.plan?.name ?? '—'}</div>
                          {row.plan?.maintenance_type && (
                            <div className="text-xs text-slate-400">
                              {row.plan.maintenance_type === 'EXTERNAL' ? 'Externo' : 'Interno'}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{frequencyLabel(row.plan)}</td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateClass(row.state)}`}>
                            {stateLabel(row.state)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          {row.workOrder ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                const returnTo = `/maintenance/planning${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
                                navigate('/maintenance/tickets/' + row.workOrder!.id, { state: { returnTo } })
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <TicketCheck size={14} />
                              {row.workOrder.ot_number}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Sin ticket</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {!loading && filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-xs text-slate-500">No hay trabajos programados para estos filtros.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </GridViewport>

            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
              <span className="text-[11px] text-slate-500">
                {filteredRows.length === 0 ? 'Sin trabajos' : `${currentIndex + 1} / ${filteredRows.length}`}
              </span>
              <div className="flex items-center gap-1">
                <IconButton
                  icon={ChevronUp}
                  label="Trabajo anterior"
                  title="Trabajo anterior"
                  onClick={() => moveSelection(currentIndex - 1)}
                  disabled={filteredRows.length === 0 || currentIndex === 0}
                  className="h-9 w-9"
                />
                <IconButton
                  icon={ChevronDown}
                  label="Trabajo siguiente"
                  title="Trabajo siguiente"
                  onClick={() => moveSelection(currentIndex + 1)}
                  disabled={filteredRows.length === 0 || currentIndex === filteredRows.length - 1}
                  className="h-9 w-9"
                />
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b px-4 py-3 text-sm font-semibold">Detalle del trabajo programado</div>
            {selected ? (
              <div className="space-y-4 p-4">
                <div>
                  <div className="text-xl font-bold text-slate-900">{selected.plan?.name ?? 'Trabajo programado'}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {selected.apparatus?.code ?? '—'} · {selected.apparatus?.name ?? 'Equipo sin resolver'}
                  </div>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateClass(selected.state)}`}>
                    {stateLabel(selected.state)}
                  </span>
                </div>

                <div className="grid gap-2 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                  <div><strong>Fecha:</strong> {selected.scheduled_date ? new Date(selected.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES') : '—'}</div>
                  <div><strong>Semana PAM:</strong> {selected.week_slot ? `S${selected.week_slot}` : '—'}</div>
                  <div><strong>Periodicidad:</strong> {frequencyLabel(selected.plan)}</div>
                  <div><strong>Ubicación:</strong> {[selected.apparatus?.plant, selected.apparatus?.location].filter(Boolean).join(' · ') || '—'}</div>
                </div>

                {selected.plan?.description && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Trabajo</div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.plan.description}</div>
                  </div>
                )}

                {selected.workOrder ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Ticket relacionado</div>
                    <div className="mt-1 text-sm font-bold text-slate-900">{selected.workOrder.ot_number}</div>
                    <div className="mt-1 text-xs text-slate-500">Asignado: {selected.workOrder.assigned_user_name ?? 'Sin asignar'}</div>
                    <ActionButton
                      icon={TicketCheck}
                      label="Abrir ticket"
                      onClick={() => navigate('/maintenance/tickets/' + selected.workOrder!.id)}
                      className="mt-3 text-xs"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                    Este trabajo está programado pero todavía no tiene un ticket operativo asociado.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">Selecciona un trabajo programado.</div>
            )}
          </aside>
        </main>
      </div>
    </div>
  )
}
