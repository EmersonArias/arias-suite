import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { supabase } from '../../../lib/supabase'
import { ariasAuth } from '../../../core/auth/authService'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { planAccess } from '../../../shared/maintenance/preventiveSchedule'
import { useHotelDay } from '../../../shared/maintenance/useHotelDay'

type FrequencyKey =
  | 'DAILY'
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'BIMONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'ANNUAL'
  | 'OTHER'

type SourceGroup = {
  id: string
  source_row: number
  maintenance_name: string
}

type SourceMark = {
  source_row: number
  source_apparatus_id: number
  mark_code: string
  month_number: number
  week_slot: number
}

type Apparatus = {
  id: string
  source_id: number | null
  code: string
  name: string
  maintenance: string | null
}

type PlanLink = {
  maintenance_plan_id: string
  source_group_id: string
  source_apparatus_id: number
  mark_code: string
}

type Execution = {
  maintenance_plan_id: string
  executed_at: string | null
  result?: 'COMPLETED' | 'COMPLETED_WITH_ISSUES' | 'NOT_CONFORM' | 'CANCELLED'
}

type MaintenancePlan = {
  id: string
  apparatus_registry_id: string | null
  start_date: string | null
  next_due_date: string | null
  periodicity_value: number | null
  periodicity_unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'VARIABLE' | null
}

type PamWork = {
  sourceId: number
  apparatusId: string | null
  planId: string | null
  hotelCode: string
  name: string
  work: string
  periodicity: string
  nextRevision: string | null
  executor: string
  state:
    | 'Pendiente'
    | 'En curso'
    | 'Finalizado'
    | 'Revisada'
    | 'Revisada con incidencias'
    | 'No conforme'
    | 'No realizada'
    | 'Programada'
    | 'Pendiente hoy'
    | 'Vencida'
}

const dailyPamSourceIds = [
  8, 93,
  168, 169, 170, 171, 172,
  173, 174,
  175, 176, 177, 178, 179, 180,
  218, 224, 266, 298, 299, 332,
  264, 334,
  144, 145, 149, 335,
]

const dailyHotelAssetCodes: Record<number, string> = {
  8: 'COC-CAM-01',
  93: 'BMB-FIL-01',
  168: 'BMB-ACU-01',
  169: 'BMB-ACU-02',
  170: 'BMB-ACU-03',
  171: 'BMB-ACU-04',
  172: 'BMB-ACU-05',
  173: 'BT-BAT-01',
  174: 'BT-BAT-02',
  175: 'CLM-DST-02',
  176: 'CLM-DST-03',
  177: 'CLM-DST-04',
  178: 'CLM-DST-05',
  179: 'BMB-INT-01',
  180: 'BMB-INT-02',
  218: 'BMB-AFS-03',
  224: 'BMB-SEP-01',
  266: 'PIS-GEN-05',
  298: 'BT-GAS-01',
  299: 'ENE-AGU-01',
  332: 'LUM-SIG-01',
  264: 'PIS-GEN-04',
  334: 'PIS-EXT-01',
  144: 'PIS-GEN-01',
  145: 'BMB-BOM-01',
  149: 'PIS-CLT-01',
  335: 'PIS-SPA-01',
}

const frequencyCards: Array<{
  key: FrequencyKey
  label: string
  description: string
}> = [
  { key: 'DAILY', label: 'Diario', description: 'Activos atendidos diariamente' },
  { key: 'WEEKLY', label: 'Semanal', description: 'Pendiente de separar del PAM' },
  { key: 'FORTNIGHTLY', label: 'Quincenal', description: 'Trabajos cada dos semanas' },
  { key: 'MONTHLY', label: 'Mensual', description: 'Trabajos una vez al mes' },
  { key: 'BIMONTHLY', label: 'Bimensual', description: 'Trabajos cada dos meses' },
  { key: 'QUARTERLY', label: 'Trimestral', description: 'Trabajos cada tres meses' },
  { key: 'SEMIANNUAL', label: 'Semestral', description: 'Trabajos cada seis meses' },
  { key: 'ANNUAL', label: 'Anual', description: 'Trabajos una vez al año' },
  { key: 'OTHER', label: 'Otras', description: 'Frecuencias no clasificadas' },
]

