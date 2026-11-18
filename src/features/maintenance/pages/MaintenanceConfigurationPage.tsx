import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownUp, Bell, CalendarClock, CheckCircle2, MapPin, PlayCircle, Plus, Save, Settings2, Trash2, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'

type HotelConfig = {
  hotel_id: string
  ot_generation_mode: 'AUTO' | 'MANUAL'
  ot_generation_lead_days: number
  ot_assignment_mode: 'NONE' | 'MANUAL' | 'RULES'
  ot_overdue_action: 'KEEP_PENDING' | 'ESCALATE'
  notify_on_ot_created: boolean
  notify_unassigned: boolean
  notify_overdue: boolean
  require_evidence_on_close: boolean
  require_observations_on_close: boolean
  allow_manual_ot_creation: boolean
  duplicate_protection: boolean
}

type Rule = {
  id: string
  name: string
  description: string | null
  trigger_event: TriggerEvent
  conditions: Record<string, unknown>
  actions: Record<string, unknown>
  priority: number
  active: boolean
}

type TriggerEvent =
  | 'PAM_JOB_PENDING'
  | 'PAM_JOB_DUE'
  | 'PAM_JOB_OVERDUE'
  | 'EXECUTION_NOT_CONFORM'
  | 'EXECUTION_WITH_ISSUES'
  | 'CONTROL_OUT_OF_RANGE'

const defaultConfig: Omit<HotelConfig, 'hotel_id'> = {
  ot_generation_mode: 'MANUAL',
  ot_generation_lead_days: 0,
  ot_assignment_mode: 'MANUAL',
  ot_overdue_action: 'KEEP_PENDING',
  notify_on_ot_created: true,
  notify_unassigned: true,
  notify_overdue: true,
  require_evidence_on_close: false,
  require_observations_on_close: false,
  allow_manual_ot_creation: true,
  duplicate_protection: true,
}

const triggerLabels: Record<TriggerEvent, string> = {
  PAM_JOB_PENDING: 'Trabajo PAM pendiente',
  PAM_JOB_DUE: 'Trabajo PAM llega a su fecha',
  PAM_JOB_OVERDUE: 'Trabajo PAM vencido',
  EXECUTION_NOT_CONFORM: 'Revisión no conforme',
  EXECUTION_WITH_ISSUES: 'Revisión con incidencias',
  CONTROL_OUT_OF_RANGE: 'Control fuera de rango',
}

const templateRules = [
  {
    name: 'Ticket por trabajo PAM vencido',
    trigger_event: 'PAM_JOB_OVERDUE' as TriggerEvent,
    description: 'Genera un ticket y avisa al responsable cuando un trabajo preventivo supera su fecha.',
    conditions: { overdue: true },
    actions: { create_work_order: true, notify_maintenance_chief: true, priority: 'HIGH' },
  },
  {
    name: 'Ticket por revisión no conforme',
    trigger_event: 'EXECUTION_NOT_CONFORM' as TriggerEvent,
    description: 'Convierte una revisión no conforme en una actuación pendiente de atender.',
    conditions: { result: 'NOT_CONFORM' },
    actions: { create_work_order: true, work_type: 'CORRECTIVE', notify_maintenance_chief: true, priority: 'HIGH' },
  },
  {
    name: 'Aviso por control fuera de rango',
    trigger_event: 'CONTROL_OUT_OF_RANGE' as TriggerEvent,
    description: 'Avisa cuando un control registrado queda fuera de los límites configurados.',
    conditions: { control_status: 'OUT_OF_RANGE' },
    actions: { notify_maintenance_chief: true, create_work_order: false, priority: 'MEDIUM' },
  },
]

const priorityValues = {
  CRITICAL: 10,
  HIGH: 50,
  NORMAL: 100,
  LOW: 200,
} as const

type RulePriority = keyof typeof priorityValues

function priorityLabel(value: number) {
  if (value <= priorityValues.CRITICAL) return 'Crítica'
  if (value <= priorityValues.HIGH) return 'Alta'
  if (value <= priorityValues.NORMAL) return 'Normal'
  return 'Baja'
}

