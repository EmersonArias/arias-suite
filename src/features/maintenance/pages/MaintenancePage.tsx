import { useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import { AlertTriangle, Bell, CalendarClock, Camera, CheckCircle2, Clock3, Download, ImagePlus, Mail, PlayCircle, Plus, Save, Trash2, Upload } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../../lib/supabase"
import { useHotelScope } from "../../../shared/context/HotelScopeContext"
import ActionButton from "../../../shared/components/buttons/ActionButton"
import { BackButton, HomeButton } from "../../../shared/components/navigation/NavigationButtons"
import BrandLogo from "../../../shared/components/branding/BrandLogo"
import { useSystemDialog } from "../../../shared/components/dialogs/SystemDialogProvider"
import { hotelDay, planAccess } from "../../../shared/maintenance/preventiveSchedule"
import { useHotelDay } from "../../../shared/maintenance/useHotelDay"

type Apparatus = { id: string; code: string; name: string; plant: string | null; location: string | null; sourceId: number | null }
type Plan = {
  id: string
  apparatus_registry_id: string | null
  name: string
  description: string | null
  maintenance_type: "INTERNAL" | "EXTERNAL"
  external_company: string | null
  periodicity_value: number | null
  periodicity_unit: "DAY" | "WEEK" | "MONTH" | "YEAR" | "VARIABLE" | null
  start_date: string | null
  next_due_date: string | null
  active: boolean
  apparatus?: { code: string; name: string } | null
}
type PlanEquipment = {
  id: string
  code: string
  name: string
  plant: string | null
  location: string | null
}
type Recipient = { user_id: string; full_name: string | null; email: string | null; role_name: string }
type Control = { id?: string; label: string; input_type: "NUMBER" | "TEXT" | "BOOLEAN" | "DATE" | "TIME" | "SELECT"; unit: string; min_value: string; max_value: string; required: boolean }
type EvidenceFile = {
  path: string
  name: string
  type: string
  size: number
  uploaded_at: string
}
type PlanPhoto = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  uploaded_by: string | null
  uploaded_at: string
  signed_url?: string
}
type MaintenanceAlert = {
  id: string
  maintenance_plan_id: string
  alert_type: "UPCOMING_REVIEW" | "DUE_TODAY" | "OVERDUE_REVIEW" | "OUT_OF_RANGE"
  severity: "INFO" | "WARNING" | "CRITICAL"
  title: string
  message: string
  due_date: string | null
  triggered_at: string
}
type Execution = {
  id: string
  maintenance_plan_id: string
  scheduled_date: string | null
  executed_at: string | null
  executed_by: string | null
  performer_name: string | null
  performer_company: string | null
  result: "COMPLETED" | "COMPLETED_WITH_ISSUES" | "NOT_CONFORM" | "CANCELLED"
  observations: string | null
  evidence_files: unknown
}
type ExecutionValue = { controlId: string; value: string }
type ExecutionFormState = {
  scheduled_date: string
  executed_at: string
  performer_name: string
  performer_company: string
  observations: string
}
type FormState = {
  apparatus_registry_id: string
  name: string
  description: string
  maintenance_type: "INTERNAL" | "EXTERNAL"
  external_company: string
  periodicity_value: string
  periodicity_unit: "DAY" | "WEEK" | "MONTH" | "YEAR" | "VARIABLE"
  start_date: string
  active: boolean
  email_enabled: boolean
  days_before: string
  notify_on_due: boolean
  notify_when_overdue: boolean
  overdue_repeat_days: string
  recipient_ids: string[]
  external_emails: string
}

function localDateTimeValue() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function executionResultLabel(result: Execution["result"]) {
  switch (result) {
    case "COMPLETED": return "Realizada"
    case "COMPLETED_WITH_ISSUES": return "Realizada con incidencias"
    case "NOT_CONFORM": return "No conforme"
    case "CANCELLED": return "Cancelada"
    default: return result
  }
}

function planState(nextDueDate: string | null, active: boolean) {
  if (!active) return "Inactiva"
  if (!nextDueDate) return "Sin próxima fecha"
  const today = new Date().toISOString().slice(0, 10)
  if (nextDueDate < today) return "Vencida"
  if (nextDueDate === today) return "Hoy"
  const due = new Date(nextDueDate + "T12:00:00")
  const start = new Date(today + "T12:00:00")
  const days = Math.round((due.getTime() - start.getTime()) / 86400000)
  return days <= 7 ? "Próxima" : "Programada"
}

const emptyForm: FormState = {
  apparatus_registry_id: "", name: "", description: "", maintenance_type: "INTERNAL",
  external_company: "", periodicity_value: "1", periodicity_unit: "MONTH", start_date: "",
  active: true, email_enabled: false, days_before: "7", notify_on_due: true,
  notify_when_overdue: true, overdue_repeat_days: "2", recipient_ids: [], external_emails: "",
}
const emptyControl: Control = { label: "", input_type: "NUMBER", unit: "", min_value: "", max_value: "", required: true }

const PERIODICITY_OPTIONS = [
  { value: "1-DAY", label: "Diario", periodicity_value: 1, periodicity_unit: "DAY" as const },
  { value: "1-WEEK", label: "Semanal", periodicity_value: 1, periodicity_unit: "WEEK" as const },
  { value: "2-WEEK", label: "Quincenal", periodicity_value: 2, periodicity_unit: "WEEK" as const },
  { value: "1-MONTH", label: "Mensual", periodicity_value: 1, periodicity_unit: "MONTH" as const },
  { value: "2-MONTH", label: "Bimensual", periodicity_value: 2, periodicity_unit: "MONTH" as const },
  { value: "3-MONTH", label: "Trimestral", periodicity_value: 3, periodicity_unit: "MONTH" as const },
  { value: "6-MONTH", label: "Semestral", periodicity_value: 6, periodicity_unit: "MONTH" as const },
  { value: "1-YEAR", label: "Anual", periodicity_value: 1, periodicity_unit: "YEAR" as const },
] as const

function periodicitySelectValue(value: number | null, unit: FormState["periodicity_unit"]) {
  const option = PERIODICITY_OPTIONS.find(
    (item) => item.periodicity_value === value && item.periodicity_unit === unit,
  )
  return option?.value ?? ""
}

