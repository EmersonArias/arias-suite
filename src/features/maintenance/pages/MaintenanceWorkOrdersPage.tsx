import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, Camera, CheckCircle2, ChevronDown, ChevronUp, Clock3, FileText, Image, Plus, RefreshCw, Upload, UserRound, Wrench, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../auth/context/AuthProvider'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import { workOrderAccess } from '../../../shared/maintenance/preventiveSchedule'
import { useHotelDay } from '../../../shared/maintenance/useHotelDay'

type TicketAsset = {
  id: string
  code: string | null
  name: string | null
  location_id: string | null
}

type TicketLocation = {
  id: string
  parent_location_id: string | null
  location_type: string
  name: string
  active: boolean
  sort_order: number
}

function ticketLocationPath(locationId: string, locations: TicketLocation[]) {
  const byId = new Map(locations.map((item) => [item.id, item]))
  const path: string[] = []
  const visited = new Set<string>()
  let current = byId.get(locationId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parent_location_id ? byId.get(current.parent_location_id) : undefined
  }
  return path.join(' / ')
}

type TicketAssignee = {
  id: string
  name: string
  email: string | null
}

type WorkOrderEvidence = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  uploaded_by: string | null
  uploaded_at: string
  url: string
}

type WorkOrder = {
  id: string
  hotel_id: string
  scheduled_job_id: string | null
  maintenance_plan_id: string | null
  ot_number: string
  title: string
  description: string | null
  work_type: 'PREVENTIVE' | 'CORRECTIVE' | 'ACTUATION'
  status: 'PENDING' | 'IN_MANAGEMENT' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
  completion_timing: 'ON_TIME' | 'OUT_OF_DATE' | null
  assigned_user_id: string | null
  assigned_user_name: string | null
  assigned_user_email: string | null
  scheduled_date: string | null
  started_at: string | null
  completed_at: string | null
  completed_by: string | null
  observations: string | null
  maintenance_plan_name: string | null
  maintenance_type: 'INTERNAL' | 'EXTERNAL'
  apparatus_registry_id: string | null
  apparatus_code: string | null
  apparatus_name: string | null
  plant: string | null
  location: string | null
  reported_location_id: string | null
  reported_location_snapshot: string | null
  execution_location_id: string | null
  execution_location_snapshot: string | null
  plan_year: number
  month_number: number
  week_slot: number
  source_mark_id: string | null
  created_at: string
  updated_at: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
}

const priorityLabels: Record<WorkOrder['priority'], string> = {
  LOW: 'Baja', NORMAL: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica',
}

function priorityClass(priority: WorkOrder['priority']) {
  if (priority === 'CRITICAL') return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
  if (priority === 'HIGH') return 'bg-orange-100 text-orange-800 ring-1 ring-orange-200'
  if (priority === 'NORMAL') return 'bg-slate-100 text-slate-600'
  return 'bg-sky-50 text-sky-700'
}

const statusLabels: Record<WorkOrder['status'], string> = {
  PENDING: 'Pendiente',
  IN_MANAGEMENT: 'En gestión',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Cerrado',
  REJECTED: 'Rechazado',
}

const typeLabels: Record<WorkOrder['work_type'], string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Correctiva',
  ACTUATION: 'Actuación',
}

function localTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function isOverdue(item: WorkOrder) {
  return ['PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS'].includes(item.status)
    && Boolean(item.scheduled_date)
    && item.scheduled_date! < localTodayISO()
}

function displayStatusLabel(item: WorkOrder) {
  if (item.status === 'COMPLETED' && item.completion_timing === 'OUT_OF_DATE') {
    return 'Finalizada · Fuera de fecha'
  }
  return isOverdue(item) ? 'Vencida' : statusLabels[item.status]
}