const actionLabels: Record<string, string> = {
  DE: 'DOSIFICAR ENCIMAS',
  E: 'ENGRASE',
  EXT: 'MANTENIMIENTO EXTERNO',
  F: 'FICHA DE REVISION',
  L: 'LIMPIEZA',
  LF: 'LIMPIEZA DE FILTROS',
  RG: 'REVISION GENERAL',
  CP: 'CONTROL DE PRESIONES',
}


function formatDate(value: string | null) {
  if (!value) return 'Pendiente de planificar'
  return new Date(value + 'T12:00:00').toLocaleDateString('es-ES')
}

function actionLabel(code: string) {
  return actionLabels[code] ?? code
}

function executorLabel(value: string | null) {
  const normalized = value?.trim() ?? ''
  if (!normalized || normalized.toUpperCase() === 'SB HOTELS') return 'SSTT'
  return normalized
}

function frequencyFromPlan(plan: MaintenancePlan | null): FrequencyKey | null {
  if (!plan) return null
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

function deriveFrequency(
  sourceRow: number,
  marks: SourceMark[],
): FrequencyKey {
  const slots = Array.from(
    new Set(
      marks.map((mark) => ((mark.month_number - 1) * 4) + mark.week_slot),
    ),
  ).sort((a, b) => a - b)

  if (slots.length === 0) return 'OTHER'
  if (slots.length === 1) return 'ANNUAL'

  const deltas = slots.slice(1).map((slot, index) => slot - slots[index])
  const sameInterval = deltas.every((delta) => delta === deltas[0])

  if (!sameInterval) return 'OTHER'

  switch (deltas[0]) {
    case 2: return 'FORTNIGHTLY'
    case 4: return 'MONTHLY'
    case 8: return 'BIMONTHLY'
    case 12: return 'QUARTERLY'
    case 24: return 'SEMIANNUAL'
    case 48: return 'ANNUAL'
    default:
      return sourceRow > 18 ? 'OTHER' : 'OTHER'
  }
}

function uniqueWorks(
  rows: SourceMark[],
  apparatusBySourceId: Map<number, Apparatus>,
  periodicity: string,
  planIdByKey: Map<string, string>,
  nextRevisionByKey: Map<string, string | null>,
  stateByKey: Map<string, PamWork['state']>,
) {
  const works = new Map<string, PamWork>()

  for (const row of rows) {
    const apparatus = apparatusBySourceId.get(row.source_apparatus_id)
    const work = actionLabel(row.mark_code)
    const key = row.source_apparatus_id + '-' + work
    const planKey = row.source_row + '-' + row.source_apparatus_id + '-' + row.mark_code

    if (works.has(key)) continue

    works.set(key, {
      sourceId: row.source_apparatus_id,
      apparatusId: apparatus?.id ?? null,
      planId: planIdByKey.get(planKey) ?? null,
      hotelCode: apparatus?.code ?? dailyHotelAssetCodes[row.source_apparatus_id] ?? '—',
      name: apparatus?.name ?? 'Activo PAM sin equipo resuelto',
      work,
      periodicity,
      nextRevision: nextRevisionByKey.get(planKey) ?? null,
      executor: executorLabel(apparatus?.maintenance ?? null),
      state: stateByKey.get(planKey) ?? 'Pendiente',
    })
  }

  return Array.from(works.values()).sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId - b.sourceId
    return a.work.localeCompare(b.work, 'es')
  })
}