export default function MaintenancePage() {
  useHotelDay()
  const navigate = useNavigate()
  const { alert: showAlert } = useSystemDialog()
  const { hotel } = useHotelScope()
  const [hotelId, setHotelId] = useState("")
  const [apparatus, setApparatus] = useState<Apparatus[]>([])
  const [planApparatus, setPlanApparatus] = useState<Apparatus[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [planEquipment, setPlanEquipment] = useState<Record<string, PlanEquipment[]>>({})
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [controls, setControls] = useState<Control[]>([])
  const [originalControlIds, setOriginalControlIds] = useState<string[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([])
  const [executionFormOpen, setExecutionFormOpen] = useState(false)
  const [executionValues, setExecutionValues] = useState<ExecutionValue[]>([])
  const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState<File[]>([])
  const [planPhotos, setPlanPhotos] = useState<PlanPhoto[]>([])
  const [pendingPlanPhotos, setPendingPlanPhotos] = useState<File[]>([])
  const [executionForm, setExecutionForm] = useState<ExecutionFormState>({
    scheduled_date: "",
    executed_at: localDateTimeValue(),
    performer_name: "",
    performer_company: "",
    observations: "",
  })
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [executionSaving, setExecutionSaving] = useState(false)
  const [error, setError] = useState("")

  async function loadBase() {
    setLoading(true)
    setError("")
    if (!hotel?.id) {
      setError("No se ha seleccionado un hotel de trabajo.")
      setLoading(false)
      return
    }

    const id = hotel.id
    setHotelId(id)

    await supabase.rpc("refresh_maintenance_due_alerts", { target_hotel_id: id })

    const [a, p, r, al, ps] = await Promise.all([
      supabase.from("apparatus_registry").select("id, code, name, plant, location, source_id").eq("hotel_id", id).eq("active", true).order("code"),
      supabase.from("maintenance_plans").select("id, apparatus_registry_id, name, description, maintenance_type, external_company, periodicity_value, periodicity_unit, start_date, next_due_date, active, apparatus_registry(code, name)").eq("hotel_id", id).order("next_due_date", { ascending: true, nullsFirst: false }),
      supabase.rpc("get_maintenance_alert_recipients", { target_hotel_id: id }),
      supabase.from("maintenance_alerts").select("id, maintenance_plan_id, alert_type, severity, title, message, due_date, triggered_at").eq("hotel_id", id).is("resolved_at", null).order("triggered_at", { ascending: false }),
      supabase.from("pam_maintenance_schedule")
        .select("maintenance_plan_id, apparatus_registry_id, apparatus_code, apparatus_name, plant, location")
        .eq("hotel_id", id)
        .not("apparatus_registry_id", "is", null),
    ])

    const firstError = a.error ?? p.error ?? r.error ?? al.error
    if (firstError) {
      setError(firstError.message)
    } else {
      const loadedApparatus = (a.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        plant: row.plant,
        location: row.location,
        sourceId: row.source_id ?? null,
      })) as Apparatus[]
      setApparatus(loadedApparatus)
      if (!selectedId) setPlanApparatus(loadedApparatus)
      const resolvedByPlan: Record<string, PlanEquipment[]> = {}
      for (const row of ps.data ?? []) {
        if (!row.maintenance_plan_id || !row.apparatus_registry_id) continue
        const current = resolvedByPlan[row.maintenance_plan_id] ?? []
        if (current.some((item) => item.id === row.apparatus_registry_id)) continue
        current.push({
          id: row.apparatus_registry_id,
          code: row.apparatus_code ?? "—",
          name: row.apparatus_name ?? "Equipo",
          plant: row.plant ?? null,
          location: row.location ?? null,
        })
        resolvedByPlan[row.maintenance_plan_id] = current
      }

      setPlans((p.data ?? []) as unknown as Plan[])
      setPlanEquipment(resolvedByPlan)
      setRecipients((r.data ?? []) as Recipient[])
      setAlerts((al.data ?? []) as MaintenanceAlert[])
    }
    setLoading(false)
  }
  useEffect(() => { void loadBase() }, [hotel?.id])

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) { setForm((current) => ({ ...current, [field]: value })) }
  function newPlan() {
    setSelectedId(null)
    setPlanApparatus(apparatus)
    setOriginalControlIds([])
    setControls([{ ...emptyControl }])
    setExecutions([])
    setExecutionFormOpen(false)
    setExecutionValues([])
    setPendingEvidenceFiles([])
    setPlanPhotos([])
    setPendingPlanPhotos([])
    setExecutionForm({
      scheduled_date: "",
      executed_at: localDateTimeValue(),
      performer_name: "",
      performer_company: "",
      observations: "",
    })
    setForm({ ...emptyForm, start_date: new Date().toISOString().slice(0, 10) })
    setError("")
  }

  async function selectPlan(plan: Plan) {
    setSelectedId(plan.id)
    setExecutionFormOpen(false)
    setError("")
    const [c, config, executionQuery, photoQuery, linkQuery] = await Promise.all([
      supabase.from("maintenance_controls")
        .select("id, label, input_type, unit, min_value, max_value, required")
        .eq("maintenance_plan_id", plan.id)
        .eq("active", true)
        .order("sort_order"),
      supabase.from("maintenance_alert_configs")
        .select("id, email_enabled, days_before, notify_on_due, notify_when_overdue, overdue_repeat_days")
        .eq("maintenance_plan_id", plan.id)
        .maybeSingle(),
      supabase.from("maintenance_executions")
        .select("id, maintenance_plan_id, scheduled_date, executed_at, executed_by, performer_name, performer_company, result, observations, evidence_files")
        .eq("maintenance_plan_id", plan.id)
        .order("executed_at", { ascending: false, nullsFirst: false }),
      supabase.from("maintenance_plan_photos")
        .select("id, storage_path, file_name, mime_type, file_size, uploaded_by, uploaded_at")
        .eq("maintenance_plan_id", plan.id)
        .order("uploaded_at", { ascending: false }),
      supabase.from("pam_maintenance_plan_links")
        .select("source_group_id, source_apparatus_id")
        .eq("maintenance_plan_id", plan.id)
        .maybeSingle(),
    ])
    if (c.error || config.error || executionQuery.error || photoQuery.error || linkQuery.error) {
      setError(
        c.error?.message
        ?? config.error?.message
        ?? executionQuery.error?.message
        ?? photoQuery.error?.message
        ?? linkQuery.error?.message
        ?? "No se ha podido cargar el mantenimiento.",
      )
      return
    }

    let recipientIds: string[] = []
    let externalEmails = ""
    if (config.data?.id) {
      const [u, e] = await Promise.all([
        supabase.from("maintenance_alert_users").select("user_id").eq("alert_config_id", config.data.id),
        supabase.from("maintenance_alert_emails").select("email").eq("alert_config_id", config.data.id).order("created_at"),
      ])
      if (u.error || e.error) {
        setError(u.error?.message ?? e.error?.message ?? "No se han podido cargar los destinatarios.")
        return
      }
      recipientIds = (u.data ?? []).map((row) => row.user_id)
      externalEmails = (e.data ?? []).map((row) => row.email).join("\n")
    }

    const loadedControls = (c.data ?? []) as Array<{
      id: string
      label: string
      input_type: Control["input_type"]
      unit: string | null
      min_value: number | null
      max_value: number | null
      required: boolean
    }>
    setOriginalControlIds(loadedControls.map((row) => row.id))
    setControls(loadedControls.map((row) => ({
      id: row.id, label: row.label, input_type: row.input_type, unit: row.unit ?? "",
      min_value: row.min_value?.toString() ?? "", max_value: row.max_value?.toString() ?? "", required: row.required,
    })))
    setExecutions((executionQuery.data ?? []) as Execution[])

    const loadedPlanPhotos = await Promise.all(
      (photoQuery.data ?? []).map(async (photo) => {
        const signed = await supabase.storage
          .from("maintenance-evidence")
          .createSignedUrl(photo.storage_path, 300)
        return {
          ...photo,
          signed_url: signed.data?.signedUrl ?? undefined,
        } as PlanPhoto
      }),
    )
    setPlanPhotos(loadedPlanPhotos)
    setPendingPlanPhotos([])

    setExecutionValues(loadedControls.map((row) => ({ controlId: row.id, value: "" })))

    let resolvedPlanApparatus: Apparatus[] = []
    let resolvedApparatusId = plan.apparatus_registry_id ?? ""

    if (linkQuery.data?.source_group_id) {
      const groupQuery = await supabase
        .from("pam_maintenance_schedule")
        .select("source_apparatus_id, apparatus_registry_id, apparatus_code, apparatus_name, plant, location")
        .eq("source_group_id", linkQuery.data.source_group_id)

      if (groupQuery.error) {
        setError(groupQuery.error.message)
      } else {
        const unique = new Map<string, Apparatus>()

        for (const row of groupQuery.data ?? []) {
          if (!row.apparatus_registry_id || unique.has(row.apparatus_registry_id)) continue

          unique.set(row.apparatus_registry_id, {
            id: row.apparatus_registry_id,
            code: row.apparatus_code ?? "—",
            name: row.apparatus_name ?? "Equipo",
            plant: row.plant ?? null,
            location: row.location ?? null,
            sourceId: row.source_apparatus_id ?? null,
          })
        }

        resolvedPlanApparatus = Array.from(unique.values())
        setPlanApparatus(resolvedPlanApparatus)

        const linked = resolvedPlanApparatus.find(
          (item) =>
            item.id === plan.apparatus_registry_id ||
            (item.id && linkQuery.data?.source_apparatus_id === (apparatus.find((entry) => entry.id === item.id)?.sourceId ?? null)),
        )

        if (linked) resolvedApparatusId = linked.id
      }
    }

    if (!resolvedPlanApparatus.length) {
      const current = apparatus.find((item) => item.id === plan.apparatus_registry_id)
      setPlanApparatus(current ? [current] : [])
    }

    setForm({
      apparatus_registry_id: resolvedApparatusId, name: plan.name, description: "",
      maintenance_type: plan.maintenance_type, external_company: plan.external_company ?? "",
      periodicity_value: plan.periodicity_value?.toString() ?? "", periodicity_unit: plan.periodicity_unit ?? "VARIABLE",
      start_date: plan.start_date ?? "", active: plan.active, email_enabled: config.data?.email_enabled ?? false,
      days_before: config.data?.days_before?.toString() ?? "7", notify_on_due: config.data?.notify_on_due ?? true,
      notify_when_overdue: config.data?.notify_when_overdue ?? true, overdue_repeat_days: config.data?.overdue_repeat_days?.toString() ?? "2",
      recipient_ids: recipientIds, external_emails: externalEmails,
    })
  }

  function openExecutionForm() {
    const selectedPlan = plans.find((plan) => plan.id === selectedId)
    if (!selectedPlan) return
    const access = planAccess(selectedPlan)
    if (!access.allowed) { setError(access.message); return }
    setExecutionForm({
      scheduled_date: selectedPlan.next_due_date ?? new Date().toISOString().slice(0, 10),
      executed_at: localDateTimeValue(),
      performer_name: "",
      performer_company: selectedPlan.maintenance_type === "EXTERNAL" ? selectedPlan.external_company ?? "" : "",
      observations: "",
    })
    setExecutionValues(controls.filter((control) => control.id).map((control) => ({
      controlId: control.id as string,
      value: "",
    })))
    setPendingEvidenceFiles([])
    setExecutionFormOpen(true)
    setError("")
  }

  function updateExecutionValue(controlId: string, value: string) {
    setExecutionValues((current) => {
      const existing = current.find((item) => item.controlId === controlId)
      if (existing) return current.map((item) => item.controlId === controlId ? { ...item, value } : item)
      return [...current, { controlId, value }]
    })
  }

  function updateControl(index: number, field: keyof Control, value: string | boolean) {
    setControls((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  }

  function parseEmails(value: string) { return Array.from(new Set(value.split(/[;,\n]/g).map((email) => email.trim().toLowerCase()).filter(Boolean))) }

  async function save(event: FormEvent) {
    event.preventDefault(); if (saving) return; setSaving(true); setError("")
    if (!hotelId || !form.apparatus_registry_id || !form.name.trim()) { setError("Indica el equipo o instalación y el nombre del mantenimiento."); setSaving(false); return }
    if (form.maintenance_type === "EXTERNAL" && !form.external_company.trim()) { setError("Indica la empresa mantenedora para un mantenimiento externo."); setSaving(false); return }
    if (!periodicitySelectValue(
      Number(form.periodicity_value),
      form.periodicity_unit,
    )) {
      setError("Selecciona una periodicidad válida.")
      setSaving(false)
      return
    }
    const numericControls = controls.filter((control) => control.label.trim() && control.input_type === "NUMBER")
    if (numericControls.some((control) => control.min_value && control.max_value && Number(control.min_value) > Number(control.max_value))) { setError("Hay un rango de control incorrecto."); setSaving(false); return }
    const planFields = {
      hotel_id: hotelId, apparatus_registry_id: form.apparatus_registry_id, name: form.name.trim(), description: form.description.trim() || null,
      maintenance_type: form.maintenance_type, external_company: form.maintenance_type === "EXTERNAL" ? form.external_company.trim() : null,
      periodicity_value: Number(form.periodicity_value),
      periodicity_unit: form.periodicity_unit,
      start_date: form.start_date || null, active: form.active,
    }
    let planId = selectedId
    if (planId) {
      const result = await supabase.from("maintenance_plans").update(planFields).eq("id", planId)
      if (result.error) { setError(result.error.message); setSaving(false); return }
    } else {
      const result = await supabase.from("maintenance_plans").insert({
        ...planFields,
        next_due_date: form.start_date || null,
      }).select("id").single()
      if (result.error || !result.data?.id) { setError(result.error?.message ?? "No se ha podido crear el mantenimiento."); setSaving(false); return }
      planId = result.data.id
    }
    if (!planId) { setError("No se ha podido determinar el mantenimiento."); setSaving(false); return }
    const rows = controls.filter((control) => control.label.trim()).map((control, index) => ({
      ...(control.id ? { id: control.id } : {}), maintenance_plan_id: planId, label: control.label.trim(), input_type: control.input_type,
      unit: control.unit.trim() || null, min_value: control.input_type === "NUMBER" && control.min_value ? Number(control.min_value) : null,
      max_value: control.input_type === "NUMBER" && control.max_value ? Number(control.max_value) : null, required: control.required,
      sort_order: index, active: true, alert_on_out_of_range: control.input_type === "NUMBER",
    }))
    if (rows.length) {
      const result = await supabase.from("maintenance_controls").upsert(rows)
      if (result.error) { setError(result.error.message); setSaving(false); return }
    }
    const removedControlIds = originalControlIds.filter(
      (id) => !controls.some((control) => control.id === id),
    )
    if (removedControlIds.length) {
      const result = await supabase
        .from("maintenance_controls")
        .update({ active: false })
        .in("id", removedControlIds)
      if (result.error) { setError(result.error.message); setSaving(false); return }
    }
    const config = await supabase.from("maintenance_alert_configs").upsert({
      maintenance_plan_id: planId, email_enabled: form.email_enabled, days_before: Math.max(0, Number(form.days_before) || 0),
      notify_on_due: form.notify_on_due, notify_when_overdue: form.notify_when_overdue, overdue_repeat_days: Math.max(1, Number(form.overdue_repeat_days) || 1),
    }, { onConflict: "maintenance_plan_id" }).select("id").single()
    if (config.error || !config.data?.id) { setError(config.error?.message ?? "No se ha podido guardar la configuración de avisos."); setSaving(false); return }
    const configId = config.data.id
    await supabase.from("maintenance_alert_users").delete().eq("alert_config_id", configId)
    if (form.recipient_ids.length) { const result = await supabase.from("maintenance_alert_users").insert(form.recipient_ids.map((userId) => ({ alert_config_id: configId, user_id: userId }))); if (result.error) { setError(result.error.message); setSaving(false); return } }
    await supabase.from("maintenance_alert_emails").delete().eq("alert_config_id", configId)
    const emails = parseEmails(form.external_emails)
    if (emails.length) { const result = await supabase.from("maintenance_alert_emails").insert(emails.map((email) => ({ alert_config_id: configId, email }))); if (result.error) { setError(result.error.message); setSaving(false); return } }

    if (pendingPlanPhotos.length) {
      const uploaded = await uploadPendingPlanPhotos(planId)
      if (!uploaded) {
        setSaving(false)
        return
      }
    }

    await loadBase(); setSelectedId(planId); setSaving(false)
    await showAlert({ title: "Mantenimiento guardado", message: "La configuración se ha guardado correctamente.", variant: "info" })
  }

  function handleEvidenceFiles(event: ChangeEvent<HTMLInputElement>) {
    setPendingEvidenceFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  function addPlanPhotoFiles(files: File[]) {
    const selected = files.filter((file) => file.type.startsWith("image/"))
    if (selected.length) {
      setPendingPlanPhotos((current) => [...current, ...selected])
    }
  }

  function handlePlanPhotoFiles(event: ChangeEvent<HTMLInputElement>) {
    addPlanPhotoFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  async function openPlanPhoto(path: string) {
    const result = await supabase.storage.from("maintenance-evidence").createSignedUrl(path, 300)
    if (result.error || !result.data?.signedUrl) {
      setError(result.error?.message ?? "No se ha podido abrir la fotografía.")
      return
    }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function uploadPendingPlanPhotos(planId: string) {
    if (!hotelId || pendingPlanPhotos.length === 0) return true

    const currentUser = await supabase.auth.getUser()
    const uploaded: PlanPhoto[] = []

    for (let index = 0; index < pendingPlanPhotos.length; index += 1) {
      const file = pendingPlanPhotos[index]
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")
      const storagePath =
        hotelId
        + "/maintenance-plans/"
        + planId
        + "/"
        + crypto.randomUUID()
        + "-"
        + safeName

      const upload = await supabase.storage.from("maintenance-evidence").upload(storagePath, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      })

      if (upload.error) {
        setPendingPlanPhotos((current) => current.slice(index))
        setError("El mantenimiento se ha guardado, pero una fotografía no pudo subirse: " + upload.error.message)
        return false
      }

      const inserted = await supabase.from("maintenance_plan_photos").insert({
        hotel_id: hotelId,
        maintenance_plan_id: planId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: currentUser.data.user?.id ?? null,
      }).select("id, storage_path, file_name, mime_type, file_size, uploaded_by, uploaded_at").single()

      if (inserted.error || !inserted.data) {
        await supabase.storage.from("maintenance-evidence").remove([storagePath])
        setPendingPlanPhotos((current) => current.slice(index))
        setError("El mantenimiento se ha guardado, pero no se pudo registrar la fotografía: " + (inserted.error?.message ?? "Error desconocido."))
        return false
      }

      const signed = await supabase.storage.from("maintenance-evidence").createSignedUrl(storagePath, 300)
      uploaded.push({
        ...inserted.data,
        signed_url: signed.data?.signedUrl ?? undefined,
      } as PlanPhoto)
    }

    setPlanPhotos((current) => [...uploaded, ...current])
    setPendingPlanPhotos([])
    return true
  }

  async function deletePlanPhoto(photo: PlanPhoto) {
    const storageResult = await supabase.storage.from("maintenance-evidence").remove([photo.storage_path])
    if (storageResult.error) {
      setError(storageResult.error.message)
      return
    }

    const databaseResult = await supabase
      .from("maintenance_plan_photos")
      .delete()
      .eq("id", photo.id)

    if (databaseResult.error) {
      setError(databaseResult.error.message)
      return
    }

    setPlanPhotos((current) => current.filter((item) => item.id !== photo.id))
  }

  async function openEvidence(path: string) {
    const result = await supabase.storage.from("maintenance-evidence").createSignedUrl(path, 300)
    if (result.error || !result.data?.signedUrl) {
      setError(result.error?.message ?? "No se ha podido abrir la evidencia.")
      return
    }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function saveExecution(event: FormEvent) {
    event.preventDefault()
    if (executionSaving || !selectedId) return
    const access = planAccess(plans.find(plan => plan.id === selectedId))
    if (!access.allowed) { setError(access.message); return }
    setExecutionSaving(true)
    setError("")

    if (!executionForm.executed_at) {
      setError("Indica la fecha y hora reales de ejecución.")
      setExecutionSaving(false)
      return
    }

    const currentUser = await supabase.auth.getUser()
    if (currentUser.error || !currentUser.data.user?.id) {
      setError(currentUser.error?.message ?? "No se ha podido identificar al usuario que registra la ejecución.")
      setExecutionSaving(false)
      return
    }

    const selectedPlan = plans.find((plan) => plan.id === selectedId)
    const executedAt = new Date(executionForm.executed_at)

    const invalidNumericControl = controls.some((control) => {
      if (!control.id || control.input_type !== "NUMBER") return false
      const rawValue = (executionValues.find((item) => item.controlId === control.id)?.value ?? "").trim()
      return rawValue !== "" && !Number.isFinite(Number(rawValue))
    })
    if (invalidNumericControl) {
      setError("Hay un valor numérico de control que no es válido.")
      setExecutionSaving(false)
      return
    }
    if (Number.isNaN(executedAt.getTime())) {
      setError("La fecha y hora de ejecución no son válidas.")
      setExecutionSaving(false)
      return
    }
    if (hotelDay(executedAt) > hotelDay() || (selectedPlan?.next_due_date && hotelDay(executedAt) < selectedPlan.next_due_date)) {
      setError('La fecha debe corresponder a una revisión vencida y no puede ser futura.'); setExecutionSaving(false); return
    }

    const execution = await supabase.from("maintenance_executions")
      .insert({
        maintenance_plan_id: selectedId,
        scheduled_date: executionForm.scheduled_date || null,
        executed_at: executedAt.toISOString(),
        executed_by: currentUser.data.user.id,
        performer_name: executionForm.performer_name.trim() || null,
        performer_company: executionForm.performer_company.trim() || (selectedPlan?.external_company ?? null),
        result: "COMPLETED",
        observations: executionForm.observations.trim() || null,
      })
      .select("id")
      .single()

    if (execution.error || !execution.data?.id) {
      setError(execution.error?.message ?? "No se ha podido registrar la ejecución.")
      setExecutionSaving(false)
      return
    }

    const controlRows = controls.filter((control) => control.id).map((control) => {
      const value = (executionValues.find((item) => item.controlId === control.id)?.value ?? "").trim()
      return {
        execution_id: execution.data.id,
        maintenance_control_id: control.id as string,
        numeric_value: control.input_type === "NUMBER" && value !== "" ? Number(value) : null,
        text_value: control.input_type === "TEXT" && value !== "" ? value : null,
        boolean_value: control.input_type === "BOOLEAN" && value !== "" ? value === "true" : null,
        date_value: control.input_type === "DATE" && value !== "" ? value : null,
        time_value: control.input_type === "TIME" && value !== "" ? value : null,
        selected_value: control.input_type === "SELECT" && value !== "" ? value : null,
        observed_at: executedAt.toISOString(),
      }
    })

    if (controlRows.length) {
      const results = await supabase.from("maintenance_control_results").upsert(controlRows, {
        onConflict: "execution_id,maintenance_control_id",
      })
      if (results.error) {
        setError("La ejecución se ha registrado, pero no se pudieron guardar todos los controles: " + results.error.message)
        setExecutionSaving(false)
        return
      }
    }

    const evidence: EvidenceFile[] = []
    for (const file of pendingEvidenceFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")
      const evidencePath = hotelId + "/" + selectedId + "/" + execution.data.id + "/" + crypto.randomUUID() + "-" + safeName
      const upload = await supabase.storage.from("maintenance-evidence").upload(evidencePath, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      })
      if (upload.error) {
        setError("La ejecución se ha registrado, pero una evidencia no pudo subirse: " + upload.error.message)
        setExecutionSaving(false)
        return
      }
      evidence.push({
        path: evidencePath,
        name: file.name,
        type: file.type,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      })
    }

    if (evidence.length) {
      const evidenceUpdate = await supabase.from("maintenance_executions").update({
        evidence_files: evidence,
      }).eq("id", execution.data.id)
      if (evidenceUpdate.error) {
        setError("La ejecución se ha registrado, pero no se pudo guardar la referencia de las evidencias: " + evidenceUpdate.error.message)
        setExecutionSaving(false)
        return
      }
    }

    await loadBase()
    setExecutionFormOpen(false)
    setExecutionSaving(false)

    if (selectedPlan) {
      const refreshed = await supabase.from("maintenance_plans")
        .select("id, apparatus_registry_id, name, description, maintenance_type, external_company, periodicity_value, periodicity_unit, start_date, next_due_date, active, apparatus_registry(code, name)")
        .eq("id", selectedId)
        .single()
      if (!refreshed.error && refreshed.data) await selectPlan(refreshed.data as unknown as Plan)
    }

    await showAlert({
      title: "Ejecución registrada",
      message: "La ejecución real se ha registrado. El resultado y la próxima fecha se calculan automáticamente.",
      variant: "info",
    })
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 sm:mb-4">
          <BrandLogo label="Inicio Arias Suite" onActivate={() => navigate("/")} className="h-14 w-auto object-contain sm:h-16" />
          <div className="flex items-center gap-2"><BackButton onBack={() => navigate(-1)} /><HomeButton onHome={() => navigate("/")} /></div>
        </div>
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-xl font-semibold">Mantenimientos</h1><p className="mt-1 text-sm text-slate-500">Configuración de revisiones, controles y avisos automáticos.</p></div>
            <div className="w-full sm:w-auto"><ActionButton icon={Plus} label="Nuevo mantenimiento" onClick={newPlan} /></div>
          </div>
        </header>
        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
        <main className="mt-3 grid gap-3 xl:mt-4 xl:gap-4 xl:grid-cols-[420px_1fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {alerts.length > 0 && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle size={17} />
                  Alertas activas: {alerts.length}
                </div>
                <div className="mt-2 space-y-1">
                  {alerts.slice(0, 5).map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(alert.maintenance_plan_id)
                        const plan = plans.find((item) => item.id === alert.maintenance_plan_id)
                        if (plan) void selectPlan(plan)
                      }}
                      className="block w-full text-left text-xs text-amber-900 hover:underline"
                    >
                      {alert.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Planes de mantenimiento</div>
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Cargando…</div> : plans.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Todavía no hay mantenimientos configurados.</div> :
              <div className="max-h-[48vh] overflow-auto sm:max-h-[55vh] xl:max-h-[calc(100vh-220px)]">{plans.map((plan) => <button key={plan.id} type="button" onClick={() => void selectPlan(plan)} className={"w-full border-b border-slate-100 px-4 py-3 text-left transition " + (selectedId === plan.id ? "bg-blue-50" : "hover:bg-slate-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{plan.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(() => {
                        const equipment = plan.apparatus
                          ? [{ code: plan.apparatus.code, name: plan.apparatus.name }]
                          : (planEquipment[plan.id] ?? [])
                        if (equipment.length === 0) return "Equipo no disponible"
                        if (equipment.length === 1) return equipment[0].code + " · " + equipment[0].name
                        return equipment.slice(0, 2).map((item) => item.code + " · " + item.name).join(" · ")
                          + (equipment.length > 2 ? " · +" + (equipment.length - 2) : "")
                      })()}
                    </div>
                  </div>
                  <span className={
                    "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold " +
                    (planState(plan.next_due_date, plan.active) === "Vencida"
                      ? "bg-rose-100 text-rose-700"
                      : planState(plan.next_due_date, plan.active) === "Hoy"
                        ? "bg-amber-100 text-amber-700"
                        : planState(plan.next_due_date, plan.active) === "Próxima"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600")
                  }>
                    {planState(plan.next_due_date, plan.active)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Próxima: {plan.next_due_date
                    ? new Date(plan.next_due_date + "T12:00:00").toLocaleDateString("es-ES")
                    : "Sin fecha"}
                </div>
              </button>)}</div>
            }
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            {!form.name ? <div className="flex min-h-[280px] items-center justify-center px-2 text-center sm:min-h-[520px]"><div><Bell className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-semibold text-slate-700">Configura un mantenimiento</h2><p className="mt-2 max-w-md text-sm text-slate-500">Define el equipo, periodicidad, controles y las personas que deben recibir los avisos.</p></div></div> :
            <>
            <form onSubmit={save} className="space-y-6">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{form.name}</h2>
                  <p className="text-sm text-slate-500">
                    {selectedId ? "Plan existente" : "Nuevo plan"}
                  </p>
                </div>
                <ActionButton
                  icon={PlayCircle}
                  label="Registrar ejecución"
                  onClick={openExecutionForm}
                  disabled={!selectedId || !planAccess(plans.find(plan => plan.id === selectedId)).allowed}
                />
              </div>
              {selectedId && <p role="status" className="text-sm text-sky-800">{planAccess(plans.find(plan => plan.id === selectedId)).message}</p>}
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <label><span className="mb-1 block text-sm font-medium">Equipo / instalación</span><select value={form.apparatus_registry_id} onChange={(e) => setField("apparatus_registry_id", e.target.value)} className="w-full rounded-xl border px-3 py-2"><option value="">Selecciona un equipo…</option>{(planApparatus.length ? planApparatus : apparatus).map((item) => <option key={item.id} value={item.id}>{item.sourceId ?? "—"} — {item.code} — {item.name}{item.plant ? " · " + item.plant : ""}{item.location ? " · " + item.location : ""}</option>)}</select></label>
                <label><span className="mb-1 block text-sm font-medium">Nombre del mantenimiento</span><input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Ej.: Revisión mensual ascensor" className="w-full rounded-xl border px-3 py-2" /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">Descripción</span><textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2" /></label>
                <label><span className="mb-1 block text-sm font-medium">Tipo</span><select value={form.maintenance_type} onChange={(e) => setField("maintenance_type", e.target.value as FormState["maintenance_type"])} className="w-full rounded-xl border bg-white px-3 py-2"><option value="INTERNAL">Interno</option><option value="EXTERNAL">Externo</option></select></label>
                {form.maintenance_type === "EXTERNAL" && <label><span className="mb-1 block text-sm font-medium">Empresa mantenedora</span><input value={form.external_company} onChange={(e) => setField("external_company", e.target.value)} placeholder="Ej.: KONE" className="w-full rounded-xl border px-3 py-2" /></label>}
                <label>
                  <span className="mb-1 block text-sm font-medium">Periodicidad</span>
                  <select
                    value={periodicitySelectValue(Number(form.periodicity_value), form.periodicity_unit)}
                    onChange={(event) => {
                      const option = PERIODICITY_OPTIONS.find((item) => item.value === event.target.value)
                      if (!option) return
                      setField("periodicity_value", String(option.periodicity_value))
                      setField("periodicity_unit", option.periodicity_unit)
                    }}
                    className="w-full rounded-xl border bg-white px-3 py-2"
                  >
                    <option value="">Selecciona una periodicidad…</option>
                    {PERIODICITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label><span className="mb-1 block text-sm font-medium">Inicio</span><input type="date" value={form.start_date} onChange={(e) => setField("start_date", e.target.value)} className="w-full rounded-xl border px-3 py-2" /></label>
                <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} />Mantenimiento activo</label>
              </div>
              <section className="rounded-2xl border bg-slate-50 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold">Fotografías del mantenimiento</h2>
                    <p className="text-xs text-slate-500">Fotos de referencia del mantenimiento. Se guardan al pulsar «Guardar mantenimiento».</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                      <Camera size={16} />
                      Hacer foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePlanPhotoFiles}
                        className="hidden"
                      />
                    </label>
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                      <ImagePlus size={16} />
                      Galería
                      <input type="file" multiple accept="image/*" onChange={handlePlanPhotoFiles} className="hidden" />
                    </label>
                  </div>
                </div>

                {pendingPlanPhotos.length > 0 && (
                  <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                    <div className="text-sm font-semibold text-slate-800">Pendientes de guardar</div>
                    <div className="mt-1 text-xs text-slate-600">{pendingPlanPhotos.map((file) => file.name).join(" · ")}</div>
                  </div>
                )}

                {planPhotos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {planPhotos.map((photo) => (
                      <div key={photo.id} className="overflow-hidden rounded-xl border bg-white">
                        <button
                          type="button"
                          onClick={() => void openPlanPhoto(photo.storage_path)}
                          className="block aspect-[4/3] w-full bg-slate-100"
                          title="Abrir fotografía"
                        >
                          {photo.signed_url ? (
                            <img src={photo.signed_url} alt={photo.file_name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-500">Vista no disponible</div>
                          )}
                        </button>
                        <div className="flex items-center justify-between gap-2 p-2">
                          <span className="truncate text-xs text-slate-600" title={photo.file_name}>{photo.file_name}</span>
                          <button
                            type="button"
                            onClick={() => void deletePlanPhoto(photo)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                            title="Eliminar fotografía"
                            aria-label={"Eliminar " + photo.file_name}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
                    No hay fotografías asociadas a este mantenimiento.
                  </div>
                )}
              </section>

              <section className="rounded-2xl border bg-slate-50 p-3 sm:p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Controles de la revisión</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Un control es una comprobación concreta que se registra al ejecutar este mantenimiento. Por ejemplo: temperatura, presión o un estado Sí / No. Puede tener unidad, límites y ser obligatorio.
                    </p>
                  </div>
                  <button type="button" onClick={() => setControls((current) => [...current, { ...emptyControl }])} className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm">
                    <Plus size={16} />Añadir control
                  </button>
                </div>
                <div className="space-y-3">{controls.map((control, index) => <div key={control.id ?? "new-" + index} className="rounded-xl border bg-white p-3"><div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"><input value={control.label} onChange={(e) => updateControl(index, "label", e.target.value)} placeholder="Ej.: Cloro libre" className="rounded-lg border px-3 py-2" /><select value={control.input_type} onChange={(e) => updateControl(index, "input_type", e.target.value)} className="rounded-lg border bg-white px-3 py-2"><option value="NUMBER">Número</option><option value="TEXT">Texto</option><option value="BOOLEAN">Sí / No</option><option value="DATE">Fecha</option><option value="TIME">Hora</option><option value="SELECT">Selección</option></select><input value={control.unit} onChange={(e) => updateControl(index, "unit", e.target.value)} placeholder="Unidad" className="rounded-lg border px-3 py-2" /><div className="grid grid-cols-2 gap-2"><input type="number" value={control.min_value} disabled={control.input_type !== "NUMBER"} onChange={(e) => updateControl(index, "min_value", e.target.value)} placeholder="Mín." className="rounded-lg border px-3 py-2 disabled:bg-slate-100" /><input type="number" value={control.max_value} disabled={control.input_type !== "NUMBER"} onChange={(e) => updateControl(index, "max_value", e.target.value)} placeholder="Máx." className="rounded-lg border px-3 py-2 disabled:bg-slate-100" /></div><button type="button" onClick={() => setControls((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-200 text-rose-600" title="Eliminar control"><Trash2 size={17} /></button></div><label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={control.required} onChange={(e) => updateControl(index, "required", e.target.checked)} />Dato obligatorio para considerar realizada la revisión</label></div>)}</div>
              </section>
              <section className="rounded-2xl border bg-slate-50 p-3 sm:p-4">
                <div className="flex items-start gap-3"><Mail className="mt-0.5 text-slate-500" size={20} /><div className="flex-1"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Avisos por email</h2><p className="text-xs text-slate-500">Avisos internos de control. No se envían automáticamente a la empresa mantenedora.</p></div><label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.email_enabled} onChange={(e) => setField("email_enabled", e.target.checked)} />Activar</label></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Aviso previo (días)</span><input type="number" min={0} value={form.days_before} onChange={(e) => setField("days_before", e.target.value)} className="w-full rounded-lg border px-3 py-2" /></label><label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.notify_on_due} onChange={(e) => setField("notify_on_due", e.target.checked)} />Avisar el día previsto</label><label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.notify_when_overdue} onChange={(e) => setField("notify_when_overdue", e.target.checked)} />Avisar si vence</label></div>
                <label className="mt-3 block max-w-xs"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Repetir vencido (días)</span><input type="number" min={1} value={form.overdue_repeat_days} onChange={(e) => setField("overdue_repeat_days", e.target.value)} className="w-full rounded-lg border px-3 py-2" /></label>
                <div className="mt-5"><h3 className="text-sm font-semibold">Usuarios SSTT del hotel</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{recipients.map((recipient) => { const checked = form.recipient_ids.includes(recipient.user_id); return <label key={recipient.user_id} className="flex items-start gap-3 rounded-lg border bg-white px-3 py-2"><input type="checkbox" checked={checked} onChange={() => setField("recipient_ids", checked ? form.recipient_ids.filter((id) => id !== recipient.user_id) : [...form.recipient_ids, recipient.user_id])} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-medium">{recipient.full_name ?? "Usuario"}</span><span className="block text-xs text-slate-500">{recipient.role_name}{recipient.email ? " · " + recipient.email : " · Sin correo"}</span></span></label> })}</div>{recipients.length === 0 && <p className="mt-2 text-xs text-slate-500">No hay usuarios SSTT activos disponibles.</p>}</div>
                <label className="mt-5 block"><span className="mb-1 block text-sm font-semibold">Otros destinatarios</span><textarea value={form.external_emails} onChange={(e) => setField("external_emails", e.target.value)} rows={3} placeholder="Uno o varios emails, separados por salto de línea, coma o punto y coma." className="w-full rounded-lg border bg-white px-3 py-2" /></label>
                </div></div>
              </section>
              <div className="flex justify-end border-t pt-4"><ActionButton icon={Save} label={saving ? "Guardando…" : "Guardar mantenimiento"} tone="primary" type="submit" disabled={saving} /></div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold">Ejecuciones reales</h2>
                  <p className="text-xs text-slate-500">
                    La ejecución y los controles determinan automáticamente el resultado.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Clock3 size={15} />
                  {executions.length} registro{executions.length === 1 ? "" : "s"}
                </span>
              </div>

              {executionFormOpen && (
                <form onSubmit={saveExecution} className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-3 sm:p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Registrar ejecución real</h3>
                      <p className="text-xs text-slate-500">No se puede marcar «Revisado» manualmente.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExecutionFormOpen(false)}
                      className="rounded-lg border bg-white px-3 py-2 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-sm font-medium">Fecha programada</span>
                      <input
                        type="date"
                        value={executionForm.scheduled_date}
                        onChange={(event) => setExecutionForm((current) => ({ ...current, scheduled_date: event.target.value }))}
                        className="w-full rounded-xl border bg-white px-3 py-2"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-medium">Fecha y hora real</span>
                      <input
                        type="datetime-local"
                        value={executionForm.executed_at}
                        onChange={(event) => setExecutionForm((current) => ({ ...current, executed_at: event.target.value }))}
                        className="w-full rounded-xl border bg-white px-3 py-2"
                        required
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-medium">Persona que realizó el mantenimiento</span>
                      <input
                        value={executionForm.performer_name}
                        onChange={(event) => setExecutionForm((current) => ({ ...current, performer_name: event.target.value }))}
                        placeholder="Nombre"
                        className="w-full rounded-xl border bg-white px-3 py-2"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-medium">
                        {form.maintenance_type === "EXTERNAL" ? "Empresa que realizó el mantenimiento" : "Empresa / equipo ejecutor"}
                      </span>
                      <input
                        value={executionForm.performer_company}
                        onChange={(event) => setExecutionForm((current) => ({ ...current, performer_company: event.target.value }))}
                        placeholder={form.maintenance_type === "EXTERNAL" ? "Empresa mantenedora" : "Opcional"}
                        className="w-full rounded-xl border bg-white px-3 py-2"
                      />
                    </label>
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-medium">Observaciones</span>
                      <textarea
                        value={executionForm.observations}
                        onChange={(event) => setExecutionForm((current) => ({ ...current, observations: event.target.value }))}
                        rows={3}
                        className="w-full rounded-xl border bg-white px-3 py-2"
                      />
                    </label>
                  </div>

                  <div className="mt-5 rounded-xl border bg-white p-3">
                    <span className="mb-1 block text-sm font-semibold">Evidencias</span>
                    <span className="block text-xs text-slate-500">
                      Puedes adjuntar fotografías o PDF de la ejecución.
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                        <Camera size={16} />
                        Hacer foto
                        <input type="file" accept="image/*" capture="environment" onChange={handleEvidenceFiles} className="hidden" />
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                        <Upload size={16} />
                        Galería / archivos
                        <input type="file" multiple accept="image/*,.pdf" onChange={handleEvidenceFiles} className="hidden" />
                      </label>
                    </div>
                    {pendingEvidenceFiles.length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        {pendingEvidenceFiles.map((file) => file.name).join(" · ")}
                      </div>
                    )}
                  </div>

                  {controls.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <CalendarClock size={18} />
                        <h3 className="font-semibold">Controles de esta ejecución</h3>
                      </div>

                      {controls.map((control) => {
                        if (!control.id) return null
                        const currentValue =
                          executionValues.find((item) => item.controlId === control.id)?.value ?? ""

                        return (
                          <div key={control.id} className="rounded-xl border bg-white p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <label className="text-sm font-medium">
                                {control.label}
                                {control.required && <span className="ml-1 text-rose-500">*</span>}
                              </label>

                              {control.input_type === "NUMBER" && (
                                <span className="text-xs text-slate-500">
                                  {control.min_value || control.max_value
                                    ? "Rango: " + (control.min_value || "—") + " – " + (control.max_value || "—")
                                    : "Sin rango configurado"}
                                  {control.unit ? " · " + control.unit : ""}
                                </span>
                              )}
                            </div>

                            {control.input_type === "NUMBER" && (
                              <input
                                type="number"
                                step="any"
                                value={currentValue}
                                onChange={(event) => updateExecutionValue(control.id as string, event.target.value)}
                                className="mt-2 w-full rounded-lg border px-3 py-2"
                              />
                            )}

                            {control.input_type === "TEXT" && (
                              <input
                                value={currentValue}
                                onChange={(event) => updateExecutionValue(control.id as string, event.target.value)}
                                className="mt-2 w-full rounded-lg border px-3 py-2"
                              />
                            )}

                            {control.input_type === "BOOLEAN" && (
                              <select
                                value={currentValue}
                                onChange={(event) => updateExecutionValue(control.id as string, event.target.value)}
                                className="mt-2 w-full rounded-lg border bg-white px-3 py-2"
                              >
                                <option value="">Selecciona…</option>
                                <option value="true">Sí</option>
                                <option value="false">No</option>
                              </select>
                            )}

                            {control.input_type === "DATE" && (
                              <input
                                type="date"
                                value={currentValue}
                                onChange={(event) => updateExecutionValue(control.id as string, event.target.value)}
                                className="mt-2 w-full rounded-lg border px-3 py-2"
                              />
                            )}

                            {control.input_type === "TIME" && (
                              <input
                                type="time"
                                value={currentValue}
                                onChange={(event) => updateExecutionValue(control.id as string, event.target.value)}
                                className="mt-2 w-full rounded-lg border px-3 py-2"
                              />
                            )}

                            {control.input_type === "SELECT" && (
                              <input
                                value={currentValue}
                                onChange={(event) => updateExecutionValue(control.id as string, event.target.value)}
                                placeholder="Valor registrado"
                                className="mt-2 w-full rounded-lg border px-3 py-2"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-5 flex justify-stretch border-t pt-4 sm:justify-end">
                    <div className="w-full sm:w-auto">
                    <ActionButton
                      icon={Save}
                      label={executionSaving ? "Registrando…" : "Registrar ejecución"}
                      tone="primary"
                      type="submit"
                      disabled={executionSaving}
                    />
                    </div>
                  </div>
                </form>
              )}

              {executions.length === 0 ? (
                <div className="mt-4 rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-500">Todavía no hay ejecuciones reales registradas.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {executions.map((execution) => {
                    const resultClass =
                      execution.result === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-700"
                        : execution.result === "COMPLETED_WITH_ISSUES"
                          ? "bg-amber-100 text-amber-700"
                          : execution.result === "NOT_CONFORM"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-600"

                    return (
                      <div key={execution.id} className="rounded-xl border border-slate-200 px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold">
                              {execution.executed_at
                                ? new Date(execution.executed_at).toLocaleString("es-ES")
                                : "Sin fecha de ejecución"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {execution.performer_name ?? "Persona no indicada"}
                              {execution.performer_company ? " · " + execution.performer_company : ""}
                            </div>
                          </div>
                          <span className={"inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold " + resultClass}>
                            {executionResultLabel(execution.result)}
                          </span>
                        </div>
                        {execution.observations && (
                          <p className="mt-2 text-sm text-slate-600">{execution.observations}</p>
                        )}
                        {Array.isArray(execution.evidence_files) && execution.evidence_files.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(execution.evidence_files as EvidenceFile[]).map((file) => (
                              <button
                                key={file.path}
                                type="button"
                                onClick={() => void openEvidence(file.path)}
                                className="inline-flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                              >
                                <Download size={14} />
                                {file.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
            </>}
          </section>
        </main>
      </div>
    </div>
  )
}
