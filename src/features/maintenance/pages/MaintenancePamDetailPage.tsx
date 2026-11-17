import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock3, History, Save, XCircle } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import FormActions, { type FormMode } from '../../../shared/components/forms/FormActions'
import UnsavedChangesDialog from '../../../shared/components/navigation/UnsavedChangesDialog'
import { useEscapeAsCancel } from '../../../shared/hooks/useEscapeAsCancel'
import { useGuardedNavigation } from '../../../shared/hooks/useGuardedNavigation'
import { supabase } from '../../../lib/supabase'
import { ariasAuth } from '../../../core/auth/authService'
import { hotelDay, planAccess } from '../../../shared/maintenance/preventiveSchedule'
import { useHotelDay } from '../../../shared/maintenance/useHotelDay'

type Asset = {
  id: string
  source_id: number | null
  code: string
  name: string
  plant: string | null
  location: string | null
  maintenance: string | null
  active: boolean
}

type Plan = {
  id: string
  code: string | null
  name: string
  description: string | null
  maintenance_type: 'INTERNAL' | 'EXTERNAL'
  external_company: string | null
  periodicity_value: number | null
  periodicity_unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'VARIABLE' | null
  start_date: string | null
  next_due_date: string | null
  scheduled_day_of_month: number | null
  scheduled_weekday: number | null
  tolerance_days: number
  alert_lead_days: number
  booking_required: boolean
  visit_duration_minutes: number | null
  schedule_notes: string | null
  active: boolean
}

type Execution = {
  id: string
  work_order_id: string | null
  scheduled_date: string | null
  executed_at: string | null
  result: 'COMPLETED' | 'COMPLETED_WITH_ISSUES' | 'NOT_CONFORM' | 'CANCELLED'
  performer_name: string | null
  performer_company: string | null
  observations: string | null
}

type WorkOrder = {
  id: string
  ot_number: string
  scheduled_date: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  generation_mode: 'AUTO' | 'MANUAL'
  completion_timing: 'ON_TIME' | 'OUT_OF_DATE' | null
}