function emptyRule() {
  return {
    name: '',
    description: '',
    trigger_event: 'PAM_JOB_OVERDUE' as TriggerEvent,
    overdueDays: '1',
    createWorkOrder: true,
    workType: 'PREVENTIVE' as 'PREVENTIVE' | 'CORRECTIVE' | 'ACTUATION',
    notifyMaintenanceChief: true,
    notifyAssignee: false,
    priority: 'HIGH' as RulePriority,
    active: true,
  }
}

function ruleFormFromTemplate(template: typeof templateRules[number]) {
  const actions = template.actions as Record<string, unknown>
  const priority =
    actions.priority === 'CRITICAL' ? 'CRITICAL' :
    actions.priority === 'HIGH' ? 'HIGH' :
    actions.priority === 'LOW' ? 'LOW' :
    'NORMAL'

  return {
    ...emptyRule(),
    name: template.name,
    description: template.description,
    trigger_event: template.trigger_event,
    overdueDays: String(
      typeof (template.conditions as Record<string, unknown>).overdue_days_min === 'number'
        ? (template.conditions as Record<string, unknown>).overdue_days_min
        : 1,
    ),
    createWorkOrder: actions.create_work_order === true,
    workType: (
      actions.work_type === 'CORRECTIVE' || actions.work_type === 'ACTUATION'
        ? actions.work_type
        : 'PREVENTIVE'
    ) as 'PREVENTIVE' | 'CORRECTIVE' | 'ACTUATION',
    notifyMaintenanceChief: actions.notify_maintenance_chief !== false,
    notifyAssignee: actions.notify_assignee === true,
    priority: priority as RulePriority,
    active: true,
  }
}

function buildRuleConditions(form: ReturnType<typeof emptyRule>): Record<string, unknown> {
  switch (form.trigger_event) {
    case 'PAM_JOB_OVERDUE':
      return {
        overdue: true,
        overdue_days_min: Math.max(0, Number(form.overdueDays) || 0),
      }
    case 'EXECUTION_NOT_CONFORM':
      return { result: 'NOT_CONFORM' }
    case 'EXECUTION_WITH_ISSUES':
      return { result: 'COMPLETED_WITH_ISSUES' }
    case 'CONTROL_OUT_OF_RANGE':
      return { control_status: 'OUT_OF_RANGE' }
    default:
      return {}
  }
}

function buildRuleActions(form: ReturnType<typeof emptyRule>): Record<string, unknown> {
  return {
    create_work_order: form.createWorkOrder,
    ...(form.createWorkOrder ? { work_type: form.workType } : {}),
    notify_maintenance_chief: form.notifyMaintenanceChief,
    notify_assignee: form.notifyAssignee,
  }
}

function describeRule(rule: Rule) {
  const actions: string[] = []
  if (rule.actions.create_work_order) {
    const workType = rule.actions.work_type === 'CORRECTIVE'
      ? 'Ticket correctivo'
      : rule.actions.work_type === 'ACTUATION'
        ? 'Actuación'
        : 'Ticket preventivo'
    actions.push(workType)
  }
  if (rule.actions.notify_maintenance_chief) actions.push('aviso al Jefe de Mantenimiento')
  if (rule.actions.notify_assignee) actions.push('aviso al responsable')
  return actions.join(' · ') || 'Sin acciones definidas'
}


