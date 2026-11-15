import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileCheck2, MapPin, RefreshCw, Settings2, Smartphone, X } from 'lucide-react'
import { useAuth } from '../../auth/context/AuthProvider'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'
import { loadAllStaffDays } from '../staffData'
import { hours, type StaffDay, type StaffOperator } from '../staffModel'
import {
  actionLabels, compareClockDay, dayLabel, formatClockMinutes, localDate, localTime,
  statusLabels, type ClockDayReview, type ClockEvent, type ClockLocationMode, type ClockSettings,
} from '../clockModel'

const timezones=['Europe/Madrid','Europe/Lisbon','Europe/London','Europe/Paris',
  'Atlantic/Canary','UTC','America/Mexico_City','America/Bogota','America/Lima',
  'America/Santiago','America/Argentina/Buenos_Aires','America/New_York','Asia/Dubai']
const rowPageSize=500
function startOfMonth(date:string){return date.slice(0,7)+'-01'}
function lastOfMonth(date:string){
  const [year,month]=date.slice(0,7).split('-').map(Number)
  const last=new Date(year,month,0,12).getDate()
  return date.slice(0,7)+'-'+String(last).padStart(2,'0')
}
function exportCsv(rows:ClockDayReview[],timezone:string){
  const values=[
    ['Fecha','Trabajador','Turno previsto (min)','Fichado (min)','Diferencia (min)','Estado',
      'Entrada real','Salida real','Firma al salir','Ubicación entrada','Ubicación salida'],
    ...rows.map(row=>{
      const initial=row.events.find(e=>e.event_type==='IN')
      const final=row.events.find(e=>e.event_type==='OUT')
      const position=(event:ClockEvent|undefined)=>event?.latitude===null||event?.latitude===undefined?'':event.latitude+','+event.longitude
      return [row.day,row.name,String(row.planned),row.actual==null?'':String(row.actual),
        row.delta==null?'':String(row.delta),statusLabels[row.status],
        initial?localTime(initial.event_at,timezone):'',final?localTime(final.event_at,timezone):'',
        final?'Consultar registro original':'',position(initial),position(final)]
    }),
  ]
  const csv='\uFEFF'+values.map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(';')).join('\r\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const link=document.createElement('a');const url=URL.createObjectURL(blob)
  link.href=url;link.download='arias_registro_jornada.csv';document.body.appendChild(link);link.click();link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export default function StaffClockAdminPage(){
  const navigate=useNavigate()
  const {hotel,isPlatformAdmin,loading:hotelLoading}=useHotelScope()
  const {session}=useAuth()
  const today=localDate('Europe/Madrid')
  const [start,setStart]=useState(startOfMonth(today))
  const [end,setEnd]=useState(lastOfMonth(today))
  const [operators,setOperators]=useState<StaffOperator[]>([])
  const [entries,setEntries]=useState<StaffDay[]>([])
  const [events,setEvents]=useState<ClockEvent[]>([])
  const [settings,setSettings]=useState<ClockSettings|null>(null)
  const [enabled,setEnabled]=useState(false)
  const [locationMode,setLocationMode]=useState<ClockLocationMode>('OFF')
  const [signatureRequired,setSignatureRequired]=useState(true)
  const [timezone,setTimezone]=useState('Europe/Madrid')
  const [filter,setFilter]=useState('INCIDENCIAS')
  const [selectedOperator,setSelectedOperator]=useState('ALL')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [allowed,setAllowed]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [signature,setSignature]=useState<string|null>(null)
  useEffect(()=>{
    if(!hotel?.id||hotelLoading)return
    let alive=true
    void supabase.rpc('has_hotel_permission',{target_hotel_id:hotel.id,permission_code:'maintenance.configure'})
      .then(({data,error:permissionError})=>{
        if(!alive)return
        setAllowed(isPlatformAdmin||(!permissionError&&data===true))
      })
    return()=>{alive=false}
  },[hotel?.id,hotelLoading,isPlatformAdmin])
  async function load(){
    if(!hotel?.id||!allowed)return
    if(!start||!end||start>end){setError('Selecciona un período válido.');return}
    setLoading(true);setError('')
    const [people,plans,config]=await Promise.all([
      supabase.from('staff_operators').select('*').eq('hotel_id',hotel.id).order('display_name'),
      loadAllStaffDays({hotelId:hotel.id,startDate:start,endDate:end}),
      supabase.from('staff_clock_settings').select('*').eq('hotel_id',hotel.id).maybeSingle(),
    ])
    if(people.error||plans.error||config.error){
      setError((people.error||plans.error||config.error)!.message);setLoading(false);return
    }
    const all:ClockEvent[]=[]
    let eventError:string|null=null
    for(let offset=0;offset<20000;offset+=rowPageSize){
      const page=await supabase.from('staff_clock_events')
        .select('id,hotel_id,operator_id,work_date,event_type,event_at,latitude,longitude,accuracy_m')
        .eq('hotel_id',hotel.id).gte('work_date',start).lte('work_date',end)
        .order('event_at',{ascending:true}).order('id',{ascending:true})
        .range(offset,offset+rowPageSize-1)
      if(page.error){eventError=page.error.message;break}
      const rows=(page.data??[]) as ClockEvent[]
      all.push(...rows)
      if(rows.length<rowPageSize)break
    }
    if(eventError){setError(eventError);setLoading(false);return}
    const values=config.data as ClockSettings|null
    setOperators((people.data??[]) as StaffOperator[])
    setEntries(plans.data)
    setEvents(all)
    setSettings(values)
    setEnabled(values?.is_enabled??false)
    setLocationMode(values?.location_mode??'OFF')
    setSignatureRequired(values?.signature_on_out??true)
    setTimezone(values?.timezone_name??'Europe/Madrid')
    setLoading(false)
  }
  useEffect(()=>{void load()},[hotel?.id,allowed,start,end])
  const clockToday=localDate(settings?.timezone_name??'Europe/Madrid')
  const activationDate=settings?.enabled_from??clockToday
  const reviews=useMemo(()=>{
    const plans=new Map(entries.map(d=>[d.operator_id+'|'+d.work_date,d]))
    const eventGroups=new Map<string,ClockEvent[]>()
    for(const event of events){
      const key=event.operator_id+'|'+event.work_date
      const current=eventGroups.get(key)??[]
      current.push(event);eventGroups.set(key,current)
    }
    const keys=new Set([...plans.keys(),...eventGroups.keys()])
    const names=new Map(operators.map(o=>[o.id,o.display_name]))
    const result:ClockDayReview[]=[]
    for(const key of keys){
      const separator=key.indexOf('|');const operatorId=key.slice(0,separator);const day=key.slice(separator+1)
      const row=compareClockDay(operatorId,names.get(operatorId)??'Trabajador',day,plans.get(key),
        eventGroups.get(key)??[],clockToday,activationDate)
      if(row)result.push(row)
    }
    return result.sort((a,b)=>b.day.localeCompare(a.day)||a.name.localeCompare(b.name))
  },[entries,events,operators,clockToday,activationDate])
  const anomalous=(row:ClockDayReview)=>{
    if(['MISSING','DIFFERENCE','UNPLANNED'].includes(row.status))return true
    if(row.status!=='OPEN')return false
    const last=row.events[row.events.length-1]
    // Do not flag legitimate overnight shifts that are still in progress.
    return !!last && Date.now()-new Date(last.event_at).getTime()>18*60*60*1000
  }
  const shown=reviews.filter(row=>(selectedOperator==='ALL'||row.operatorId===selectedOperator) &&
    (filter!=='INCIDENCIAS'||anomalous(row)))
  const anomalies=reviews.filter(anomalous).length
  const closed=reviews.filter(row=>row.actual!==null)
  const expected=closed.reduce((sum,row)=>sum+row.planned,0)
  const actual=closed.reduce((sum,row)=>sum+(row.actual??0),0)
  async function saveSettings(){
    if(!hotel?.id||!allowed||busy)return
    try{new Intl.DateTimeFormat('es-ES',{timeZone:timezone})}
    catch{setError('Zona horaria no válida. Selecciona una opción de la lista.');return}
    setBusy(true);setError('');setSuccess('')
    const changes={
      hotel_id:hotel.id,timezone_name:timezone,location_mode:locationMode,
      signature_on_out:signatureRequired,is_enabled:enabled,
      enabled_from:settings?.enabled_from??localDate(timezone),
      updated_by:session?.user.id??null,updated_at:new Date().toISOString(),
    }
    const r=await supabase.from('staff_clock_settings').upsert(changes,{onConflict:'hotel_id'})
    if(r.error)setError(r.error.message)
    else{setSuccess(enabled?'Registro configurado y activado.':'Configuración guardada; fichaje desactivado.');await load()}
    setBusy(false)
  }
  async function inspectSignature(id:string){
    setError('')
    const r=await supabase.from('staff_clock_events').select('signature_png').eq('id',id).single()
    if(r.error){setError(r.error.message);return}
    if(!r.data?.signature_png){setError('Este fichaje de salida no tiene firma guardada.');return}
    setSignature(r.data.signature_png as string)
  }
  if(hotelLoading)return <main className="p-6 text-slate-500">Seleccionando centro…</main>
  if(!hotel)return <main className="p-6 text-slate-600">Selecciona una empresa y centro de trabajo.</main>
  if(!allowed)return <main className="mx-auto max-w-lg p-6 text-slate-700">
    <button onClick={()=>navigate('/')} className="mb-4 text-sm underline">Volver</button>
    <h1 className="text-lg font-bold">Registro de jornada</h1>
    <p className="mt-2 text-sm">Solo los responsables autorizados pueden consultar o configurar el registro de jornada de este centro.</p>
  </main>
  return <main className="min-h-screen bg-slate-100 p-2 text-slate-900 sm:p-5">
    <div className="mx-auto max-w-6xl space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-3">
          <button type="button" title="Volver" aria-label="Volver" className="rounded-lg border p-2" onClick={()=>navigate('/')}><ArrowLeft size={17}/></button>
          <div><h1 className="text-lg font-bold">Registro de jornada</h1>
            <p className="text-xs text-slate-500">{hotel.name} · Separado del cuadrante</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={()=>navigate('/planificador-horario')} className="rounded-lg border px-3 py-2 text-xs font-semibold">Cuadrante</button>
          <button type="button" onClick={()=>navigate('/fichaje')} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><Smartphone size={15}/> Mi fichaje</button>
        </div>
      </header>
      {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}

      <section className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <details open={!settings?.is_enabled}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Settings2 size={18}/> Configuración del centro
            <span className={'ml-auto rounded-full px-2 py-0.5 text-xs '+(settings?.is_enabled?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800')}>
              {settings?.is_enabled?'Activo':'Sin activar'}
            </span></summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium">Estado
              <select value={enabled?'ON':'OFF'} onChange={e=>setEnabled(e.target.value==='ON')}
                className="mt-1 w-full rounded-lg border p-2 text-sm">
                <option value="OFF">Desactivado</option><option value="ON">Activado</option>
              </select>
            </label>
            <label className="text-xs font-medium">Ubicación al fichar
              <select value={locationMode} onChange={e=>setLocationMode(e.target.value as ClockLocationMode)}
                className="mt-1 w-full rounded-lg border p-2 text-sm">
                <option value="OFF">No recoger GPS</option>
                <option value="OPTIONAL">Solicitar, no obligatoria</option>
                <option value="REQUIRED">Obligatoria</option>
              </select>
            </label>
            <label className="text-xs font-medium">Zona horaria del centro
              <select value={timezone} onChange={e=>setTimezone(e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 text-sm">{timezones.map(t=><option key={t}>{t}</option>)}</select>
            </label>
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
              <input type="checkbox" checked={signatureRequired} onChange={e=>setSignatureRequired(e.target.checked)}/>
              Firma al finalizar la jornada
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            El registro se inicia desde el día de activación. No se inventan fichajes anteriores.
            Antes de habilitar GPS, la empresa debe informar a su plantilla, justificar su necesidad y ofrecer medios adecuados de fichaje.
            Solo se solicita ubicación al pulsar un botón; no existe seguimiento continuo.
          </p>
          <button type="button" onClick={()=>void saveSettings()} disabled={busy}
            className="mt-3 min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {busy?'Guardando…':'Guardar configuración'}
          </button>
        </details>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium">Desde<input type="date" value={start} max={end}
            onChange={e=>setStart(e.target.value)} className="mt-1 block rounded-lg border p-2 text-sm"/></label>
          <label className="text-xs font-medium">Hasta<input type="date" value={end} min={start}
            onChange={e=>setEnd(e.target.value)} className="mt-1 block rounded-lg border p-2 text-sm"/></label>
          <label className="min-w-[120px] flex-1 text-xs font-medium">Trabajador
            <select value={selectedOperator} onChange={e=>setSelectedOperator(e.target.value)}
              className="mt-1 block w-full rounded-lg border p-2 text-sm">
              <option value="ALL">Todos</option>{operators.map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}
            </select>
          </label>
          <button type="button" onClick={()=>void load()} disabled={loading} title="Actualizar"
            className="flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs"><RefreshCw size={14}/> Actualizar</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Jornadas cerradas</p><p className="text-xl font-bold">{closed.length}</p></div>
          <div className="rounded-xl bg-amber-50 p-3"><p className="text-[11px] text-amber-800">Incidencias</p><p className="text-xl font-bold text-amber-900">{anomalies}</p></div>
          <div className="rounded-xl bg-sky-50 p-3"><p className="text-[11px] text-sky-800">Horas fichadas</p><p className="text-lg font-bold text-sky-900">{hours(actual)}</p></div>
        </div>
        {closed.length>0&&<p className="text-xs text-slate-500">En las jornadas cerradas mostradas: {hours(expected)} previstas y {hours(actual)} fichadas. Las diferencias no se registran automáticamente como horas extra.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Filtrar jornadas" className="flex rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={()=>setFilter('INCIDENCIAS')}
              className={'rounded-md px-3 py-1.5 text-xs font-semibold '+(filter==='INCIDENCIAS'?'bg-white shadow':'text-slate-600')}>Solo incidencias</button>
            <button type="button" onClick={()=>setFilter('TODAS')}
              className={'rounded-md px-3 py-1.5 text-xs font-semibold '+(filter==='TODAS'?'bg-white shadow':'text-slate-600')}>Todas</button>
          </div>
          <button type="button" onClick={()=>exportCsv(shown,settings?.timezone_name??timezone)}
            disabled={!shown.length} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"><Download size={15}/> Exportar CSV</button>
        </div>
        {loading?<p className="py-5 text-center text-sm text-slate-500">Cargando registros…</p>:
        !settings?.is_enabled?<p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">Activa el módulo para empezar a recoger fichajes. No se han generado registros ficticios.</p>:
        !shown.length?<p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
          {filter==='INCIDENCIAS'?'No hay incidencias para este filtro. Puedes consultar todas las jornadas.':'No hay registros en este período.'}
        </p>:
        <div className="space-y-2">
          {shown.map(row=>{
            const bad=row.status==='MISSING'||row.status==='DIFFERENCE'||row.status==='UNPLANNED'||(row.status==='OPEN'&&row.day<clockToday)
            const out=row.events.find(e=>e.event_type==='OUT')
            return <details key={row.key} className="rounded-xl border border-slate-200">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                <div className="min-w-0"><p className="truncate text-sm font-bold">{row.name}</p><p className="text-xs text-slate-500">{dayLabel(row.day)}</p></div>
                <span className={'rounded-lg px-2 py-1 text-right text-[11px] font-semibold sm:order-5 sm:text-center '+(bad?'bg-amber-50 text-amber-800':'bg-slate-50 text-slate-600')}>{statusLabels[row.status]}</span>
                <p className="hidden text-xs sm:block">Previstas <strong className="block text-sm">{formatClockMinutes(row.planned)}</strong></p>
                <p className="hidden text-xs sm:block">Fichadas <strong className="block text-sm">{formatClockMinutes(row.actual)}</strong></p>
                <p className="hidden text-xs sm:block">Diferencia <strong className="block text-sm">{formatClockMinutes(row.delta)}</strong></p>
              </summary>
              <div className="border-t border-slate-100 px-3 py-2">
                <div className="mb-2 grid grid-cols-3 gap-1 text-center text-[11px] sm:hidden">
                  <span>Previstas<br/><b>{formatClockMinutes(row.planned)}</b></span>
                  <span>Fichadas<br/><b>{formatClockMinutes(row.actual)}</b></span>
                  <span>Diferencia<br/><b>{formatClockMinutes(row.delta)}</b></span>
                </div>
                {row.events.length===0?<p className="py-2 text-xs text-slate-500">Sin fichajes originales en esta fecha.</p>:
                <div className="divide-y divide-slate-100">
                  {row.events.map(event=><div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <div><p className="font-semibold">{actionLabels[event.event_type]} · {localTime(event.event_at,settings?.timezone_name??timezone)}</p>
                      <p className="text-slate-500">Fecha y hora del servidor · original inalterado</p></div>
                    <div className="flex items-center gap-2">
                      {event.latitude!==null&&<a href={'https://www.google.com/maps/search/?api=1&query='+event.latitude+'%2C'+event.longitude}
                        target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border px-2 py-1.5"><MapPin size={13}/> Ubicación</a>}
                      {event.event_type==='OUT'&&<button type="button" onClick={()=>void inspectSignature(event.id)}
                        className="flex items-center gap-1 rounded-lg border px-2 py-1.5"><FileCheck2 size={13}/> Firma</button>}
                    </div>
                  </div>)}
                </div>}
                {row.status==='DIFFERENCE'&&<p className="mt-1 text-[11px] text-slate-600">Diferencia superior a 5 minutos; se muestra sin modificar los fichajes ni generar horas extra automáticamente.</p>}
                {!out&&row.events.length>0&&<p className="mt-1 text-[11px] text-slate-600">Jornada todavía abierta. No se computan como definitivas las horas sin salida registrada.</p>}
              </div>
            </details>
          })}
        </div>}
      </section>
      <p className="px-2 text-[11px] text-slate-500">Módulo piloto: requiere revisión jurídica, política de privacidad, procedimientos de corrección auditada y pruebas de acceso antes de ofrecerlo como registro de jornada definitivo a clientes.</p>
    </div>
    {signature&&<div role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setSignature(null)}}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4">
      <section role="dialog" aria-modal="true" aria-label="Firma de salida" className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><FileCheck2 size={18}/> Firma de salida</h2>
          <button title="Cerrar" aria-label="Cerrar" className="rounded-lg border p-2" onClick={()=>setSignature(null)}><X size={17}/></button></div>
        <img src={signature} alt="Firma manuscrita guardada al finalizar la jornada" className="mt-4 w-full rounded-xl border"/>
        <p className="mt-2 text-xs text-slate-500">Imagen original asociada al fichaje de salida.</p>
      </section>
    </div>}
  </main>
}