export default function MaintenancePamPage() {
  useHotelDay()
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const { confirm: showConfirm } = useSystemDialog()
  const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>([])
  const [sourceMarks, setSourceMarks] = useState<SourceMark[]>([])
  const [planLinks, setPlanLinks] = useState<PlanLink[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [apparatus, setApparatus] = useState<Apparatus[]>([])
  const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlan[]>([])
  const [selectedFrequency, setSelectedFrequency] = useState<FrequencyKey | null>(null)
  const [selectedWorkKey, setSelectedWorkKey] = useState('')
  const [checkingWorkKey, setCheckingWorkKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadPAM() {
    setLoading(true)
    setError('')

    if (!hotel?.id) {
      setError('No se ha seleccionado un hotel de trabajo.')
      setLoading(false)
      return
    }

    const hotelId = hotel.id

    const [groupsQuery, marksQuery, apparatusQuery, linksQuery, executionsQuery, plansQuery] = await Promise.all([
      supabase
        .from('pam_source_groups')
        .select('id, source_row, maintenance_name')
        .eq('hotel_id', hotelId)
        .eq('plan_year', 2026)
        .order('source_row'),
      supabase
        .from('pam_source_marks')
        .select('source_row, source_apparatus_id, mark_code, month_number, week_slot')
        .eq('hotel_id', hotelId)
        .eq('plan_year', 2026)
        .order('source_row')
        .order('source_apparatus_id'),
      supabase
        .from('apparatus_registry')
        .select('id, source_id, code, name, maintenance')
        .eq('hotel_id', hotelId)
        .eq('active', true)
        .order('source_id'),
      supabase
        .from('pam_maintenance_plan_links')
        .select('maintenance_plan_id, source_group_id, source_apparatus_id, mark_code')
        .eq('plan_year', 2026),
      supabase
        .from('maintenance_executions')
        .select('maintenance_plan_id, executed_at, result')
        .not('executed_at', 'is', null)
        .order('executed_at', { ascending: false }),
      supabase
        .from('maintenance_plans')
        .select('id, apparatus_registry_id, start_date, next_due_date, periodicity_value, periodicity_unit')
        .eq('active', true),
    ])

    const firstError =
      groupsQuery.error
      ?? marksQuery.error
      ?? apparatusQuery.error
      ?? linksQuery.error
      ?? executionsQuery.error
      ?? plansQuery.error

    if (firstError) {
      setError(firstError.message ?? 'No se ha podido cargar el PAM.')
      setLoading(false)
      return
    }

    setSourceGroups((groupsQuery.data ?? []) as unknown as SourceGroup[])
    setSourceMarks((marksQuery.data ?? []) as SourceMark[])
    setApparatus((apparatusQuery.data ?? []) as Apparatus[])
    setPlanLinks((linksQuery.data ?? []) as PlanLink[])
    setExecutions((executionsQuery.data ?? []) as Execution[])
    setMaintenancePlans((plansQuery.data ?? []) as MaintenancePlan[])
    setLoading(false)
  }

  useEffect(() => {
    void loadPAM()
  }, [hotel?.id])

  const frequencyWorks = useMemo(() => {
    const apparatusBySourceId = new Map<number, Apparatus>()
    apparatus.forEach((item) => {
      if (item.source_id !== null) apparatusBySourceId.set(item.source_id, item)
    })

    const sourceRowByGroupId = new Map<string, number>()
    sourceGroups.forEach((group) => sourceRowByGroupId.set(group.id, group.source_row))

    const planIdByKey = new Map<string, string>()
    planLinks.forEach((link) => {
      const sourceRow = sourceRowByGroupId.get(link.source_group_id)
      if (sourceRow === undefined) return
      const key = sourceRow + '-' + link.source_apparatus_id + '-' + link.mark_code
      if (!planIdByKey.has(key)) planIdByKey.set(key, link.maintenance_plan_id)
    })

    const planById = new Map<string, MaintenancePlan>()
    maintenancePlans.forEach((plan) => {
      planById.set(plan.id, plan)
    })

    const nextRevisionByKey = new Map<string, string | null>()
    planIdByKey.forEach((planId, key) => {
      nextRevisionByKey.set(key, planById.get(planId)?.next_due_date ?? planById.get(planId)?.start_date ?? null)
    })

    const stateByKey = new Map<string, PamWork['state']>()
    const executionsByPlan = new Map<string, Execution[]>()
    executions.forEach((execution) => {
      const rows = executionsByPlan.get(execution.maintenance_plan_id) ?? []
      rows.push(execution)
      executionsByPlan.set(execution.maintenance_plan_id, rows)
    })

    const today = new Date()
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10)

    planIdByKey.forEach((planId, key) => {
      const plan = planById.get(planId)
      const planExecutions = executionsByPlan.get(planId) ?? []
      const todayExecution = planExecutions.find((execution) => {
        if (!execution.executed_at || execution.result === 'CANCELLED') return false
        const executionDate = new Date(execution.executed_at)
        const localExecutionDate = new Date(
          executionDate.getTime() - executionDate.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 10)
        return localExecutionDate === localToday
      })

      if (todayExecution) {
        stateByKey.set(
          key,
          todayExecution.result === 'COMPLETED_WITH_ISSUES'
            ? 'Revisada con incidencias'
            : todayExecution.result === 'NOT_CONFORM'
              ? 'No conforme'
              : 'Revisada',
        )
        return
      }

      const nextRevision = plan?.next_due_date ?? plan?.start_date

      if (!nextRevision) {
        stateByKey.set(key, 'Pendiente')
      } else if (nextRevision < localToday) {
        stateByKey.set(key, 'Vencida')
      } else if (nextRevision === localToday) {
        stateByKey.set(key, 'Pendiente hoy')
      } else {
        stateByKey.set(key, 'Programada')
      }
    })

    const worksByFrequency = new Map<FrequencyKey, PamWork[]>()
    frequencyCards.forEach((card) => worksByFrequency.set(card.key, []))

    const dailyRows: SourceMark[] = [
      ...dailyPamSourceIds
        .filter((sourceId) => ![264, 334, 144, 145, 149, 335].includes(sourceId))
        .map((sourceId) => ({
          source_row: 6,
          source_apparatus_id: sourceId,
          mark_code: 'F',
          month_number: 0,
          week_slot: 0,
        })),
      ...[264, 334].map((sourceId) => ({
        source_row: 7,
        source_apparatus_id: sourceId,
        mark_code: 'F',
        month_number: 0,
        week_slot: 0,
      })),
      ...[144, 145, 149, 335].map((sourceId) => ({
        source_row: 8,
        source_apparatus_id: sourceId,
        mark_code: 'F',
        month_number: 0,
        week_slot: 0,
      })),
    ]

    const dailyWorks = uniqueWorks(
      dailyRows,
      apparatusBySourceId,
      'Diario',
      planIdByKey,
      nextRevisionByKey,
      stateByKey,
    ).filter((work) => {
      if (!work.planId) return true
      return frequencyFromPlan(planById.get(work.planId) ?? null) === 'DAILY'
    })

    worksByFrequency.set('DAILY', dailyWorks)

    const rowsForPlanning = sourceGroups.filter((group) => group.source_row >= 19)

    for (const group of rowsForPlanning) {
      const groupMarks = sourceMarks.filter((mark) => mark.source_row === group.source_row)
      const actionCodes = Array.from(new Set(groupMarks.map((mark) => mark.mark_code)))

      for (const code of actionCodes) {
        const actionMarks = groupMarks.filter((mark) => mark.mark_code === code)
        const frequency = deriveFrequency(group.source_row, actionMarks)
        const existing = worksByFrequency.get(frequency) ?? []
        const generated = uniqueWorks(
          actionMarks,
          apparatusBySourceId,
          frequencyCards.find((card) => card.key === frequency)?.label ?? 'Otras',
          planIdByKey,
          nextRevisionByKey,
          stateByKey,
        )

        worksByFrequency.set(
          frequency,
          Array.from(
            new Map(
              existing
                .concat(generated)
                .map((work) => [work.sourceId + '-' + work.work, work] as const),
            ).values(),
          ).sort((a, b) => a.sourceId - b.sourceId),
        )
      }
    }

    worksByFrequency.set('WEEKLY', [])

    return worksByFrequency
  }, [sourceGroups, sourceMarks, apparatus, planLinks, executions, maintenancePlans])

  const normalizedSearch = search.trim().toLocaleLowerCase('es')

  const visibleFrequencyWorks = useMemo(() => {
    const filtered = new Map<FrequencyKey, PamWork[]>()

    frequencyCards.forEach((card) => {
      const works = frequencyWorks.get(card.key) ?? []
      filtered.set(
        card.key,
        !normalizedSearch
          ? works
          : works.filter((work) =>
              [
                String(work.sourceId),
                work.hotelCode,
                work.name,
                work.work,
                work.executor,
              ]
                .join(' ')
                .toLocaleLowerCase('es')
                .includes(normalizedSearch),
            ),
      )
    })

    return filtered
  }, [frequencyWorks, normalizedSearch])

  const selectedWorks = selectedFrequency
    ? visibleFrequencyWorks.get(selectedFrequency) ?? []
    : []

  const selectedLabel =
    frequencyCards.find((card) => card.key === selectedFrequency)?.label ?? ''

  function reviewAccess(work: PamWork) {
    const plan = maintenancePlans.find(p => p.id === work.planId)
    return planAccess(plan ? { ...plan, active: true } : null)
  }
  async function markWorkCompleted(work: PamWork) {
    const key = `${work.sourceId}-${work.work}`
    if (!work.planId || checkingWorkKey === key || work.state === 'Revisada') return
    const access = reviewAccess(work)
    if (!access.allowed) { setError(access.message); return }

    const confirmed = await showConfirm({
      title: 'Marcar revisión como realizada',
      message: `¿Quieres marcar como revisado el mantenimiento de ${work.name} (${work.hotelCode})?`,
      variant: 'info',
      confirmLabel: 'Sí, revisar',
      cancelLabel: 'Cancelar',
    })

    if (!confirmed) return

    setCheckingWorkKey(key)
    setError('')

    try {
      const { data: sessionData } = await ariasAuth.getSession()
      const sessionUser = sessionData?.user ?? null
      const userId = sessionUser?.id ?? null
      const performerName =
        sessionUser?.fullName?.trim() ||
        sessionUser?.loginIdentifier?.trim() ||
        sessionUser?.email?.trim() ||
        null

      if (!userId) {
        setError('No se ha podido identificar al usuario de la sesión.')
        return
      }

      const openWorkOrderQuery = await supabase
        .from('maintenance_work_orders')
        .select('id, scheduled_date')
        .eq('maintenance_plan_id', work.planId)
        .in('status', ['PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS'])
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (openWorkOrderQuery.error) {
        setError(openWorkOrderQuery.error.message)
        return
      }

      const scheduledDate =
        (openWorkOrderQuery.data?.scheduled_date as string | null | undefined) ??
        new Date().toISOString().slice(0, 10)

      const insertResult = await supabase
        .from('maintenance_executions')
        .insert({
          maintenance_plan_id: work.planId,
          work_order_id: openWorkOrderQuery.data?.id ?? null,
          scheduled_date: scheduledDate,
          executed_at: new Date().toISOString(),
          executed_by: userId,
          performer_name: performerName,
          performer_company: work.executor || null,
          result: 'COMPLETED',
          observations: null,
        })

      if (insertResult.error) {
        setError(insertResult.error.message)
        return
      }

      await loadPAM()
    } finally {
      setCheckingWorkKey(null)
    }
  }



  const gridIds = useMemo(
    () => selectedWorks.map((work) => `${work.sourceId}-${work.work}`),
    [selectedWorks],
  )

  const {
    currentIndex,
    moveSelection,
    getGridProps,
    getRowProps,
  } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId: selectedWorkKey,
    onSelectedIdChange: setSelectedWorkKey,
    onOpen: (id) => {
      const work = selectedWorks.find(
        (candidate) => `${candidate.sourceId}-${candidate.work}` === id,
      )
      if (!work?.apparatusId) return
      const query = work.planId
        ? '?planId=' + encodeURIComponent(work.planId) + '&frequency=DAILY'
        : '?frequency=DAILY'
      navigate('/maintenance/pam/' + work.apparatusId + query)
    },
    autoFocusFirst: true,
  })

  const frequencyCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    frequencyCards.forEach((card) => {
      const works = frequencyWorks.get(card.key) ?? []
      counts[card.key] = new Set(works.map((work) => work.sourceId)).size
    })
    return counts
  }, [frequencyWorks])

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-lg sm:p-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo onActivate={() => navigate('/')} className="h-8 w-auto shrink-0 object-contain sm:h-10" />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-none sm:text-2xl">PAM</h1>
                <p className="text-[11px] text-slate-500 sm:text-xs">Plan Anual de Mantenimiento</p>
              </div>
            </div>
            <div className="arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto">
              <BackButton onBack={() => navigate('/maintenance')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
            <div className="hidden items-center justify-center gap-2 px-2 lg:flex">
              <CalendarDays className="shrink-0 text-slate-500" size={17} />
              <span className="text-sm font-semibold text-slate-800">Previsión de trabajos preventivos</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-center gap-2 lg:hidden">
            <CalendarDays className="shrink-0 text-slate-500" size={16} />
            <span className="text-xs font-semibold text-slate-800">Previsión de trabajos preventivos</span>
          </div>
        </header>

        <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buscar en PAM</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Busca por ID, código de activo, equipo, trabajo o empresa…"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              aria-label="Buscar en PAM"
            />
          </label>
        </section>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        )}

        <section className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {frequencyCards.map((card) => {
            const selected = selectedFrequency === card.key
            const count = normalizedSearch
              ? new Set((visibleFrequencyWorks.get(card.key) ?? []).map((work) => work.sourceId)).size
              : frequencyCounts[card.key] ?? 0

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setSelectedFrequency(selected ? null : card.key)}
                className={`rounded-lg border p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-tight text-slate-900">{card.label}</div>
                    <div className="mt-0.5 text-[10px] leading-3.5 text-slate-500">{card.description}</div>
                  </div>
                  <div className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-sm font-bold text-slate-800">
                    {count}
                  </div>
                </div>
                <div className="mt-1 text-[10px] font-semibold leading-3 text-slate-500">
                  {card.key === 'WEEKLY' && count === 0
                    ? normalizedSearch ? 'Sin coincidencias' : 'Pendiente de revisión'
                    : count === 1 ? '1 activo' : `${count} activos`}
                </div>
              </button>
            )
          })}
        </section>

        {selectedFrequency && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{selectedLabel}</div>
                <div className="text-[10px] text-slate-500">
                  {loading ? 'Cargando…' : `${selectedWorks.length} trabajos · ${new Set(selectedWorks.map((work) => work.sourceId)).size} activos`}
                </div>
              </div>

              <IconButton icon={RefreshCw} label="Actualizar" onClick={() => void loadPAM()} />
            </div>

            <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
              <GridViewport className="max-h-[calc(100vh-460px)] min-h-[240px]">
              <table className="w-full min-w-[860px] border-collapse text-[12px]">
                <colgroup>
                  <col className="w-[12%]" />
                  <col className="w-[29%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[9%]" />
                  <col className="w-[6%]" />
                  <col className="w-[5%]" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1.5 font-semibold">ID</th>
                    <th className="px-2 py-1.5 font-semibold">Activo</th>
                    <th className="px-2 py-1.5 font-semibold">Trabajo</th>
                    <th className="px-2 py-1.5 font-semibold">Próxima revisión</th>
                    <th className="px-3 py-2 font-semibold">Ejecutor</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-2 py-2 text-center font-semibold">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                        Cargando trabajos preventivos…
                      </td>
                    </tr>
                  ) : selectedWorks.map((work) => (
                    <tr
                      key={`${work.sourceId}-${work.work}`}
                      {...getRowProps(`${work.sourceId}-${work.work}`)}
                      onClick={() => {
                        if (work.apparatusId) {
                          const query = work.planId
                            ? '?planId=' + encodeURIComponent(work.planId) + '&frequency=DAILY'
                            : '?frequency=DAILY'
                          navigate('/maintenance/pam/' + work.apparatusId + query)
                        }
                      }}
                      className={`cursor-pointer border-b border-slate-100 outline-none hover:bg-blue-50/40 ${selectedWorkKey === `${work.sourceId}-${work.work}` ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-2 py-1 font-semibold text-slate-900">{work.hotelCode}</td>
                      <td className="px-2 py-1 text-slate-700">{work.name}</td>
                      <td className="px-2 py-1 font-medium text-slate-800">{work.work}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-slate-700">
                        {work.nextRevision
                          ? formatDate(work.nextRevision)
                          : 'Pendiente de primera revisión'}
                        {!reviewAccess(work).allowed && <span className="mt-1 block max-w-56 whitespace-normal text-[10px] text-sky-800">{reviewAccess(work).message}</span>}
                      </td>
                      <td className="px-2 py-1 font-medium text-slate-700">{work.executor}</td>
                      <td className="px-2 py-1">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          work.state === 'Programada'
                            ? 'bg-emerald-100 text-emerald-700'
                            : work.state === 'Pendiente hoy'
                              ? 'bg-amber-100 text-amber-700'
                              : work.state === 'Vencida'
                                ? 'bg-rose-100 text-rose-700'
                                : work.state === 'Revisada con incidencias'
                                  ? 'bg-amber-100 text-amber-700'
                                  : work.state === 'No conforme'
                                    ? 'bg-rose-100 text-rose-700'
                                    : work.state === 'No realizada'
                                      ? 'bg-slate-200 text-slate-700'
                                      : 'bg-amber-100 text-amber-700'
                        }`}>
                          {work.state}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={work.state === 'Revisada'}
                          disabled={!reviewAccess(work).allowed || work.state === 'Revisada' || checkingWorkKey === `${work.sourceId}-${work.work}`}
                          title={reviewAccess(work).message}
                          onChange={() => void markWorkCompleted(work)}
                          aria-label={work.state === 'Revisada' ? 'Revisada' : 'Marcar como revisada'}
                          className="h-5 w-5 cursor-pointer rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  ))}

                  {!loading && selectedWorks.length === 0 && (
                    <tr>
                      <td colSpan={8} className="border-dashed px-4 py-10 text-center text-sm text-slate-500">
                        No hay trabajos definidos para esta frecuencia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </GridViewport>
              <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                <span className="text-[11px] text-slate-500">
                  {selectedWorks.length === 0 ? 'Sin trabajos' : `${currentIndex + 1} / ${selectedWorks.length}`}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton icon={ChevronUp} label="Trabajo anterior" title="Anterior" onClick={() => moveSelection(currentIndex - 1)} disabled={selectedWorks.length === 0 || currentIndex === 0} className="h-9 w-9" />
                  <IconButton icon={ChevronDown} label="Trabajo siguiente" title="Siguiente" onClick={() => moveSelection(currentIndex + 1)} disabled={selectedWorks.length === 0 || currentIndex === selectedWorks.length - 1} className="h-9 w-9" />
                </div>
              </div>
            </div>
          </section>
        )}

        {!selectedFrequency && !loading && (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
            Selecciona una frecuencia para ver los trabajos preventivos y los activos que deben atenderse.
          </section>
        )}
      </div>
    </div>
  )
}
