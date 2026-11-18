import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, FileText, Image, Save, Upload, UserRound, Wrench, X } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../auth/context/AuthProvider'
import { dueMessage, hotelDay } from '../../../shared/maintenance/preventiveSchedule'
import { useHotelDay } from '../../../shared/maintenance/useHotelDay'

type WorkOrder = {
  id: string; hotel_id: string; scheduled_job_id: string | null; maintenance_plan_id: string | null
  parent_work_order_id: string | null; resolved_apparatus_registry_id: string | null
  apparatus_registry_id: string | null; ot_number: string; title: string; description: string | null
  work_type: 'PREVENTIVE' | 'CORRECTIVE' | 'ACTUATION'
  status: 'PENDING' | 'IN_MANAGEMENT' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
  completion_timing: 'ON_TIME' | 'OUT_OF_DATE' | null
  assigned_user_id: string | null; assigned_user_name: string | null; assigned_user_email: string | null
  scheduled_date: string | null; started_at: string | null; completed_at: string | null
  completed_by: string | null; observations: string | null
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  maintenance_plan_name: string | null; apparatus_code: string | null; apparatus_name: string | null
  plant: string | null; location: string | null
  reported_location_id: string | null; reported_location_snapshot: string | null
  execution_location_id: string | null; execution_location_snapshot: string | null
  created_at: string; updated_at: string
}
type TicketLocation = {
  id: string; parent_location_id: string | null; location_type: string
  name: string; active: boolean; sort_order: number
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
type Evidence = { id:string; storage_path:string; file_name:string; mime_type:string; file_size:number; uploaded_by:string|null; uploaded_at:string; url:string }

const typeLabels = { PREVENTIVE:'Preventiva', CORRECTIVE:'Correctiva', ACTUATION:'Actuación' } as const
const priorityLabels = { LOW:'Baja', NORMAL:'Normal', HIGH:'Alta', CRITICAL:'Crítica' } as const
const resultOptions = [
  { value:'COMPLETED', label:'Realizada' },
  { value:'COMPLETED_WITH_ISSUES', label:'Realizada con incidencias' },
  { value:'NOT_CONFORM', label:'No conforme' },
] as const

function statusLabel(item:WorkOrder){
  if(item.status==='REJECTED') return 'Rechazado'
  if(item.status==='COMPLETED' && item.completion_timing==='OUT_OF_DATE') return 'Cerrado · Fuera de fecha'
  if(item.status==='PENDING' && item.scheduled_date && item.scheduled_date < new Date().toISOString().slice(0,10)) return 'Vencida'
  if(item.status==='IN_MANAGEMENT') return 'En gestión'
  if(item.status==='IN_PROGRESS') return 'En curso'
  if(item.status==='COMPLETED') return 'Cerrado'
  return 'Pendiente'
}
function statusTone(item:WorkOrder){
  if(item.status==='REJECTED') return 'bg-slate-200 text-slate-600'
  if(item.status==='COMPLETED' && item.completion_timing==='OUT_OF_DATE') return 'bg-amber-100 text-amber-700'
  if(item.status==='COMPLETED') return 'bg-emerald-100 text-emerald-700'
  if(item.status==='IN_PROGRESS') return 'bg-blue-100 text-blue-700'
  if(item.status==='IN_MANAGEMENT') return 'bg-violet-100 text-violet-700'
  if(item.scheduled_date && item.scheduled_date < new Date().toISOString().slice(0,10)) return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}
function fmtDateTime(v:string|null){ return v ? new Date(v).toLocaleString('es-ES') : '—' }

export default function MaintenanceWorkOrderDetailPage(){
  useHotelDay()
  const navigate=useNavigate()
  const location=useLocation()
  const [linkedBook, setLinkedBook] = useState<{ticket: string; book: string} | null>(null)
  const { workOrderId }=useParams<{workOrderId:string}>()
  const { hotel }=useHotelScope()
  const { session } = useAuth()
  const { confirm } = useSystemDialog()
  const [order,setOrder]=useState<WorkOrder|null>(null)
  const [baseline,setBaseline]=useState<WorkOrder|null>(null)
  const [locationOptions,setLocationOptions]=useState<TicketLocation[]>([])
  const [executionLocationId,setExecutionLocationId]=useState('')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [working,setWorking]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState(() => (location.state as { flashMessage?: string } | null)?.flashMessage ?? '')
  const [result,setResult]=useState<(typeof resultOptions)[number]['value']>('COMPLETED')
  const [evidence,setEvidence]=useState<Evidence[]>([])
  const [evidenceLoading,setEvidenceLoading]=useState(false)
  const [evidenceSaving,setEvidenceSaving]=useState(false)
  const [correctiveOpen,setCorrectiveOpen]=useState(false)
  const [correctiveTitle,setCorrectiveTitle]=useState('')
  const [correctiveDescription,setCorrectiveDescription]=useState('')
  const [correctivePriority,setCorrectivePriority]=useState<WorkOrder['priority']>('HIGH')
  const [assignees,setAssignees]=useState<Array<{id:string;name:string}>>([])
  const [canAssign,setCanAssign]=useState(false)
  const [assignmentSaving,setAssignmentSaving]=useState(false)
  const galleryRef=useRef<HTMLInputElement|null>(null)
  const canEdit = order?.status !== 'COMPLETED' && order?.status !== 'REJECTED'
  const preventiveBlocked = baseline?.work_type === 'PREVENTIVE' && (!baseline.scheduled_date || baseline.scheduled_date > hotelDay())
  const scheduleMessage = baseline?.scheduled_date ? dueMessage(baseline.scheduled_date) : 'Pendiente de programar: indica la fecha en el PAM.'

  async function load(){
    if(!workOrderId) return
    setLoading(true); setError('')
    const q=await supabase.from('maintenance_work_orders_resolved').select('*').eq('id',workOrderId).single()
    if(q.error||!q.data){setError(q.error?.message??'No se ha encontrado el ticket.');setLoading(false);return}
    const item=q.data as WorkOrder
    setOrder(item); setBaseline(item)
    setExecutionLocationId(item.execution_location_id ?? '')

    const assignmentsResult = session?.user.id && hotel?.id
      ? await supabase
          .from('user_hotel_roles')
          .select('user_id, role_id')
          .eq('hotel_id', hotel.id)
          .eq('active', true)
      : { data: [], error: null }

    const roleIds = Array.from(new Set((assignmentsResult.data ?? []).map((row) => row.role_id)))
    const rolesResult = roleIds.length
      ? await supabase.from('roles').select('id, code').in('id', roleIds).eq('active', true)
      : { data: [], error: null }

    const roleCodeById = new Map(
      (rolesResult.data ?? []).map((row) => [row.id, row.code]),
    )

    const currentRoleCodes = (assignmentsResult.data ?? [])
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
    setAssignees([])

    const assigneeIds = Array.from(
      new Set(
        (assignmentsResult.data ?? [])
          .filter((row) => {
            const code = roleCodeById.get(row.role_id)
            return code === 'TECHNICIAN' || code === 'MAINTENANCE_CHIEF'
          })
          .map((row) => row.user_id),
      ),
    )

    if (assigneeIds.length) {
      const profilesResult = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assigneeIds)
        .eq('active', true)
        .eq('account_status', 'ACTIVE')
        .order('full_name', { ascending: true })

      setAssignees(
        (profilesResult.data ?? []).map((profile) => ({
          id: profile.id,
          name: profile.full_name || 'Usuario',
        })),
      )
    }

    setLoading(false)
  }
  async function loadEvidence(){
    if(!workOrderId)return
    setEvidenceLoading(true)
    const q=await supabase.from('maintenance_work_order_evidence').select('id,storage_path,file_name,mime_type,file_size,uploaded_by,uploaded_at').eq('work_order_id',workOrderId).order('uploaded_at',{ascending:false})
    if(q.error){setError(q.error.message);setEvidenceLoading(false);return}
    const resolved=await Promise.all((q.data??[]).map(async item=>{
      const s=await supabase.storage.from('maintenance-evidence').createSignedUrl(item.storage_path,3600)
      return s.error||!s.data?.signedUrl?null:{...item,url:s.data.signedUrl} as Evidence
    }))
    setEvidence(resolved.filter(Boolean) as Evidence[]); setEvidenceLoading(false)
  }
  useEffect(() => {
    let active = true
    if (order?.id && order.work_type === 'PREVENTIVE' && order.status !== 'COMPLETED') {
      void supabase.from('technical_book_due_tickets').select('book_id').eq('ticket_id', order.id).limit(1).maybeSingle().then(({ data }) => {
        if (active) setLinkedBook(data ? { ticket: order.id, book: data.book_id } : null)
      })
    } else setLinkedBook(null)
    return () => { active = false }
  }, [order?.id, order?.work_type, order?.status])
  useEffect(()=>{void load();void loadEvidence()},[workOrderId])

  const locationHotelId = order?.hotel_id || hotel?.id
  useEffect(() => {
    let alive = true
    async function loadLocations() {
      if (!locationHotelId) {
        setLocationOptions([])
        return
      }
      const { data, error } = await supabase
        .from('hotel_locations')
        .select('id, parent_location_id, location_type, name, active, sort_order')
        .eq('hotel_id', locationHotelId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!alive) return
      if (error) {
        setError(`No se pudieron cargar las ubicaciones: ${error.message}`)
        setLocationOptions([])
        return
      }
      setLocationOptions((data ?? []) as TicketLocation[])
    }
    void loadLocations()
    return () => { alive = false }
  }, [locationHotelId])

  const dirty=!!order&&!!baseline&&(order.title!==baseline.title||order.description!==baseline.description||order.scheduled_date!==baseline.scheduled_date||order.priority!==baseline.priority||order.observations!==baseline.observations||executionLocationId!==(baseline.execution_location_id??''))

  async function saveChanges(){
    if(!order || !canEdit)return
    setSaving(true);setError('');setMessage('')
    const q=await supabase.from('maintenance_work_orders').update({
      title:order.title.trim(),description:order.description?.trim()||null,scheduled_date:order.scheduled_date||null,
      priority:order.priority,observations:order.observations?.trim()||null,
      execution_location_id:executionLocationId||null,updated_at:new Date().toISOString()
    }).eq('id',order.id).eq('hotel_id',order.hotel_id)
    setSaving(false)
    if(q.error){setError(q.error.message);return}
    setMessage('Ticket actualizado correctamente.');await load()
  }

  async function assignTicket(targetUserId: string) {
    if (!order || !canAssign || assignmentSaving) return

    setAssignmentSaving(true)
    setError('')
    setMessage('')

    const q = await supabase.rpc('assign_maintenance_work_order', {
      target_work_order_id: order.id,
      target_user_id: targetUserId || null,
    })

    setAssignmentSaving(false)

    if (q.error) {
      setError(q.error.message)
      return
    }

    setMessage(targetUserId ? 'Ticket asignado correctamente.' : 'Ticket dejado sin asignar.')
    await load()
  }

  async function changeTicketStatus(targetStatus: 'IN_MANAGEMENT' | 'IN_PROGRESS') {
    if (!order || !canEdit) return
    if (targetStatus === 'IN_PROGRESS' && preventiveBlocked) { setError(scheduleMessage); return }
    const label = targetStatus === 'IN_MANAGEMENT' ? 'en gestión' : 'en curso'
    const confirmed = await confirm({
      title: 'Cambiar estado del ticket',
      message: `¿Quieres marcar ${order.ot_number} como ${label}?`,
      variant: 'info',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return
    setWorking(true); setError(''); setMessage('')
    const q = await supabase.rpc('set_maintenance_work_order_status', {
      target_work_order_id: order.id,
      target_status: targetStatus,
    })
    setWorking(false)
    if (q.error) { setError(q.error.message); return }
    await load()
  }

  async function rejectTicket() {
    if (!order || !canEdit) return
    const confirmed = await confirm({
      title: 'Rechazar ticket',
      message: `¿Quieres enviar ${order.ot_number} al histórico como rechazado?`,
      variant: 'warning',
      confirmLabel: 'Rechazar',
      cancelLabel: 'Cancelar',
    })
    if (!confirmed) return
    setWorking(true); setError(''); setMessage('')
    const q = await supabase.rpc('reject_maintenance_work_order', {
      target_work_order_id: order.id,
      target_observations: order.observations?.trim() || null,
    })
    setWorking(false)
    if (q.error) { setError(q.error.message); return }
    navigate('/maintenance/tickets/history')
  }

  async function completeOrder(){
    if(!order)return
    if (preventiveBlocked) { setError(scheduleMessage); return }
    setWorking(true);setError('');setMessage('')
    if ((order.execution_location_id ?? '') !== executionLocationId) {
      const locationSave = await supabase
        .from('maintenance_work_orders')
        .update({ execution_location_id: executionLocationId || null })
        .eq('id', order.id)
        .eq('hotel_id', order.hotel_id)
      if (locationSave.error) {
        setWorking(false)
        setError(locationSave.error.message)
        return
      }
    }
    const q=await supabase.rpc('complete_maintenance_work_order',{
      target_work_order_id:order.id,target_result:result,target_observations:order.observations?.trim()||null
    })
    setWorking(false)
    if(q.error){setError(q.error.message);return}
    setMessage(order.work_type==='PREVENTIVE'
      ? 'Ticket preventivo finalizado. La próxima revisión y el siguiente ticket se han generado automáticamente.'
      : 'Ticket finalizado correctamente.')
    await load()
  }
  async function uploadPhotos(files:File[]){
    if(!hotel?.id||!order||!canEdit)return
    const images=files.filter(f=>f.type.startsWith('image/'))
    if(!images.length){setError('Selecciona al menos una fotografía.');return}
    setEvidenceSaving(true);setError('')
    try{
      for(const file of images){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_')
        const path=hotel.id+'/'+order.id+'/'+crypto.randomUUID()+'-'+safe
        const up=await supabase.storage.from('maintenance-evidence').upload(path,file,{contentType:file.type,upsert:false})
        if(up.error)throw up.error
        const ins=await supabase.from('maintenance_work_order_evidence').insert({
          hotel_id:hotel.id,work_order_id:order.id,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,
          uploaded_by:(await supabase.auth.getUser()).data.user?.id??null
        })
        if(ins.error){await supabase.storage.from('maintenance-evidence').remove([path]);throw ins.error}
      }
      await loadEvidence()
    }catch(err){setError(err instanceof Error?err.message:'No se han podido guardar las fotografías.')}
    finally{setEvidenceSaving(false);if(galleryRef.current)galleryRef.current.value=''}
  }
  async function removePhoto(item:Evidence){
    if (!canEdit) return
    setEvidenceSaving(true);setError('')
    try{
      const r=await supabase.storage.from('maintenance-evidence').remove([item.storage_path]);if(r.error)throw r.error
      const d=await supabase.from('maintenance_work_order_evidence').delete().eq('id',item.id);if(d.error)throw d.error
      await loadEvidence()
    }catch(err){setError(err instanceof Error?err.message:'No se ha podido eliminar la fotografía.')}
    finally{setEvidenceSaving(false)}
  }
  async function createCorrective(){
    if(!hotel?.id||!order||!correctiveTitle.trim()){setError('Indica la avería detectada.');return}
    setWorking(true);setError('');setMessage('')
    const q=await supabase.rpc('create_operational_work_order_at_location',{
      target_hotel_id:hotel.id,target_work_type:'CORRECTIVE',target_title:correctiveTitle.trim(),
      target_reported_location_id:executionLocationId||order.execution_location_id||order.reported_location_id||null,
      target_description:correctiveDescription.trim()||null,
      target_apparatus_registry_id:order.resolved_apparatus_registry_id||order.apparatus_registry_id||null,
      target_parent_work_order_id:order.id,target_priority:correctivePriority,
      target_scheduled_date:new Date().toISOString().slice(0,10),target_observations:null
    })
    setWorking(false)
    if(q.error){setError(q.error.message);return}
    setCorrectiveOpen(false);setCorrectiveTitle('');setCorrectiveDescription('');setCorrectivePriority('HIGH')
    const created=q.data as WorkOrder
    navigate('/maintenance/tickets/'+created.id)
  }

  if(loading)return <div className="min-h-screen bg-slate-100 p-4"><div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg text-sm">Cargando ficha de ticket…</div></div>
  if(!order)return <div className="min-h-screen bg-slate-100 p-4"><div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg"><p className="text-sm text-rose-700">{error||'Ticket no encontrado.'}</p><button type="button" onClick={()=>navigate('/maintenance/tickets')} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Volver a tickets</button></div></div>

  return <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
    <div className="mx-auto max-w-5xl">
      <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo onActivate={()=>navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11"/>
            <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket</div><h1 className="text-xl font-bold sm:text-2xl">{order.ot_number}</h1><p className="text-xs text-slate-500 sm:text-sm">{hotel?.name??'Hotel'} · {typeLabels[order.work_type]}</p></div>
          </div>
          <div className="arias-mobile-header-actions flex items-center gap-2"><button type="button" onClick={()=>{const returnTo=(location.state as {returnTo?:string}|null)?.returnTo;navigate(returnTo||'/maintenance/tickets')}} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft size={17}/>Volver</button><HomeButton onHome={()=>navigate('/')}/></div>
        </div>
      </header>

      {(error||message)&&<div className={error?'mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800':'mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'}>{error||message}</div>}

      <main className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-4">
            <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estado</div><span className={'mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold '+statusTone(order)}>{statusLabel(order)}</span></div>
            <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Criticidad</div><span className={'mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold '+(order.priority==='CRITICAL'?'bg-rose-100 text-rose-800':order.priority==='HIGH'?'bg-orange-100 text-orange-800':order.priority==='NORMAL'?'bg-slate-100 text-slate-700':'bg-sky-50 text-sky-700')}>{priorityLabels[order.priority]}</span></div>
          </div>
            <div className="flex flex-wrap gap-2">
              {linkedBook?.ticket === order.id && <button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => {
                const route = linkedBook.book === 'pool' ? '/pools' : linkedBook.book === 'spa' ? '/spa' : '/registros-tecnicos/libros/' + linkedBook.book
                navigate(route + '?ticket=' + order.id)
              }}>Abrir libro R-SSTT</button>}
              {order.status === 'PENDING' && (
                <button type="button" onClick={()=>void changeTicketStatus('IN_MANAGEMENT')} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50">
                  Atender
                </button>
              )}
              {order.status === 'IN_MANAGEMENT' && (
                <button type="button" onClick={()=>void changeTicketStatus('IN_PROGRESS')} disabled={working || preventiveBlocked} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">
                  En curso
                </button>
              )}
              {order.status !== 'COMPLETED' && order.status !== 'REJECTED' && (
                <>
                  <button type="button" onClick={()=>void completeOrder()} disabled={working || preventiveBlocked} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    <CheckCircle2 size={16}/>Finalizar ticket
                  </button>
                  <button type="button" onClick={()=>void rejectTicket()} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">
                    Rechazar
                  </button>
                </>
              )}
            </div>
          </div>
          {preventiveBlocked && canEdit && <p role="status" className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">{scheduleMessage} El historial y la planificación siguen disponibles.</p>}
          {order.status!=='COMPLETED'&&<div className="mt-4 grid gap-3 sm:grid-cols-[240px_1fr]">
            <label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Resultado de finalización</span><select value={result} onChange={e=>setResult(e.target.value as typeof result)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{resultOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <div className="flex items-end text-xs text-slate-500">Al finalizar un ticket preventivo se registra la ejecución real, se recalcula la próxima revisión y se genera automáticamente el siguiente ticket.</div>
          </div>}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold">Datos del ticket</div>
            <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Título</span><input value={order.title} onChange={e=>setOrder({...order,title:e.target.value})} disabled={!canEdit} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción / trabajo a realizar</span><textarea value={order.description??''} onChange={e=>setOrder({...order,description:e.target.value})} rows={5} disabled={!canEdit} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha prevista</span><input type="date" value={order.scheduled_date??''} onChange={e=>setOrder({...order,scheduled_date:e.target.value||null})} disabled={!canEdit} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              <label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Criticidad</span><select value={order.priority} onChange={e=>setOrder({...order,priority:e.target.value as WorkOrder['priority']})} disabled={!canEdit} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{Object.entries(priorityLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            </div>
            <div className="mt-4 flex justify-end"><button type="button" onClick={()=>void saveChanges()} disabled={saving||!dirty||!canEdit} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={15}/>{saving?'Guardando…':'Guardar cambios'}</button></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold">Equipo y ubicación</div>
            <div className="grid gap-2 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
              <div className="flex items-center gap-2"><Wrench size={16}/><span><strong>Equipo:</strong> {order.apparatus_code??'—'} · {order.apparatus_name??'—'}</span></div>
              <div><strong>Ubicación comunicada:</strong> {order.reported_location_snapshot || 'Sin instantánea histórica'}</div>
              {(order.plant || order.location) && <div><strong>Referencia textual de la ficha del equipo (no histórica):</strong> {[order.plant,order.location].filter(Boolean).join(' · ')}</div>}
              {order.status==='COMPLETED' && <div><strong>Ubicación de intervención:</strong> {order.execution_location_snapshot || 'Sin instantánea histórica'}</div>}
              <div className="flex items-center gap-2"><UserRound size={16}/><span><strong>Asignado:</strong> {order.assigned_user_name??'Sin asignar'}</span></div>
              <div><strong>Origen:</strong> {order.maintenance_plan_name??'Ticket operativo'}</div>
            </div>
            {canEdit && (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ubicación real de intervención</span>
                <select
                  value={executionLocationId}
                  onChange={(event) => setExecutionLocationId(event.target.value)}
                  disabled={working || saving}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
                >
                  <option value="">Usar la ubicación comunicada al cerrar</option>
                  {locationOptions
                    .filter((location) => location.active || location.id === executionLocationId)
                    .map((location) => (
                      <option key={location.id} value={location.id} disabled={!location.active}>
                        {ticketLocationPath(location.id, locationOptions)} · {location.location_type}{location.active ? '' : ' · Inactiva (referencia existente)'}
                      </option>
                    ))}
                </select>
                <span className="mt-1 block text-[11px] text-slate-500">Se guarda como ubicación de ejecución al cerrar la OT. Déjalo vacío para conservar la ubicación comunicada si coincide.</span>
              </label>
            )}
            {canAssign && order.status !== 'COMPLETED' && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Asignar ticket</span>
                  <select
                    value={order.assigned_user_id ?? ''}
                    onChange={(event) => void assignTicket(event.target.value)}
                    disabled={assignmentSaving}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:opacity-60"
                  >
                    <option value="">Sin asignar</option>
                    {assignees.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                    ))}
                  </select>
                </label>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Solo usuarios con permiso de asignación pueden modificar este campo.
                </p>
              </div>
            )}
            <div className="mt-4 grid gap-2 text-sm text-slate-600"><div><strong>Creada:</strong> {fmtDateTime(order.created_at)}</div><div><strong>Inicio:</strong> {fmtDateTime(order.started_at)}</div><div><strong>Finalización:</strong> {fmtDateTime(order.completed_at)}</div></div>
          </section>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-2 flex items-center gap-2"><FileText size={18} className="text-slate-500"/><h2 className="text-sm font-semibold">Observaciones</h2></div>
          <textarea value={order.observations??''} onChange={e=>setOrder({...order,observations:e.target.value})} disabled={!canEdit} rows={6} placeholder="Describe lo realizado, anomalías, comprobaciones y medidas tomadas…" className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm focus:border-blue-500 focus:outline-none"/>
          <div className="mt-2 flex justify-end"><button type="button" onClick={()=>void saveChanges()} disabled={saving||!dirty||!canEdit} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save size={15}/>Guardar observaciones</button></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="flex items-center gap-2 text-sm font-semibold"><Image size={17}/>Fotografías</div><div className="mt-0.5 text-xs text-slate-500">Evidencias de este ticket.</div></div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)void uploadPhotos(f);e.target.value=''}}/>
                <input id="ot-camera-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)void uploadPhotos(f);e.target.value=''}}/>
                <button type="button" onClick={()=>document.getElementById('ot-camera-input')?.click()} disabled={evidenceSaving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"><Camera size={15}/>Hacer foto</button>
                <button type="button" onClick={()=>galleryRef.current?.click()} disabled={evidenceSaving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"><Upload size={15}/>{evidenceSaving?'Guardando…':'Galería'}</button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">Solo consulta</span>
            )}
          </div>
          {evidenceLoading?<div className="mt-3 text-xs text-slate-400">Cargando fotografías…</div>:evidence.length?<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{evidence.map(x=><div key={x.id} className="group relative overflow-hidden rounded-xl border"><a href={x.url} target="_blank" rel="noreferrer" className="block aspect-square"><img src={x.url} alt={x.file_name} className="h-full w-full object-cover"/></a>{canEdit && <button type="button" onClick={()=>void removePhoto(x)} disabled={evidenceSaving} className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-50"><X size={14}/></button>}<div className="truncate border-t bg-white px-2 py-1.5 text-[10px] text-slate-500">{x.file_name}</div></div>)}</div>:<div className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-400">Todavía no hay fotografías registradas.</div>}
        </section>

        {canEdit && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2 text-sm font-semibold text-rose-900"><AlertTriangle size={18}/>Avería detectada</div><p className="mt-1 text-xs leading-5 text-rose-800">Crea un ticket correctivo vinculado a este ticket con el equipo y la trazabilidad de origen.</p></div>
            <button type="button" onClick={()=>setCorrectiveOpen(true)} disabled={working} className="inline-flex items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50">+ Crear ticket correctivo</button>
          </div>
          {correctiveOpen&&<div className="mt-4 rounded-xl border border-rose-200 bg-white p-4">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Nuevo ticket correctivo</h2><button type="button" onClick={()=>setCorrectiveOpen(false)} className="p-2 text-slate-500"><X size={17}/></button></div>
            <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Avería / título</span><input value={correctiveTitle} onChange={e=>setCorrectiveTitle(e.target.value)} placeholder="Ej. Cámara 3 sin señal" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción del problema</span><textarea value={correctiveDescription} onChange={e=>setCorrectiveDescription(e.target.value)} rows={4} placeholder="Síntomas, comprobaciones, ubicación exacta…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            <label className="mt-3 block max-w-xs"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Criticidad</span><select value={correctivePriority} onChange={e=>setCorrectivePriority(e.target.value as WorkOrder['priority'])} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{Object.entries(priorityLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setCorrectiveOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button><button type="button" onClick={()=>void createCorrective()} disabled={working||!correctiveTitle.trim()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Crear ticket correctivo</button></div>
          </div>}
        </section>}
      </main>
    </div>
  </div>
}