export default function MaintenanceConfigurationPage() {
  const navigate = useNavigate()
  const { alert: showAlert } = useSystemDialog()
  const { hotel: currentHotel } = useHotelScope()
  const hotelId = currentHotel?.id ?? ''
  const [config, setConfig] = useState<HotelConfig | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ruleSaving, setRuleSaving] = useState(false)
  const [error, setError] = useState('')
  const [ruleFormOpen, setRuleFormOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState(emptyRule())


  async function loadHotelConfig(targetHotelId: string) {
    if (!targetHotelId) {
      setConfig(null)
      setRules([])
      return
    }

    setError('')
    const [configQuery, rulesQuery] = await Promise.all([
      supabase.from('maintenance_hotel_config').select('*').eq('hotel_id', targetHotelId).maybeSingle(),
      supabase
        .from('maintenance_automation_rules')
        .select('id, name, description, trigger_event, conditions, actions, priority, active')
        .eq('hotel_id', targetHotelId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    if (configQuery.error || rulesQuery.error) {
      setError(configQuery.error?.message ?? rulesQuery.error?.message ?? 'No se pudo cargar la configuración.')
      return
    }

    setConfig({
      hotel_id: targetHotelId,
      ...(defaultConfig as Omit<HotelConfig, 'hotel_id'>),
      ...(configQuery.data as Partial<HotelConfig> | null),
    })
    setRules((rulesQuery.data ?? []) as Rule[])
  }

  useEffect(() => {
    if (hotelId) void loadHotelConfig(hotelId)
    else {
      setConfig(null)
      setRules([])
    }
  }, [hotelId])

  function setConfigField<K extends keyof Omit<HotelConfig, 'hotel_id'>>(field: K, value: HotelConfig[K]) {
    setConfig((current) => current ? { ...current, [field]: value } : current)
  }

  async function saveConfig() {
    if (!config || !hotelId) return
    setSaving(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id ?? null
      const { error: saveError } = await supabase
        .from('maintenance_hotel_config')
        .upsert({
          ...config,
          created_by: userId,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'hotel_id' })

      if (saveError) {
        setError(saveError.message)
        return
      }

      await showAlert({
        title: 'Configuración guardada',
        message: `La configuración de mantenimiento de ${currentHotel?.name ?? 'este hotel'} se ha guardado correctamente.`,
        variant: 'info',
      })
    } finally {
      setSaving(false)
    }
  }

  function useTemplate(template: typeof templateRules[number]) {
    setRuleForm(ruleFormFromTemplate(template))
    setRuleFormOpen(true)
    setError('')
  }

  async function saveRule() {
    if (!hotelId || !ruleForm.name.trim()) {
      setError('Indica un nombre para la regla.')
      return
    }

    if (ruleForm.trigger_event === 'PAM_JOB_OVERDUE' && Number(ruleForm.overdueDays) < 0) {
      setError('Los días de vencimiento no pueden ser negativos.')
      return
    }

    setRuleSaving(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id ?? null
      const result = await supabase.from('maintenance_automation_rules').insert({
        hotel_id: hotelId,
        name: ruleForm.name.trim(),
        description: ruleForm.description.trim() || null,
        trigger_event: ruleForm.trigger_event,
        conditions: buildRuleConditions(ruleForm),
        actions: buildRuleActions(ruleForm),
        priority: priorityValues[ruleForm.priority],
        active: ruleForm.active,
        created_by: userId,
        updated_by: userId,
      }).select('id, name, description, trigger_event, conditions, actions, priority, active').single()

      if (result.error || !result.data) {
        setError(result.error?.message ?? 'No se pudo guardar la regla.')
        return
      }

      setRules((current) => [...current, result.data as Rule].sort((a, b) => a.priority - b.priority))
      setRuleFormOpen(false)
      setRuleForm(emptyRule())
      await showAlert({
        title: 'Regla creada',
        message: 'La regla queda almacenada y lista para el motor de automatización.',
        variant: 'info',
      })
    } finally {
      setRuleSaving(false)
    }
  }

  async function toggleRule(rule: Rule) {
    const result = await supabase
      .from('maintenance_automation_rules')
      .update({ active: !rule.active, updated_at: new Date().toISOString() })
      .eq('id', rule.id)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setRules((current) => current.map((item) => item.id === rule.id ? { ...item, active: !rule.active } : item))
  }

  async function deleteRule(rule: Rule) {
    const result = await supabase.from('maintenance_automation_rules').delete().eq('id', rule.id)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setRules((current) => current.filter((item) => item.id !== rule.id))
  }

  async function simulate() {
    if (!hotelId) return
    const result = await supabase
      .from('maintenance_plans')
      .select('id, name, next_due_date, active')
      .eq('hotel_id', hotelId)
      .eq('active', true)

    if (result.error) {
      setError(result.error.message)
      return
    }

    const today = new Date().toISOString().slice(0, 10)
    const overdue = (result.data ?? []).filter((plan) => plan.next_due_date && plan.next_due_date < today).length
    const dueToday = (result.data ?? []).filter((plan) => plan.next_due_date === today).length

    await showAlert({
      title: 'Simulación de generación',
      message: `${overdue} mantenimiento(s) vencido(s) y ${dueToday} para hoy. La simulación no crea tickets.`,
      variant: 'info',
    })
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight sm:text-2xl">Configuración de mantenimiento</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Automatización, tickets, asignación, avisos y reglas por hotel.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BackButton onBack={() => navigate('/maintenance')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
          </div>
        </header>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hotel actual</div>
            <div className="mt-1 truncate text-base font-bold text-slate-900">{currentHotel?.name ?? '—'}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1"><CheckCircle2 size={14} />Configuración por hotel</span>
            <ActionButton icon={MapPin} label="Estructura del hotel" onClick={() => navigate('/maintenance/structure')} />
            <button type="button" onClick={() => void simulate()} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-semibold hover:bg-slate-200"><PlayCircle size={14} />Simular</button>
          </div>
        </div>

        {loading || !config ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Cargando configuración…</div>
        ) : (
          <>
            <section className="mb-4 grid gap-4 xl:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 text-slate-500" size={22} />
                  <div className="w-full">
                    <h2 className="font-bold">Generación de tickets</h2>
                    <p className="mt-1 text-xs text-slate-500">Define cómo deben materializarse los tickets preventivos derivadas del PAM.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label><span className="mb-1 block text-sm font-medium">Modo</span><select value={config.ot_generation_mode} onChange={(e) => setConfigField('ot_generation_mode', e.target.value as HotelConfig['ot_generation_mode'])} className="w-full rounded-xl border px-3 py-2"><option value="AUTO">Automática</option><option value="MANUAL">Manual</option></select></label>
                      <label><span className="mb-1 block text-sm font-medium">Antelación (días)</span><input type="number" min={0} max={365} value={config.ot_generation_lead_days} onChange={(e) => setConfigField('ot_generation_lead_days', Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" /></label>
                      <label><span className="mb-1 block text-sm font-medium">Asignación</span><select value={config.ot_assignment_mode} onChange={(e) => setConfigField('ot_assignment_mode', e.target.value as HotelConfig['ot_assignment_mode'])} className="w-full rounded-xl border px-3 py-2"><option value="NONE">Sin asignar</option><option value="MANUAL">Manual</option><option value="RULES">Según reglas</option></select></label>
                      <label><span className="mb-1 block text-sm font-medium">Ticket vencido</span><select value={config.ot_overdue_action} onChange={(e) => setConfigField('ot_overdue_action', e.target.value as HotelConfig['ot_overdue_action'])} className="w-full rounded-xl border px-3 py-2"><option value="KEEP_PENDING">Mantener pendiente</option><option value="ESCALATE">Escalar automáticamente</option></select></label>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" checked={config.allow_manual_ot_creation} onChange={(e) => setConfigField('allow_manual_ot_creation', e.target.checked)} />Permitir crear tickets manualmente</label>
                      <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" checked={config.duplicate_protection} onChange={(e) => setConfigField('duplicate_protection', e.target.checked)} />Protección contra tickets duplicados</label>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 text-slate-500" size={22} />
                  <div className="w-full">
                    <h2 className="font-bold">Avisos y cierre</h2>
                    <p className="mt-1 text-xs text-slate-500">Controla qué eventos requieren comunicación o evidencia.</p>
                    <div className="mt-4 space-y-2">
                      <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={config.notify_on_ot_created} onChange={(e) => setConfigField('notify_on_ot_created', e.target.checked)} />Avisar al crear un ticket</label>
                      <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={config.notify_unassigned} onChange={(e) => setConfigField('notify_unassigned', e.target.checked)} />Avisar si queda sin asignar</label>
                      <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={config.notify_overdue} onChange={(e) => setConfigField('notify_overdue', e.target.checked)} />Avisar al vencer</label>
                      <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={config.require_evidence_on_close} onChange={(e) => setConfigField('require_evidence_on_close', e.target.checked)} />Exigir evidencia para cerrar ticket</label>
                      <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={config.require_observations_on_close} onChange={(e) => setConfigField('require_observations_on_close', e.target.checked)} />Exigir observaciones para cerrar ticket</label>
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div>
                  <div className="flex items-center gap-2"><ArrowDownUp size={20} className="text-slate-500" /><h2 className="font-bold">Reglas automáticas</h2></div>
                  <p className="mt-1 text-xs text-slate-500">Reglas por hotel. El modelo permite ampliar condiciones y acciones sin cambiar la estructura base.</p>
                </div>
                <button type="button" onClick={() => { setRuleForm(emptyRule()); setRuleFormOpen(true) }} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />Nueva regla</button>
              </div>

              <div className="mt-4 grid gap-2 lg:grid-cols-3">
                {templateRules.map((template) => (
                  <button key={template.name} type="button" onClick={() => useTemplate(template)} className="rounded-xl border border-dashed border-slate-300 p-3 text-left hover:border-slate-500 hover:bg-slate-50">
                    <div className="text-sm font-semibold">{template.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{template.description}</div>
                    <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Usar plantilla</div>
                  </button>
                ))}
              </div>

              {ruleFormOpen && (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Nueva regla automática</h3>
                      <p className="text-xs text-slate-500">Configura la regla con opciones claras. La parte técnica se guarda automáticamente.</p>
                    </div>
                    <button type="button" onClick={() => setRuleFormOpen(false)} className="rounded-lg border bg-white px-3 py-2 text-sm">Cancelar</button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-sm font-medium">Nombre de la regla</span>
                      <input value={ruleForm.name} onChange={(e) => setRuleForm((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-xl border bg-white px-3 py-2" placeholder="Ej.: ticket por mantenimiento vencido" />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-medium">Cuándo ocurre</span>
                      <select value={ruleForm.trigger_event} onChange={(e) => setRuleForm((current) => ({ ...current, trigger_event: e.target.value as TriggerEvent }))} className="w-full rounded-xl border bg-white px-3 py-2">
                        {(Object.keys(triggerLabels) as TriggerEvent[]).map((event) => <option key={event} value={event}>{triggerLabels[event]}</option>)}
                      </select>
                    </label>
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-medium">Descripción</span>
                      <textarea rows={2} value={ruleForm.description} onChange={(e) => setRuleForm((current) => ({ ...current, description: e.target.value }))} className="w-full rounded-xl border bg-white px-3 py-2" placeholder="Explica qué debe hacer esta regla." />
                    </label>
                  </div>

                  {ruleForm.trigger_event === 'PAM_JOB_OVERDUE' && (
                    <div className="mt-4 rounded-xl border bg-white p-4">
                      <div className="text-sm font-semibold text-slate-800">Condición</div>
                      <label className="mt-3 block max-w-md">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Antigüedad del vencimiento</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-slate-600">Aplicar cuando lleve al menos</span>
                          <input type="number" min={0} value={ruleForm.overdueDays} onChange={(e) => setRuleForm((current) => ({ ...current, overdueDays: e.target.value }))} className="w-24 rounded-xl border px-3 py-2" />
                          <span className="text-sm text-slate-600">día(s) vencido</span>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border bg-white p-4">
                    <div className="text-sm font-semibold text-slate-800">Entonces</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                        <input type="checkbox" checked={ruleForm.createWorkOrder} onChange={(e) => setRuleForm((current) => ({ ...current, createWorkOrder: e.target.checked }))} />
                        Crear tickets automáticamente
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                        <input type="checkbox" checked={ruleForm.notifyMaintenanceChief} onChange={(e) => setRuleForm((current) => ({ ...current, notifyMaintenanceChief: e.target.checked }))} />
                        Avisar al Jefe de Mantenimiento
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                        <input type="checkbox" checked={ruleForm.notifyAssignee} onChange={(e) => setRuleForm((current) => ({ ...current, notifyAssignee: e.target.checked }))} />
                        Avisar al responsable asignado
                      </label>
                      <label>
                        <span className="mb-1 block text-sm font-medium">Tipo de ticket</span>
                        <select value={ruleForm.workType} disabled={!ruleForm.createWorkOrder} onChange={(e) => setRuleForm((current) => ({ ...current, workType: e.target.value as typeof current.workType }))} className="w-full rounded-xl border bg-white px-3 py-2 disabled:bg-slate-100">
                          <option value="PREVENTIVE">Preventiva</option>
                          <option value="CORRECTIVE">Correctiva</option>
                          <option value="ACTUATION">Actuación</option>
                        </select>
                      </label>
                      <label>
                        <span className="mb-1 block text-sm font-medium">Importancia</span>
                        <select value={ruleForm.priority} onChange={(e) => setRuleForm((current) => ({ ...current, priority: e.target.value as RulePriority }))} className="w-full rounded-xl border bg-white px-3 py-2">
                          <option value="CRITICAL">Crítica</option>
                          <option value="HIGH">Alta</option>
                          <option value="NORMAL">Normal</option>
                          <option value="LOW">Baja</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={ruleForm.active} onChange={(e) => setRuleForm((current) => ({ ...current, active: e.target.checked }))} />
                    Regla activa
                  </label>

                  <div className="mt-4 flex justify-end">
                    <ActionButton icon={Save} label={ruleSaving ? 'Guardando…' : 'Guardar regla'} tone="primary" onClick={() => void saveRule()} disabled={ruleSaving} />
                  </div>
                </div>
              )}

              {rules.length === 0 ? (
                <div className="mt-4 rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                  <ArrowDownUp className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">Todavía no hay reglas automáticas para este hotel.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {rules.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{rule.name}</span>
                            <span className={rule.active ? 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700' : 'rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500'}>{rule.active ? 'Activa' : 'Inactiva'}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">Importancia: {priorityLabel(rule.priority)}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{triggerLabels[rule.trigger_event]}</div>
                          {rule.description && <p className="mt-2 text-sm text-slate-600">{rule.description}</p>}
                          <p className="mt-2 text-xs text-slate-500">Acciones: {describeRule(rule)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void toggleRule(rule)} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">{rule.active ? 'Desactivar' : 'Activar'}</button>
                          <button type="button" onClick={() => void deleteRule(rule)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600"><Trash2 size={14} />Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mb-4 grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <CalendarClock className="text-slate-500" size={20} />
                <h3 className="mt-3 font-semibold">Calendario</h3>
                <p className="mt-1 text-xs text-slate-500">Festivos, jornadas SSTT y excepciones de calendario se incorporarán aquí sin afectar al PAM.</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <UserRound className="text-slate-500" size={20} />
                <h3 className="mt-3 font-semibold">Asignación avanzada</h3>
                <p className="mt-1 text-xs text-slate-500">Especialidades, zonas, cargas de trabajo y sustituciones pueden conectarse al motor de reglas.</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <AlertTriangle className="text-slate-500" size={20} />
                <h3 className="mt-3 font-semibold">Escalados</h3>
                <p className="mt-1 text-xs text-slate-500">Los avisos podrán escalarse por gravedad, tiempo transcurrido y criticidad del activo.</p>
              </article>
            </section>

            <div className="sticky bottom-3 flex justify-end">
              <ActionButton icon={Save} label={saving ? 'Guardando…' : 'Guardar configuración'} tone="primary" onClick={() => void saveConfig()} disabled={saving} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