const hotelAssetCodes: Record<number, string> = {
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

const periodicityOptions = [
  { key: 'DAILY', label: 'Diario', value: 1, unit: 'DAY' as const },
  { key: 'WEEKLY', label: 'Semanal', value: 1, unit: 'WEEK' as const },
  { key: 'FORTNIGHTLY', label: 'Quincenal', value: 2, unit: 'WEEK' as const },
  { key: 'MONTHLY', label: 'Mensual', value: 1, unit: 'MONTH' as const },
  { key: 'BIMONTHLY', label: 'Bimensual', value: 2, unit: 'MONTH' as const },
  { key: 'QUARTERLY', label: 'Trimestral', value: 3, unit: 'MONTH' as const },
  { key: 'SEMIANNUAL', label: 'Semestral', value: 6, unit: 'MONTH' as const },
  { key: 'ANNUAL', label: 'Anual', value: 1, unit: 'YEAR' as const },
  { key: 'OTHER', label: 'Otras', value: null, unit: 'VARIABLE' as const },
] as const

function periodicityKey(plan: Plan | null) {
  if (!plan) return 'OTHER'
  const match = periodicityOptions.find(
    (option) =>
      option.value === plan.periodicity_value &&
      option.unit === plan.periodicity_unit,
  )
  return match?.key ?? 'OTHER'
}

function displayMaintenanceName(frequency: string | null, plan: Plan | null) {
  if (!plan) return ''
  const labels: Record<string, string> = {
    DAILY: 'PREVENTIVO DIARIO',
    WEEKLY: 'PREVENTIVO SEMANAL',
    FORTNIGHTLY: 'PREVENTIVO QUINCENAL',
    MONTHLY: 'PREVENTIVO MENSUAL',
    BIMONTHLY: 'PREVENTIVO BIMENSUAL',
    QUARTERLY: 'PREVENTIVO TRIMESTRAL',
    SEMIANNUAL: 'PREVENTIVO SEMESTRAL',
    ANNUAL: 'PREVENTIVO ANUAL',
    OTHER: 'PREVENTIVO — OTRAS',
  }
  return labels[frequency ?? ''] ?? plan.name.replace(/^_+/, '')
}

function formatDate(value: string | null) {
  if (!value) return 'Pendiente de primera revisión'
  const date = value.length > 10
    ? new Date(value)
    : new Date(value + 'T12:00:00')
  return date.toLocaleDateString('es-ES')
}

function executionLabel(result: Execution['result']) {
  switch (result) {
    case 'COMPLETED': return 'Revisada'
    case 'COMPLETED_WITH_ISSUES': return 'Revisada con incidencias'
    case 'NOT_CONFORM': return 'No conforme'
    case 'CANCELLED': return 'No realizada'
    default: return 'Pendiente'
  }
}

function executionTone(result: Execution['result']) {
  switch (result) {
    case 'COMPLETED': return 'bg-emerald-100 text-emerald-700'
    case 'COMPLETED_WITH_ISSUES': return 'bg-amber-100 text-amber-700'
    case 'NOT_CONFORM': return 'bg-rose-100 text-rose-700'
    default: return 'bg-slate-200 text-slate-700'
  }
}

function workOrderStatusLabel(status: WorkOrder['status']) {
  switch (status) {
    case 'COMPLETED': return 'Finalizada'
    case 'IN_PROGRESS': return 'En curso'
    default: return 'Pendiente'
  }
}

function workOrderIsOverdue(order: WorkOrder) {
  return order.status === 'PENDING'
    && Boolean(order.scheduled_date)
    && order.scheduled_date! < todayLocalDate()
}

function workOrderDisplayLabel(order: WorkOrder) {
  if (order.status === 'COMPLETED' && order.completion_timing === 'OUT_OF_DATE') {
    return 'Finalizada · Fuera de fecha'
  }
  return workOrderIsOverdue(order) ? 'Vencida' : workOrderStatusLabel(order.status)
}

function workOrderDisplayTone(order: WorkOrder) {
  if (workOrderIsOverdue(order)) return 'bg-rose-100 text-rose-700'
  if (order.status === 'COMPLETED' && order.completion_timing === 'OUT_OF_DATE') {
    return 'bg-amber-100 text-amber-700'
  }
  return workOrderStatusTone(order.status)
}

function workOrderStatusTone(status: WorkOrder['status']) {
  switch (status) {
    case 'COMPLETED': return 'bg-emerald-100 text-emerald-700'
    case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700'
    default: return 'bg-amber-100 text-amber-700'
  }
}

function todayLocalDate() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function cycleStatus(plan: Plan | null, executions: Execution[]) {
  if (!plan) return 'Sin plan'
  const hasValidExecution = executions.some(
    (item) => item.executed_at && item.result !== 'CANCELLED',
  )

  if (!hasValidExecution) return 'Pendiente de primera revisión'
  if (!plan.next_due_date) return 'Pendiente de programar'

  const today = todayLocalDate()
  if (plan.next_due_date < today) return 'Vencida'
  if (plan.next_due_date === today) return 'Pendiente hoy'
  return 'Programada'
}

function cycleStatusTone(status: string) {
  if (status === 'Vencida') return 'bg-rose-100 text-rose-700'
  if (status === 'Pendiente hoy') return 'bg-amber-100 text-amber-700'
  if (status === 'Programada') return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-700'
}

function scheduledExecutor(
  asset: Asset,
  plan: Plan | null,
) {
  const planned = plan?.maintenance_type === 'EXTERNAL'
    ? plan.external_company?.trim()
    : asset.maintenance?.trim()

  if (planned) return planned
  return plan?.maintenance_type === 'EXTERNAL' ? 'Pendiente de asignar' : 'SSTT'
}

export default function MaintenancePamDetailPage() {
  useHotelDay()
  const navigate = useNavigate()
  const { apparatusId } = useParams<{ apparatusId: string }>()
  const [searchParams] = useSearchParams()
  const requestedPlanId = searchParams.get('planId')
  const requestedFrequency = searchParams.get('frequency')

  const [asset, setAsset] = useState<Asset | null>(null)
  const [baselineAsset, setBaselineAsset] = useState<Asset | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [baselinePlan, setBaselinePlan] = useState<Plan | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [mode, setMode] = useState<FormMode>('view')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [reviewDate, setReviewDate] = useState('')
  const [reviewResult, setReviewResult] = useState<Execution['result']>('COMPLETED')
  const [reviewCompany, setReviewCompany] = useState('')
  const [reviewObservations, setReviewObservations] = useState('')

  async function load() {
    if (!apparatusId) return
    setLoading(true)
    setErrorMessage('')

    const assetQuery = await supabase
      .from('apparatus_registry')
      .select('id, source_id, code, name, plant, location, maintenance, active')
      .eq('id', apparatusId)
      .single()

    if (assetQuery.error || !assetQuery.data) {
      setErrorMessage(assetQuery.error?.message ?? 'No se ha podido cargar el activo.')
      setLoading(false)
      return
    }

    const loadedAsset = assetQuery.data as Asset

    const plansQuery = await supabase
      .from('maintenance_plans')
      .select('id, code, name, description, maintenance_type, external_company, periodicity_value, periodicity_unit, start_date, next_due_date, scheduled_day_of_month, scheduled_weekday, tolerance_days, alert_lead_days, booking_required, visit_duration_minutes, schedule_notes, active')
      .eq('apparatus_registry_id', apparatusId)
      .eq('active', true)
      .order('created_at')

    if (plansQuery.error) {
      setErrorMessage(plansQuery.error.message)
      setLoading(false)
      return
    }

    const availablePlans = (plansQuery.data ?? []) as Plan[]
    const selectedPlan =
      availablePlans.find((item) => item.id === requestedPlanId) ??
      availablePlans[0] ??
      null

    const [executionQuery, workOrderQuery] = selectedPlan
      ? await Promise.all([
          supabase
            .from('maintenance_executions')
            .select('id, work_order_id, scheduled_date, executed_at, result, performer_name, performer_company, observations')
            .eq('maintenance_plan_id', selectedPlan.id)
            .order('executed_at', { ascending: false, nullsFirst: false }),
          supabase
            .from('maintenance_work_orders')
            .select('id, ot_number, scheduled_date, status, generation_mode, completion_timing')
            .eq('maintenance_plan_id', selectedPlan.id)
            .order('scheduled_date', { ascending: false, nullsFirst: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ]

    if (executionQuery.error || workOrderQuery.error) {
      setErrorMessage(
        executionQuery.error?.message
        ?? workOrderQuery.error?.message
        ?? 'No se ha podido cargar el histórico de mantenimiento.',
      )
      setLoading(false)
      return
    }

    setAsset(loadedAsset)
    setBaselineAsset(loadedAsset)
    setPlan(selectedPlan)
    setBaselinePlan(selectedPlan)
    setExecutions((executionQuery.data ?? []) as Execution[])
    setWorkOrders((workOrderQuery.data ?? []) as WorkOrder[])
    setReviewDate(new Date().toISOString().slice(0, 10))
    setReviewCompany(scheduledExecutor(loadedAsset, selectedPlan))
    setReviewObservations('')
    setMode('view')
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [apparatusId, requestedPlanId])

  const hotelId = asset?.source_id !== null && asset?.source_id !== undefined
    ? hotelAssetCodes[asset.source_id] ?? ''
    : ''

  const latestValidExecution = useMemo(
    () => executions.find((item) => item.executed_at && item.result !== 'CANCELLED') ?? null,
    [executions],
  )

  const latestExecution = executions[0] ?? null

  const historyRows = useMemo(() => {
    const executionByWorkOrderId = new Map<string, Execution>()
    const executionByDate = new Map<string, Execution[]>()

    for (const execution of executions) {
      if (execution.work_order_id) {
        executionByWorkOrderId.set(execution.work_order_id, execution)
      }

      const date = execution.scheduled_date ?? execution.executed_at?.slice(0, 10) ?? ''
      if (!date) continue
      const rows = executionByDate.get(date) ?? []
      rows.push(execution)
      executionByDate.set(date, rows)
    }

    const rows = workOrders.map((order) => {
      const date = order.scheduled_date ?? ''
      const matchingExecution =
        executionByWorkOrderId.get(order.id)
        ?? executionByDate.get(date)?.[0]
        ?? null
      const isCancelled = matchingExecution?.result === 'CANCELLED'

      return {
        key: 'ot-' + order.id,
        date: date || matchingExecution?.executed_at?.slice(0, 10) || '',
        statusLabel: isCancelled
          ? 'No realizada'
          : workOrderDisplayLabel(order),
        statusTone: isCancelled
          ? 'bg-slate-200 text-slate-700'
          : workOrderDisplayTone(order),
        otNumber: order.ot_number,
        execution: matchingExecution,
      }
    })

    const linkedExecutionIds = new Set(
      workOrders
        .map((order) => executionByWorkOrderId.get(order.id)?.id)
        .filter(Boolean),
    )
    const workOrderDates = new Set(workOrders.map((order) => order.scheduled_date).filter(Boolean))

    for (const execution of executions) {
      const date = execution.scheduled_date ?? execution.executed_at?.slice(0, 10) ?? ''
      if (!date || linkedExecutionIds.has(execution.id) || workOrderDates.has(date)) continue

      rows.push({
        key: 'execution-' + execution.id,
        date,
        statusLabel: executionLabel(execution.result),
        statusTone: executionTone(execution.result),
        otNumber: '—',
        execution,
      })
    }

    return rows
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [workOrders, executions])

  const isDirty =
    mode !== 'view' &&
    (JSON.stringify(asset) !== JSON.stringify(baselineAsset) ||
      JSON.stringify(plan) !== JSON.stringify(baselinePlan))

  function updateAsset<K extends keyof Asset>(field: K, value: Asset[K]) {
    setAsset((current) => current ? { ...current, [field]: value } : current)
    setMessage('')
    setErrorMessage('')
  }

  function updatePlan<K extends keyof Plan>(field: K, value: Plan[K]) {
    setPlan((current) => current ? { ...current, [field]: value } : current)
    setMessage('')
    setErrorMessage('')
  }

  async function saveChanges() {
    if (!asset) return false
    if (!asset.name.trim()) {
      setErrorMessage('La descripción del equipo es obligatoria.')
      return false
    }

    setSaving(true)
    setMessage('')
    setErrorMessage('')

    try {
      const { error: assetError } = await supabase
        .from('apparatus_registry')
        .update({
          name: asset.name.trim(),
          plant: asset.plant?.trim() || null,
          location: asset.location?.trim() || null,
          maintenance: asset.maintenance?.trim() || null,
          active: asset.active,
        })
        .eq('id', asset.id)

      if (assetError) {
        setErrorMessage('Error actualizando el activo: ' + assetError.message)
        return false
      }

      if (plan) {
        const { data: savedPlan, error: planError } = await supabase
          .from('maintenance_plans')
          .update({
            name: plan.name.trim(),
            description: plan.description?.trim() || null,
            maintenance_type: plan.maintenance_type,
            external_company: plan.external_company?.trim() || null,
            periodicity_value: plan.periodicity_value,
            periodicity_unit: plan.periodicity_unit,
            start_date: plan.start_date || null,
            scheduled_day_of_month: plan.scheduled_day_of_month,
            scheduled_weekday: plan.scheduled_weekday,
            tolerance_days: plan.tolerance_days,
            alert_lead_days: plan.alert_lead_days,
            booking_required: plan.booking_required,
            visit_duration_minutes: plan.visit_duration_minutes,
            schedule_notes: plan.schedule_notes?.trim() || null,
            active: plan.active,
          })
          .eq('id', plan.id)
          .select('*')
          .single()

        if (planError) {
          setErrorMessage('El activo se guardó, pero el mantenimiento no: ' + planError.message)
          await load()
          return false
        }

        setPlan(savedPlan as Plan)
        setBaselinePlan(savedPlan as Plan)
      }

      const refreshedAsset = await supabase
        .from('apparatus_registry')
        .select('id, source_id, code, name, plant, location, maintenance, active')
        .eq('id', asset.id)
        .single()

      if (refreshedAsset.data) {
        setAsset(refreshedAsset.data as Asset)
        setBaselineAsset(refreshedAsset.data as Asset)
      }

      setMode('view')
      setMessage('Cambios guardados correctamente.')
      return true
    } finally {
      setSaving(false)
    }
  }

  const guardedNavigate = useCallback(
    (path: string) => {
      if (path === '__HISTORY_BACK__') {
        navigate(-1)
        return
      }
      navigate(path)
    },
    [navigate],
  )

  const {
    requestNavigation,
    requestBackNavigation,
    cancelNavigation,
    discardNavigation,
    saveAndNavigate,
    dialogOpen,
    saving: navigatingAndSaving,
  } = useGuardedNavigation({
    dirty: isDirty,
    onNavigate: guardedNavigate,
    onSave: saveChanges,
  })

  const handleCancelRequest = useCallback(() => {
    if (mode === 'view') {
      navigate('/maintenance/pam')
      return
    }
    if (!isDirty) {
      setAsset(baselineAsset)
      setPlan(baselinePlan)
      setMode('view')
      setMessage('')
      setErrorMessage('')
      return
    }
    requestNavigation('/maintenance/pam')
  }, [mode, isDirty, baselineAsset, baselinePlan, requestNavigation, navigate])

  useEscapeAsCancel({
    enabled: true,
    onCancel: () => {
      if (dialogOpen) {
        cancelNavigation()
        return
      }
      handleCancelRequest()
    },
  })

  async function registerReview() {
    if (!plan) {
      setErrorMessage('Este activo todavía no tiene un mantenimiento PAM asociado.')
      return
    }
    if (!reviewDate) {
      setErrorMessage('Indica la fecha de la revisión.')
      return
    }
    const access = planAccess(plan)
    if (!access.allowed) { setErrorMessage(access.message); return }
    if (reviewDate > hotelDay() || (plan.next_due_date && reviewDate < plan.next_due_date)) {
      setErrorMessage('La fecha debe corresponder a una revisión vencida y no puede ser futura.'); return
    }

    setRegistering(true)
    setMessage('')
    setErrorMessage('')

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
        setErrorMessage('No se ha podido identificar al usuario de la sesión.')
        return
      }

      const openWorkOrderQuery = await supabase
        .from('maintenance_work_orders')
        .select('id, ot_number, scheduled_date')
        .eq('maintenance_plan_id', plan.id)
        .in('status', ['PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS'])
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (openWorkOrderQuery.error) {
        setErrorMessage('No se ha podido localizar el ticket pendiente: ' + openWorkOrderQuery.error.message)
        return
      }

      const openWorkOrder = openWorkOrderQuery.data
        ? {
            id: String(openWorkOrderQuery.data.id),
            otNumber: String(openWorkOrderQuery.data.ot_number),
            scheduledDate: openWorkOrderQuery.data.scheduled_date as string | null,
          }
        : null

      const { error } = await supabase
        .from('maintenance_executions')
        .insert({
          maintenance_plan_id: plan.id,
          work_order_id: openWorkOrder?.id ?? null,
          scheduled_date: openWorkOrder?.scheduledDate ?? null,
          executed_at: new Date(reviewDate + 'T12:00:00').toISOString(),
          executed_by: userId,
          performer_name: performerName,
          performer_company: reviewCompany.trim() || null,
          result: reviewResult,
          observations: reviewObservations.trim() || null,
        })

      if (error) {
        setErrorMessage('Error registrando el resultado del ticket: ' + error.message)
        return
      }

      setMessage(
        reviewResult === 'CANCELLED'
          ? openWorkOrder
            ? 'Ticket ' + openWorkOrder.otNumber + ' marcado como no realizado. Permanece pendiente.'
            : 'Ejecución cancelada y registrada.'
          : openWorkOrder?.scheduledDate && openWorkOrder.scheduledDate !== reviewDate
            ? 'Ticket ' + openWorkOrder.otNumber + ' finalizado y guardado fuera de fecha.'
            : openWorkOrder
              ? 'Ticket ' + openWorkOrder.otNumber + ' finalizado correctamente.'
              : 'Resultado registrado sin un ticket abierto asociado.',
      )
      await load()
    } finally {
      setRegistering(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg text-sm">Cargando ficha PAM…</div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg text-sm">
          {errorMessage || 'Activo no encontrado.'}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/maintenance/pam')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">PAM — Ficha de mantenimiento</h1>
                <p className="text-xs text-slate-500 sm:text-sm">
                  {hotelId || asset.code} · {asset.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <BackButton onBack={requestBackNavigation} disabled={saving || registering || navigatingAndSaving} />
              <HomeButton onHome={() => requestNavigation('/')} disabled={saving || registering || navigatingAndSaving} />
              <FormActions
                mode={mode}
                onSave={() => void saveChanges()}
                onCancel={handleCancelRequest}
                onEdit={() => setMode('edit')}
                saving={saving || navigatingAndSaving}
              />
            </div>
          </div>
        </header>

        {(message || errorMessage) && (
          <div className={
            errorMessage
              ? 'mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-sm'
              : 'mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 shadow-sm'
          }>
            {errorMessage || message}
          </div>
        )}

        <section className="mb-4 rounded-2xl bg-white p-4 shadow-lg sm:p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Identificación</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">ID del hotel</span>
              <input value={hotelId || '—'} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold text-slate-700" />
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">Código Arias</span>
              <input value={asset.code} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold text-slate-700" />
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">Descripción</span>
              <input value={asset.name} disabled={mode === 'view'} onChange={(event) => updateAsset('name', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">Planta</span>
              <input value={asset.plant ?? ''} disabled={mode === 'view'} onChange={(event) => updateAsset('plant', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">Ubicación</span>
              <input value={asset.location ?? ''} disabled={mode === 'view'} onChange={(event) => updateAsset('location', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">Empresa de mantenimiento</span>
              <input value={asset.maintenance ?? ''} disabled={mode === 'view'} onChange={(event) => updateAsset('maintenance', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
            </label>
          </div>
        </section>

        <section className="mb-4 rounded-2xl bg-white p-4 shadow-lg sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarClock size={18} className="text-slate-500" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Programación PAM</h2>
              <p className="text-xs text-slate-500">{plan?.code ?? 'Sin plan asociado'}</p>
            </div>
          </div>

          {!plan ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
              Este activo no tiene todavía un mantenimiento PAM materializado.
            </div>
          ) : (
            <>
              {requestedFrequency && periodicityKey(plan) !== requestedFrequency && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                  <strong>Inconsistencia de programación:</strong> esta ficha se ha abierto desde el módulo{' '}
                  <strong>{periodicityOptions.find((option) => option.key === requestedFrequency)?.label ?? requestedFrequency}</strong>,
                  pero el plan está configurado como{' '}
                  <strong>{periodicityOptions.find((option) => option.key === periodicityKey(plan))?.label ?? 'Otras'}</strong>.
                  Corrige la periodicidad del plan antes de guardar.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Mantenimiento</span>
                  <input value={displayMaintenanceName(requestedFrequency, plan)} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold text-slate-700" />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Tipo</span>
                  <select value={plan.maintenance_type} disabled={mode === 'view'} onChange={(event) => updatePlan('maintenance_type', event.target.value as Plan['maintenance_type'])} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100">
                    <option value="INTERNAL">Interno</option>
                    <option value="EXTERNAL">Externo</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Periodicidad</span>
                  <select
                    value={periodicityKey(plan)}
                    disabled={mode === 'view'}
                    onChange={(event) => {
                      const option = periodicityOptions.find((item) => item.key === event.target.value)
                      if (!option) return
                      updatePlan('periodicity_value', option.value)
                      updatePlan('periodicity_unit', option.unit)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  >
                    {periodicityOptions.map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Fecha programada</span>
                  <input
                    type="date"
                    value={plan.start_date ?? ''}
                    disabled={mode === 'view'}
                    onChange={(event) => updatePlan('start_date', event.target.value || null)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Próxima revisión</span>
                  <input value={formatDate(plan.next_due_date)} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold text-slate-700" />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Estado actual</span>
                  <div className="flex h-[42px] items-center rounded-lg border border-slate-300 bg-slate-100 px-3">
                    <span className={'inline-flex rounded-full px-2 py-1 text-xs font-semibold ' + cycleStatusTone(cycleStatus(plan, executions))}>
                      {cycleStatus(plan, executions)}
                    </span>
                  </div>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Empresa</span>
                  <input
                    value={scheduledExecutor(asset, plan)}
                    disabled={mode === 'view'}
                    onChange={(event) => {
                      const value = event.target.value || null
                      if (plan.maintenance_type === 'EXTERNAL') {
                        updatePlan('external_company', value)
                      } else {
                        updateAsset('maintenance', value)
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Tolerancia (días)</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.tolerance_days}
                    disabled={mode === 'view'}
                    onChange={(event) => updatePlan('tolerance_days', Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Aviso previo (días)</span>
                  <input
                    type="number"
                    min="0"
                    value={plan.alert_lead_days}
                    disabled={mode === 'view'}
                    onChange={(event) => updatePlan('alert_lead_days', Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
              </div>
            </>
          )}
        </section>

        <section className="mb-4 rounded-2xl bg-white p-4 shadow-lg sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-slate-500" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Registrar revisión</h2>
              <p className="text-xs text-slate-500">La próxima revisión se calcula a partir de la última revisión válida y la periodicidad.</p>
            </div>
          </div>

          {!plan ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">Sin plan PAM asociado.</div>
          ) : (
            <>
              <p role="status" className="mb-3 text-sm text-sky-800">{planAccess(plan).message}</p>
              <fieldset disabled={registering || !planAccess(plan).allowed} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
                <label><span className="mb-1 block text-sm font-semibold text-slate-700">Fecha</span><input type="date" value={reviewDate} disabled={registering} onChange={(event) => setReviewDate(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
                <label><span className="mb-1 block text-sm font-semibold text-slate-700">Resultado</span><select value={reviewResult} disabled={registering} onChange={(event) => setReviewResult(event.target.value as Execution['result'])} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="COMPLETED">Revisada</option>
                  <option value="COMPLETED_WITH_ISSUES">Revisada con incidencias</option>
                  <option value="NOT_CONFORM">No conforme</option>
                  <option value="CANCELLED">No realizada / cancelada</option>
                </select></label>
                <label><span className="mb-1 block text-sm font-semibold text-slate-700">Empresa</span><input value={reviewCompany} disabled={registering} onChange={(event) => setReviewCompany(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-slate-700">Observaciones / motivo</span><textarea rows={3} value={reviewObservations} disabled={registering} onChange={(event) => setReviewObservations(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
              </fieldset>
              <button type="button" onClick={() => void registerReview()} disabled={registering || !planAccess(plan).allowed} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <Save size={16} /> {registering ? 'Registrando…' : 'Guardar revisión'}
              </button>
            </>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-lg sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <History size={18} className="text-slate-500" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Histórico de revisiones</h2>
              <p className="text-xs text-slate-500">
                {historyRows.length
                  ? 'Las revisiones pendientes y realizadas se muestran vinculadas a sus tickets.'
                  : latestValidExecution
                    ? 'Última revisión válida: ' + formatDate(latestValidExecution.executed_at)
                    : 'Todavía no hay revisiones ni tickets registrados.'}
              </p>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5 font-semibold">Fecha programada</th>
                  <th className="px-2 py-1.5 font-semibold">Estado</th>
                  <th className="px-2 py-1.5 font-semibold">Ticket</th>
                  <th className="px-2 py-1.5 font-semibold">Resultado</th>
                  <th className="px-2 py-1.5 font-semibold">Realizada por</th>
                  <th className="px-2 py-1.5 font-semibold">Empresa</th>
                  <th className="px-2 py-1.5 font-semibold">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100">
                    <td className="px-2 py-1.5">{formatDate(row.date)}</td>
                    <td className="px-2 py-1.5">
                      <span className={'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' + row.statusTone}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-slate-800">{row.otNumber}</td>
                    <td className="px-2 py-1.5">
                      {row.execution ? (
                        <span className={'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' + executionTone(row.execution.result)}>
                          {executionLabel(row.execution.result)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-1.5">{row.execution?.performer_name || '—'}</td>
                    <td className="px-2 py-1.5">{row.execution?.performer_company || '—'}</td>
                    <td className="px-2 py-1.5">{row.execution?.observations || '—'}</td>
                  </tr>
                ))}
                {historyRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Todavía no hay revisiones ni tickets registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {latestExecution && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            {latestExecution.result === 'CANCELLED' ? <XCircle size={14} /> : <Clock3 size={14} />}
            Último registro: {executionLabel(latestExecution.result)}
          </div>
        )}
        <UnsavedChangesDialog
          open={dialogOpen}
          onCancel={cancelNavigation}
          onDiscard={discardNavigation}
          onSaveAndContinue={saveAndNavigate}
          saving={navigatingAndSaving}
        />
      </div>
    </div>
  )
}