function displayStatusClass(item: WorkOrder) {
  if (isOverdue(item) && item.status !== 'REJECTED') return 'bg-rose-100 text-rose-700'
  if (item.status === 'REJECTED') return 'bg-slate-200 text-slate-600'
  if (item.status === 'COMPLETED' && item.completion_timing === 'OUT_OF_DATE') return 'bg-amber-100 text-amber-700'
  if (item.status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700'
  if (item.status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700'
  if (item.status === 'IN_MANAGEMENT') return 'bg-violet-100 text-violet-700'
  return 'bg-amber-100 text-amber-700'
}

function getMaintenanceDisplay(item: WorkOrder) {
  if (item.work_type === 'PREVENTIVE') {
    const maintenance = item.maintenance_plan_name?.trim() || 'PREVENTIVO'
    const equipment = item.apparatus_name?.trim() || item.apparatus_code?.trim() || ''
    return equipment ? maintenance + ' · ' + equipment : maintenance
  }

  const prefix = item.ot_number + ' — '
  if (item.title.startsWith(prefix)) {
    return item.title.slice(prefix.length).trim() || typeLabels[item.work_type]
  }

  return item.title.trim() || typeLabels[item.work_type]
}

function getWorkDescription(item: WorkOrder) {
  const description = item.description?.trim() ?? ''
  const technicalOrigin = description.startsWith('Origen ')
    || description.includes(' PAM ')
    || description.includes(' Excel ')

  if (technicalOrigin) {
    const maintenanceLabel = item.maintenance_type === 'EXTERNAL'
      ? 'mantenimiento preventivo externo'
      : 'mantenimiento preventivo'
    const equipment = item.apparatus_name ?? item.apparatus_code

    return equipment
      ? `Realizar ${maintenanceLabel} en ${equipment}.`
      : `Realizar ${maintenanceLabel}.`
  }

  return description || null
}


export default function MaintenanceWorkOrdersPage() {
  useHotelDay()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hotel } = useHotelScope()
  const { session } = useAuth()
  const { confirm } = useSystemDialog()
  const [records, setRecords] = useState<WorkOrder[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'IN_MANAGEMENT' | 'IN_PROGRESS' | 'OVERDUE'>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | WorkOrder['work_type']>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | WorkOrder['priority'] | 'HIGH_OR_CRITICAL'>('ALL')
  const [assigneeFilter, setAssigneeFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evidence, setEvidence] = useState<WorkOrderEvidence[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [assets, setAssets] = useState<TicketAsset[]>([])
  const [locations, setLocations] = useState<TicketLocation[]>([])
  const [assignees, setAssignees] = useState<TicketAssignee[]>([])
  const [canAssign, setCanAssign] = useState(false)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketType, setTicketType] = useState<'CORRECTIVE' | 'ACTUATION'>('CORRECTIVE')
  const [ticketAssetId, setTicketAssetId] = useState('')
  const [ticketLocationId, setTicketLocationId] = useState('')
  const [ticketScheduledDate, setTicketScheduledDate] = useState(new Date().toISOString().slice(0, 10))
  const [ticketPriority, setTicketPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL')
  const [ticketAssigneeId, setTicketAssigneeId] = useState('')
  const [ticketPhotos, setTicketPhotos] = useState<File[]>([])
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const ticketPhotoPreviews = useMemo(() => ticketPhotos.map((file) => ({ file, url: URL.createObjectURL(file) })), [ticketPhotos])

  useEffect(() => () => {
    ticketPhotoPreviews.forEach((photo) => URL.revokeObjectURL(photo.url))
  }, [ticketPhotoPreviews])

  async function loadData() {
    if (!hotel?.id) {
      setRecords([])
      setSelectedId('')
      setLoading(false)
      setError('No se ha seleccionado un hotel de trabajo.')
      return
    }

    setLoading(true)
    setError('')

    const result = await supabase
      .from('maintenance_work_orders_resolved')
      .select('*')
      .eq('hotel_id', hotel.id)
      .neq('work_type', 'PREVENTIVE')
      .not('status', 'in', '(COMPLETED,REJECTED)')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    const assetsResult = await supabase
      .from('apparatus_registry')
      .select('id, code, name, location_id')
      .eq('hotel_id', hotel.id)
      .eq('active', true)
      .order('code', { ascending: true })

    if (!assetsResult.error) {
      setAssets((assetsResult.data ?? []) as TicketAsset[])
    } else {
      setAssets([])
    }

    const locationsResult = await supabase
      .from('hotel_locations')
      .select('id, parent_location_id, location_type, name, active, sort_order')
      .eq('hotel_id', hotel.id)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (!locationsResult.error) {
      setLocations((locationsResult.data ?? []) as TicketLocation[])
    } else {
      setLocations([])
      setError(`No se pudieron cargar las ubicaciones del hotel: ${locationsResult.error.message}`)
    }

    const assignmentResult = session?.user.id
      ? await supabase
          .from('user_hotel_roles')
          .select('user_id, role_id')
          .eq('hotel_id', hotel.id)
          .eq('active', true)
      : { data: [], error: null }

    const roleIds = Array.from(new Set((assignmentResult.data ?? []).map((row) => row.role_id)))
    const rolesResult = roleIds.length
      ? await supabase.from('roles').select('id, code').in('id', roleIds).eq('active', true)
      : { data: [], error: null }

    const roleCodeById = new Map(
      (rolesResult.data ?? []).map((row) => [row.id, row.code]),
    )

    const currentRoleCodes = (assignmentResult.data ?? [])
      .filter((row) => row.user_id === session?.user.id)
      .map((row) => roleCodeById.get(row.role_id))
      .filter((code): code is string => Boolean(code))

    const platformAdminResult = session?.user.id
      ? await supabase
          .from('platform_admins')
          .select('active')
          .eq('user_id', session.user.id)
          .maybeSingle()
      : { data: null, error: null }

    const assignmentAllowed =
      platformAdminResult.data?.active === true
      || currentRoleCodes.some((code) => code === 'CLIENT_ADMIN' || code === 'MAINTENANCE_CHIEF')

    setCanAssign(assignmentAllowed)

    const assigneeUserIds = Array.from(
      new Set(
        (assignmentResult.data ?? [])
          .filter((row) => {
            const code = roleCodeById.get(row.role_id)
            return code === 'TECHNICIAN' || code === 'MAINTENANCE_CHIEF'
          })
          .map((row) => row.user_id),
      ),
    )

    if (assigneeUserIds.length) {
      const assigneesResult = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', assigneeUserIds)
        .eq('active', true)
        .eq('account_status', 'ACTIVE')
        .order('full_name', { ascending: true })

      setAssignees(
        (assigneesResult.data ?? []).map((row) => ({
          id: row.id,
          name: row.full_name || row.email || 'Usuario',
          email: row.email ?? null,
        })),
      )
    } else {
      setAssignees([])
    }

    if (result.error) {
      setRecords([])
      setSelectedId('')
      setError(result.error.message)
      setLoading(false)
      return
    }

    const loaded = (result.data ?? []) as WorkOrder[]
    setRecords(loaded)
    setSelectedId((current) => loaded.some((item) => item.id === current) ? current : (loaded[0]?.id ?? ''))
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [hotel?.id])

  useEffect(() => {
    if (loading) return

    const summaryFilter = searchParams.get('summary')
    if (summaryFilter === 'PENDING' || summaryFilter === 'OVERDUE' || summaryFilter === 'URGENT' || summaryFilter === 'UNASSIGNED' || summaryFilter === 'IN_PROGRESS' || summaryFilter === 'IN_MANAGEMENT') {
      setTypeFilter('ALL')
      setSearch('')
      setStatusFilter(summaryFilter === 'PENDING' ? 'PENDING' : summaryFilter === 'OVERDUE' ? 'OVERDUE' : summaryFilter === 'IN_PROGRESS' ? 'IN_PROGRESS' : summaryFilter === 'IN_MANAGEMENT' ? 'IN_MANAGEMENT' : 'ALL')
      setPriorityFilter(summaryFilter === 'URGENT' ? 'HIGH_OR_CRITICAL' : 'ALL')
      setAssigneeFilter(summaryFilter === 'UNASSIGNED' ? 'UNASSIGNED' : 'ALL')
      setSearchParams({}, { replace: true })
      return
    }
    if (searchParams.get('new') !== '1') return

    setTicketTitle('')
    setTicketDescription('')
    setTicketType('CORRECTIVE')
    setTicketAssetId('')
    setTicketLocationId('')
    setTicketScheduledDate(new Date().toISOString().slice(0, 10))
    setTicketPriority('NORMAL')
    setTicketAssigneeId('')
    setTicketPhotos([])
    setError('')
    setTicketOpen(true)
    setSearchParams({}, { replace: true })
  }, [loading, searchParams, setSearchParams])

  async function loadEvidence(workOrderId: string) {
    setEvidenceLoading(true)
    setEvidence([])

    const result = await supabase
      .from('maintenance_work_order_evidence')
      .select('id, storage_path, file_name, mime_type, file_size, uploaded_by, uploaded_at')
      .eq('work_order_id', workOrderId)
      .order('uploaded_at', { ascending: false })

    if (result.error) {
      setError(result.error.message)
      setEvidenceLoading(false)
      return
    }

    const resolved = await Promise.all(
      (result.data ?? []).map(async (item) => {
        const signed = await supabase
          .storage
          .from('maintenance-evidence')
          .createSignedUrl(item.storage_path, 3600)

        if (signed.error || !signed.data?.signedUrl) return null

        return {
          ...item,
          url: signed.data.signedUrl,
        } as WorkOrderEvidence
      }),
    )

    setEvidence(resolved.filter(Boolean) as WorkOrderEvidence[])
    setEvidenceLoading(false)
  }

  useEffect(() => {
    if (!selectedId) {
      setEvidence([])
      return
    }
    void loadEvidence(selectedId)
  }, [selectedId])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')

    return records.filter((item) => {
      if (statusFilter === 'OVERDUE' && !isOverdue(item)) return false
      if (statusFilter === 'PENDING' && (item.status !== 'PENDING' || isOverdue(item))) return false
      if (statusFilter !== 'ALL' && statusFilter !== 'OVERDUE' && statusFilter !== 'PENDING' && item.status !== statusFilter) return false
      if (typeFilter !== 'ALL' && item.work_type !== typeFilter) return false
      if (priorityFilter === 'HIGH_OR_CRITICAL' && item.priority !== 'HIGH' && item.priority !== 'CRITICAL') return false
      if (priorityFilter !== 'ALL' && priorityFilter !== 'HIGH_OR_CRITICAL' && item.priority !== priorityFilter) return false
      if (assigneeFilter !== 'ALL' && (item.assigned_user_id ?? 'UNASSIGNED') !== assigneeFilter) return false
      if (!query) return true

      const haystack = [
        item.ot_number,
        item.title,
        item.description,
        item.maintenance_plan_name,
        item.apparatus_code,
        item.apparatus_name,
        item.assigned_user_name,
        item.plant,
        item.location,
        item.reported_location_snapshot,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')

      return haystack.includes(query)
    })
  }, [records, search, statusFilter, typeFilter, priorityFilter, assigneeFilter])

  const selected = records.find((item) => item.id === selectedId) ?? null
  const pendingCount = records.filter((item) => item.status === 'PENDING' && !isOverdue(item)).length
  const overdueCount = records.filter((item) => isOverdue(item)).length
  const urgentCount = records.filter((item) => item.priority === 'HIGH' || item.priority === 'CRITICAL').length
  const unassignedCount = records.filter((item) => !item.assigned_user_id).length
  const inProgressCount = records.filter((item) => item.status === 'IN_PROGRESS').length

  function applyTicketSummaryFilter(kind: 'PENDING' | 'OVERDUE' | 'URGENT' | 'UNASSIGNED' | 'IN_PROGRESS') {
    setTypeFilter('ALL')
    setSearch('')
    setStatusFilter(kind === 'PENDING' ? 'PENDING' : kind === 'OVERDUE' ? 'OVERDUE' : kind === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ALL')
    setPriorityFilter(kind === 'URGENT' ? 'HIGH_OR_CRITICAL' : 'ALL')
    setAssigneeFilter(kind === 'UNASSIGNED' ? 'UNASSIGNED' : 'ALL')
  }

  const gridIds = useMemo(
    () => filteredRecords.map((item) => item.id),
    [filteredRecords],
  )

  const {
    currentIndex,
    moveSelection,
    getGridProps,
    getRowProps,
  } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId,
    onSelectedIdChange: setSelectedId,
    onOpen: (id) => navigate('/maintenance/tickets/' + id),
    autoFocusFirst: true,
  })

  async function setTicketStatus(ticket: WorkOrder, targetStatus: 'IN_MANAGEMENT' | 'IN_PROGRESS') {
    if (ticket.status === 'COMPLETED' || ticket.status === 'REJECTED') return
    const access = workOrderAccess(ticket)
    if (targetStatus === 'IN_PROGRESS' && !access.allowed) { setError(access.message); return }

    const label = targetStatus === 'IN_MANAGEMENT' ? 'en gestión' : 'en curso'
    const confirmed = await confirm({
      title: `Cambiar estado a ${label}`,
      message: `¿Quieres marcar el ticket ${ticket.ot_number} como ${label}?`,
      variant: 'info',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
    })

    if (!confirmed) return

    const result = await supabase.rpc('set_maintenance_work_order_status', {
      target_work_order_id: ticket.id,
      target_status: targetStatus,
    })

    if (result.error) {
      setError(result.error.message)
      return
    }

    await loadData()
  }

  async function closeTicket(ticket: WorkOrder) {
    if (ticket.status === 'COMPLETED' || ticket.status === 'REJECTED') return
    const access = workOrderAccess(ticket)
    if (!access.allowed) { setError(access.message); return }

    const confirmed = await confirm({
      title: 'Cerrar ticket',
      message: `¿Quieres cerrar el ticket ${ticket.ot_number}?`,
      variant: 'info',
      confirmLabel: 'Cerrar ticket',
      cancelLabel: 'Cancelar',
    })

    if (!confirmed) return

    const result = await supabase.rpc('complete_maintenance_work_order', {
      target_work_order_id: ticket.id,
      target_result: 'COMPLETED',
      target_observations: ticket.observations,
    })

    if (result.error) {
      setError(result.error.message)
      return
    }

    await loadData()
  }

  async function rejectTicket(ticket: WorkOrder) {
    if (ticket.status === 'COMPLETED' || ticket.status === 'REJECTED') return

    const confirmed = await confirm({
      title: 'Rechazar ticket',
      message: `¿Quieres enviar el ticket ${ticket.ot_number} al histórico como rechazado?`,
      variant: 'warning',
      confirmLabel: 'Rechazar',
      cancelLabel: 'Cancelar',
    })

    if (!confirmed) return

    const result = await supabase.rpc('reject_maintenance_work_order', {
      target_work_order_id: ticket.id,
      target_observations: ticket.observations,
    })

    if (result.error) {
      setError(result.error.message)
      return
    }

    await loadData()
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="maintenance-tickets-header-layout flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight sm:text-2xl">Tickets</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Incidencias correctivas y actuaciones · {hotel?.name ?? 'hotel actual'}</p>
              </div>
            </div>
            <div className="flex w-full min-w-0 items-start gap-1 overflow-x-auto pb-1 sm:w-auto sm:justify-end sm:overflow-visible">
              <ActionButton icon={Plus} label="Nuevo ticket" onClick={() => {
                setTicketTitle('')
                setTicketDescription('')
                setTicketType('CORRECTIVE')
                setTicketAssetId('')
                setTicketLocationId('')
                setTicketScheduledDate(new Date().toISOString().slice(0, 10))
                setTicketPriority('NORMAL')
                setTicketAssigneeId('')
                setTicketPhotos([])
                setError('')
                setTicketOpen(true)
              }} />
              <IconButton icon={RefreshCw} label="Actualizar" title="Actualizar" onClick={() => void loadData()} disabled={loading} />
              <ActionButton
                icon={FileText}
                label="Reporte"
                onClick={() => navigate('/maintenance/tickets/report?search=' + encodeURIComponent(search) + '&status=' + encodeURIComponent(statusFilter))}
              />
              <ActionButton icon={Archive} label="Histórico" onClick={() => navigate('/maintenance/tickets/history')} />
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


        <section className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-5" aria-label="Resumen de tickets correctivos">
          {[
            { key: 'PENDING' as const, label: 'Pendientes', count: pendingCount, detail: 'Por atender sin vencer', icon: Clock3, tone: 'text-amber-700 bg-amber-50' },
            { key: 'OVERDUE' as const, label: 'Atrasados', count: overdueCount, detail: 'Fecha vencida · abiertos', icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
            { key: 'URGENT' as const, label: 'Alta / crítica', count: urgentCount, detail: 'Prioridad alta o crítica', icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
            { key: 'IN_PROGRESS' as const, label: 'En curso', count: inProgressCount, detail: 'Intervenciones en ejecución', icon: CheckCircle2, tone: 'text-blue-700 bg-blue-50' },
            { key: 'UNASSIGNED' as const, label: 'Sin asignar', count: unassignedCount, detail: 'Requieren responsable', icon: UserRound, tone: 'text-slate-700 bg-slate-100' },
          ].map((metric) => {
            const MetricIcon = metric.icon
            return (
              <button key={metric.key} type="button" onClick={() => applyTicketSummaryFilter(metric.key)} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md active:scale-[0.99] sm:p-4">
                <div className="flex items-center gap-2">
                  <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + metric.tone}><MetricIcon size={18}/></span>
                  <span className="truncate text-xs font-semibold text-slate-600 sm:text-sm">{metric.label}</span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{metric.count}</div>
                <div className="mt-0.5 hidden text-xs text-slate-500 sm:block">{metric.detail}</div>
              </button>
            )
          })}
        </section>

        <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(150px,1fr))]">
            <label className="lg:min-w-0">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Código, equipo, mantenimiento, responsable…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todos</option>
                <option value="PENDING">Pendiente (sin vencer)</option>
                <option value="OVERDUE">Atrasados</option>
                <option value="IN_MANAGEMENT">En gestión</option>
                <option value="IN_PROGRESS">En curso</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todos</option>
                <option value="CORRECTIVE">Correctiva</option>
                <option value="ACTUATION">Actuación</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Criticidad</span>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todas</option>
                <option value="HIGH_OR_CRITICAL">Alta y crítica</option>
                <option value="CRITICAL">Crítica</option>
                <option value="HIGH">Alta</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Baja</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Asignado</span>
              <select
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
              >
                <option value="ALL">Todos</option>
                <option value="UNASSIGNED">Sin asignar</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                ))}
              </select>
            </label>
          </div>
          {(statusFilter !== 'ALL' || typeFilter !== 'ALL' || priorityFilter !== 'ALL' || assigneeFilter !== 'ALL' || search) && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('ALL')
                  setTypeFilter('ALL')
                  setPriorityFilter('ALL')
                  setAssigneeFilter('ALL')
                  setSearch('')
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </section>

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold">Tickets del hotel</div>
              <span className="text-xs text-slate-500">{filteredRecords.length} resultado{filteredRecords.length === 1 ? '' : 's'}</span>
            </div>

            <div className="p-2 md:hidden">
              <div className="max-h-[calc(100vh-300px)] space-y-2 overflow-auto">
                {filteredRecords.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate('/maintenance/tickets/' + item.id)}
                    className={'w-full rounded-xl border p-3 text-left ' + (item.id === selectedId ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800">{item.ot_number}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-700">{getMaintenanceDisplay(item)}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' + priorityClass(item.priority)}>{priorityLabels[item.priority]}</span>
                        <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' + displayStatusClass(item)}>{displayStatusLabel(item)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500">
                      {item.apparatus_code ?? '—'} · {item.apparatus_name ?? 'Equipo no disponible'}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {item.reported_location_snapshot || 'Sin instantánea histórica'}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Prevista: {item.scheduled_date ? new Date(item.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES') : '—'}
                    </div>
                  </button>
                ))}
                {!loading && filteredRecords.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay tickets para mostrar.</div>
                )}
              </div>
            </div>

            <div className="hidden md:block">
              <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
                <GridViewport className="max-h-[calc(100vh-300px)]">
              <table className="w-full min-w-[1020px] border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 z-10 border-b bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 font-semibold">Ticket</th>
                    <th className="px-3 py-2.5 font-semibold">Mantenimiento</th>
                    <th className="px-3 py-2.5 font-semibold">Equipo</th>
                    <th className="px-3 py-2.5 font-semibold">Ubicación</th>
                    <th className="px-3 py-2.5 font-semibold">Fecha prevista</th>
                    <th className="px-3 py-2.5 font-semibold">Asignado</th>
                    <th className="px-3 py-2.5 font-semibold">Criticidad</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((item) => (
                    <tr
                      key={item.id}
                      {...getRowProps(item.id)}
                      onClick={() => {
                        setSelectedId(item.id)
                        navigate('/maintenance/tickets/' + item.id)
                      }}
                      className={'cursor-pointer border-b border-slate-100 transition ' + (item.id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50')}
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-800">{item.ot_number}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-700">{getMaintenanceDisplay(item)}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{typeLabels[item.work_type]}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-700">{item.apparatus_code ?? '—'}</div>
                        <div className="text-[10px] text-slate-400">{item.apparatus_name ?? '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {item.reported_location_snapshot || 'Sin instantánea histórica'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {item.scheduled_date ? new Date(item.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES') : '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{item.assigned_user_name ?? 'Sin asignar'}</td>
                      <td className="whitespace-nowrap px-3 py-3"><span className={'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ' + priorityClass(item.priority)}>{priorityLabels[item.priority]}</span></td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ' + displayStatusClass(item)}>{displayStatusLabel(item)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {item.status === 'PENDING' && (
                            <button type="button" onClick={(event) => { event.stopPropagation(); void setTicketStatus(item, 'IN_MANAGEMENT') }} className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-100" title="Pasar a en gestión">
                              En gestión
                            </button>
                          )}
                          {item.status === 'IN_MANAGEMENT' && (
                            <button type="button" onClick={(event) => { event.stopPropagation(); void setTicketStatus(item, 'IN_PROGRESS') }} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40" disabled={!workOrderAccess(item).allowed} title={workOrderAccess(item).allowed ? "Pasar a en curso" : workOrderAccess(item).message}>
                              En curso
                            </button>
                          )}
                          {item.status !== 'COMPLETED' && item.status !== 'REJECTED' && (
                            <>
                              <button type="button" onClick={(event) => { event.stopPropagation(); void closeTicket(item) }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40" disabled={!workOrderAccess(item).allowed} title={workOrderAccess(item).allowed ? "Cerrar ticket" : workOrderAccess(item).message}>
                                Cerrar
                              </button>
                              <button type="button" onClick={(event) => { event.stopPropagation(); void rejectTicket(item) }} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100" title="Rechazar ticket">
                                Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredRecords.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">No hay tickets para mostrar.</td></tr>
                  )}
                </tbody>
              </table>
                </GridViewport>
                <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                  <span className="text-[11px] text-slate-500">
                    {filteredRecords.length === 0 ? 'Sin tickets' : `${currentIndex + 1} / ${filteredRecords.length}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={ChevronUp}
                      label="Ticket anterior"
                      title="Ticket anterior"
                      onClick={() => moveSelection(currentIndex - 1)}
                      disabled={filteredRecords.length === 0 || currentIndex === 0}
                      className="h-9 w-9"
                    />
                    <IconButton
                      icon={ChevronDown}
                      label="Ticket siguiente"
                      title="Ticket siguiente"
                      onClick={() => moveSelection(currentIndex + 1)}
                      disabled={filteredRecords.length === 0 || currentIndex === filteredRecords.length - 1}
                      className="h-9 w-9"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:block">
            <div className="border-b px-4 py-3 text-sm font-semibold">Detalle del ticket</div>
            {selected ? (
              <div className="space-y-4 p-4">
                <div>
                  <div className="text-xl font-bold text-slate-900">{selected.ot_number}</div>
                  <div className="mt-1 text-sm text-slate-600">{selected.maintenance_plan_name}</div>
                  <span className={'mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ' + displayStatusClass(selected)}>{displayStatusLabel(selected)}</span>
                </div>

                <div className="grid gap-2 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><Wrench size={16} /><span><strong>Equipo:</strong> {selected.apparatus_code ?? '—'} · {selected.apparatus_name ?? '—'}</span></div>
                  <div className="flex items-center gap-2"><Clock3 size={16} /><span><strong>Fecha prevista:</strong> {selected.scheduled_date ? new Date(selected.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES') : '—'}</span></div>
                  <div className="flex items-center gap-2"><UserRound size={16} /><span><strong>Asignado:</strong> {selected.assigned_user_name ?? 'Sin asignar'}</span></div>
                  <div className="flex items-center gap-2"><AlertTriangle size={16} /><span><strong>Criticidad:</strong> <span className={'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ' + priorityClass(selected.priority)}>{priorityLabels[selected.priority]}</span></span></div>
                  <div className="flex items-center gap-2"><FileText size={16} /><span><strong>Tipo:</strong> {typeLabels[selected.work_type]}</span></div>
                </div>

                {selected.reported_location_snapshot || selected.plant || selected.location ? (
                  <div className="text-sm text-slate-600">
                    <strong>Ubicación comunicada:</strong> {selected.reported_location_snapshot || 'Sin instantánea histórica'}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500"><strong>Ubicación comunicada:</strong> Sin instantánea histórica</div>
                )}
                {(selected.plant || selected.location) && (
                  <div className="text-xs text-slate-500">
                    <strong>Referencia textual de la ficha del equipo (no histórica):</strong> {[selected.plant, selected.location].filter(Boolean).join(' · ')}
                  </div>
                )}

                {getWorkDescription(selected) && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Trabajo a realizar</div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{getWorkDescription(selected)}</div>
                  </div>
                )}


                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Image size={17} />
                        Fotografías
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">Evidencias de la ejecución de este ticket.</div>
                    </div>
<div className="text-[11px] text-slate-400">Solo consulta en esta pantalla. Las evidencias se gestionan desde la ejecución del ticket.</div>
                  </div>

                  {evidenceLoading ? (
                    <div className="mt-3 text-xs text-slate-400">Cargando fotografías…</div>
                  ) : evidence.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {evidence.map((item) => (
                        <div key={item.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          <a href={item.url} target="_blank" rel="noreferrer" className="block aspect-square">
                            <img src={item.url} alt={item.file_name} className="h-full w-full object-cover" />
                          </a>
                          <div className="truncate border-t bg-white px-2 py-1.5 text-[10px] text-slate-500">{item.file_name}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400">
                      Todavía no hay fotografías registradas.
                    </div>
                  )}
                </div>

                {selected.observations && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Observaciones</div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.observations}</div>
                  </div>
                )}

                <div className="text-xs text-slate-400">
                  Creada: {new Date(selected.created_at).toLocaleString('es-ES')}
                </div>

                {selected.status === 'PENDING' && (
                  <div className={
                    isOverdue(selected)
                      ? 'rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-800'
                      : 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800'
                  }>
                    <AlertTriangle className="mb-1 inline-block" size={15} />
                    {isOverdue(selected)
                      ? 'Este ticket está pendiente y ha superado su fecha prevista.'
                      : 'Este ticket está pendiente de ejecución.'}
                  </div>
                )}

                {selected.status === 'COMPLETED' && selected.completion_timing === 'OUT_OF_DATE' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                    <AlertTriangle className="mb-1 inline-block" size={15} /> Esta Ticket fue completado fuera de la fecha prevista y queda registrada como <strong>Fuera de fecha</strong>.
                  </div>
                )}

                {selected.status === 'COMPLETED' && selected.completion_timing !== 'OUT_OF_DATE' && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                    <CheckCircle2 className="mb-1 inline-block" size={15} /> Ticket completado.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">Selecciona un ticket.</div>
            )}
          </aside>
        </main>

      {ticketOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-24px)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">Nuevo ticket</div>
                <div className="text-xs text-slate-500">Registra un trabajo que necesita atención.</div>
              </div>
              <button
                type="button"
                onClick={() => !ticketSaving && setTicketOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Título *</span>
                  <input
                    value={ticketTitle}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketTitle(event.target.value)}
                    placeholder="Ej. Bomba de achique parada"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
                  <select
                    value={ticketType}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketType(event.target.value as typeof ticketType)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="CORRECTIVE">Correctivo</option>
                    <option value="ACTUATION">Actuación</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Criticidad</span>
                  <select
                    value={ticketPriority}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketPriority(event.target.value as typeof ticketPriority)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="LOW">Baja</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Crítica</option>
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Equipo / activo</span>
                  <select
                    value={ticketAssetId}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketAssetId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Sin equipo concreto</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.code ?? '—'} · {asset.name ?? 'Equipo'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ubicación comunicada</span>
                  <select
                    value={ticketLocationId}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketLocationId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Usar ubicación del equipo si existe</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {ticketLocationPath(location.id, locations)} · {location.location_type}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">Se conserva como ubicación inicial de la OT. Al cerrarla podrás indicar dónde se ejecutó realmente.</span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha prevista</span>
                  <input
                    type="date"
                    value={ticketScheduledDate}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketScheduledDate(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </label>

                {canAssign ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Asignar a</span>
                    <select
                      value={ticketAssigneeId}
                      disabled={ticketSaving}
                      onChange={(event) => setTicketAssigneeId(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Sin asignar</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                    La asignación de tickets requiere el permiso correspondiente.
                  </div>
                )}

                <section className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Image size={17}/>Fotografías de la incidencia</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Haz una foto con la cámara del móvil o adjunta varias imágenes de la galería. Se guardarán asociadas al ticket.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" disabled={ticketSaving} className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/')); if (files.length) setTicketPhotos((current) => [...current, ...files]); event.target.value = '' }} />
                      <input ref={galleryInputRef} type="file" accept="image/*" multiple disabled={ticketSaving} className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/')); if (files.length) setTicketPhotos((current) => [...current, ...files]); event.target.value = '' }} />
                      <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={ticketSaving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Camera size={15}/>Hacer foto</button>
                      <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={ticketSaving} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Upload size={15}/>Galería</button>
                    </div>
                  </div>
                  {ticketPhotoPreviews.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {ticketPhotoPreviews.map(({ file, url }, index) => (
                        <div key={file.name + file.size + index} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                          <img src={url} alt={'Vista previa ' + file.name} className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover"/>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-700">{file.name}</div>
                            <div className="text-[10px] text-slate-400">{Math.max(1, Math.round(file.size / 1024))} KB</div>
                          </div>
                          <button type="button" disabled={ticketSaving} onClick={() => setTicketPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label={'Quitar ' + file.name} title="Quitar fotografía"><X size={14}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción</span>
                  <textarea
                    value={ticketDescription}
                    disabled={ticketSaving}
                    onChange={(event) => setTicketDescription(event.target.value)}
                    rows={5}
                    placeholder="Describe qué has visto, dónde está y qué se necesita hacer…"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => { if (!ticketSaving) { setTicketOpen(false); setTicketPhotos([]) } }}
                  disabled={ticketSaving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!hotel?.id || ticketSaving) return
                    if (!ticketTitle.trim()) {
                      setError('El título del ticket es obligatorio.')
                      return
                    }

                    setTicketSaving(true)
                    setError('')

                    try {
                      const createdResult = await supabase.rpc('create_operational_work_order_at_location', {
                        target_hotel_id: hotel.id,
                        target_work_type: ticketType,
                        target_title: ticketTitle.trim(),
                        target_reported_location_id: ticketLocationId || null,
                        target_description: ticketDescription.trim() || null,
                        target_apparatus_registry_id: ticketAssetId || null,
                        target_parent_work_order_id: null,
                        target_priority: ticketPriority,
                        target_scheduled_date: ticketScheduledDate || null,
                        target_observations: null,
                      })

                      if (createdResult.error || !createdResult.data) {
                        throw createdResult.error ?? new Error('No se ha podido crear el ticket.')
                      }

                      const created = (Array.isArray(createdResult.data) ? createdResult.data[0] : createdResult.data) as { id: string }

                      if (ticketAssigneeId && canAssign) {
                        const assignmentResult = await supabase.rpc('assign_maintenance_work_order', {
                          target_work_order_id: created.id,
                          target_user_id: ticketAssigneeId,
                        })

                        if (assignmentResult.error) {
                          throw assignmentResult.error
                        }
                      }

                      let photoWarning = ''
                      for (const file of ticketPhotos) {
                        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
                        const storagePath = hotel.id + '/' + created.id + '/' + crypto.randomUUID() + '-' + safeName
                        const upload = await supabase.storage.from('maintenance-evidence').upload(storagePath, file, { contentType: file.type, upsert: false })
                        if (upload.error) {
                          photoWarning = 'El ticket se creó, pero no se pudieron subir todas las fotos. Puedes adjuntarlas desde la ficha del ticket.'
                          break
                        }
                        const evidenceInsert = await supabase.from('maintenance_work_order_evidence').insert({
                          hotel_id: hotel.id,
                          work_order_id: created.id,
                          storage_path: storagePath,
                          file_name: file.name,
                          mime_type: file.type,
                          file_size: file.size,
                          uploaded_by: session?.user.id ?? null,
                        })
                        if (evidenceInsert.error) {
                          await supabase.storage.from('maintenance-evidence').remove([storagePath])
                          photoWarning = 'El ticket se creó, pero no se pudo registrar una foto. Puedes adjuntarla desde la ficha del ticket.'
                          break
                        }
                      }
                      setTicketPhotos([])
                      setTicketOpen(false)
                      setTicketTitle('')
                      setTicketDescription('')
                      setTicketAssetId('')
                      setTicketLocationId('')
                      setTicketAssigneeId('')
                      await loadData()
                      setSelectedId(created.id)
                      navigate('/maintenance/tickets/' + created.id, photoWarning ? { state: { flashMessage: photoWarning } } : undefined)
                    } catch (error) {
                      setError(error instanceof Error ? error.message : 'No se ha podido crear el ticket.')
                    } finally {
                      setTicketSaving(false)
                    }
                  }}
                  disabled={ticketSaving || !ticketTitle.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={16} />
                  {ticketSaving ? (ticketPhotos.length ? 'Guardando ticket y fotos…' : 'Creando ticket…') : 'Crear ticket'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
