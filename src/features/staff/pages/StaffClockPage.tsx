import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock3, LogOut, MapPin, PenLine, RefreshCw, RotateCcw } from 'lucide-react'
import { useAuth } from '../../auth/context/AuthProvider'
import { ariasAuth } from '../../../core/auth/authService'
import { supabase } from '../../../lib/supabase'
import { splitShiftLabel, plannedMinutes, type StaffDay, type StaffOperator } from '../staffModel'
import { actionLabels, dayLabel, localDate, localTime, type ClockAction, type ClockEvent, type ClockSettings } from '../clockModel'

function SignaturePad({onChange}:{onChange:(image:string|null)=>void}){
  const ref=useRef<HTMLCanvasElement|null>(null)
  const pointer=useRef<number|null>(null)
  useEffect(()=>{
    const context=ref.current?.getContext('2d')
    if(!context)return
    context.fillStyle='#fff';context.fillRect(0,0,640,210)
    context.strokeStyle='#0f172a';context.lineWidth=2.8
    context.lineJoin='round';context.lineCap='round'
  },[])
  function coords(e:PointerEvent<HTMLCanvasElement>){
    const canvas=e.currentTarget
    const rect=canvas.getBoundingClientRect()
    return {x:(e.clientX-rect.left)*canvas.width/rect.width,
      y:(e.clientY-rect.top)*canvas.height/rect.height}
  }
  function start(e:PointerEvent<HTMLCanvasElement>){
    const context=e.currentTarget.getContext('2d');if(!context)return
    pointer.current=e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const p=coords(e);context.beginPath();context.moveTo(p.x,p.y)
    context.lineTo(p.x+0.01,p.y+0.01);context.stroke()
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    if(pointer.current!==e.pointerId)return
    const context=e.currentTarget.getContext('2d');if(!context)return
    const p=coords(e);context.lineTo(p.x,p.y);context.stroke()
  }
  function end(e:PointerEvent<HTMLCanvasElement>){
    if(pointer.current!==e.pointerId)return
    pointer.current=null
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
    onChange(e.currentTarget.toDataURL('image/png'))
  }
  function clear(){
    const context=ref.current?.getContext('2d');if(!context)return
    context.fillStyle='#fff';context.fillRect(0,0,640,210)
    context.strokeStyle='#0f172a';context.lineWidth=2.8
    context.lineJoin='round';context.lineCap='round'
    onChange(null)
  }
  return <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><PenLine size={16}/> Firma de cierre</label>
      <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-slate-600"><RotateCcw size={13}/> Limpiar</button>
    </div>
    <canvas ref={ref} width={640} height={210} role="img" aria-label="Área para firmar con el dedo"
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      className="h-[126px] w-full rounded-xl border-2 border-slate-200 bg-white"
      style={{touchAction:'none'}}/>
    <p className="text-[11px] text-slate-500">Firma con el dedo una sola vez al finalizar la jornada. Se guarda la imagen, sin analizar rasgos biométricos.</p>
  </div>
}

const fallbackSettings:Omit<ClockSettings,'hotel_id'>={
  timezone_name:'Europe/Madrid',location_mode:'OFF',signature_on_out:true,
  is_enabled:false,enabled_from:localDate('Europe/Madrid'),
}

export default function StaffClockPage(){
  const navigate=useNavigate()
  const {session,loading:authLoading}=useAuth()
  const [workers,setWorkers]=useState<StaffOperator[]>([])
  const [operatorId,setOperatorId]=useState('')
  const [settings,setSettings]=useState<ClockSettings|null>(null)
  const [planned,setPlanned]=useState<StaffDay|null>(null)
  const [events,setEvents]=useState<ClockEvent[]>([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [signature,setSignature]=useState<string|null>(null)

  useEffect(()=>{
    if(authLoading)return
    if(!session){navigate('/login?next=fichaje',{replace:true});return}
    let alive=true
    void supabase.from('staff_operators').select('*').eq('linked_user_id',session.user.id)
      .eq('active',true).order('display_name').then(({data,error:loadError})=>{
        if(!alive)return
        if(loadError)setError(loadError.message)
        const available=(data??[]) as StaffOperator[]
        setWorkers(available)
        setOperatorId(current=>available.some(w=>w.id===current)?current:available[0]?.id??'')
        setLoading(false)
      })
    return()=>{alive=false}
  },[authLoading,session?.user.id,navigate])

  const selected=workers.find(w=>w.id===operatorId)??null
  async function refresh(operator:StaffOperator){
    setLoading(true);setError('')
    const config=await supabase.from('staff_clock_settings').select('*')
      .eq('hotel_id',operator.hotel_id).maybeSingle()
    if(config.error){setError(config.error.message);setLoading(false);return}
    const nextConfig=(config.data as ClockSettings|null)??{...fallbackSettings,hotel_id:operator.hotel_id}
    const today=localDate(nextConfig.timezone_name)
    const [shifts,records]=await Promise.all([
      supabase.from('staff_schedule_entries').select('*').eq('operator_id',operator.id)
        .eq('work_date',today).maybeSingle(),
      supabase.from('staff_clock_events')
        .select('id,hotel_id,operator_id,work_date,event_type,event_at,latitude,longitude,accuracy_m')
        .eq('operator_id',operator.id).order('event_at',{ascending:false}).limit(60),
    ])
    setSettings(nextConfig)
    setPlanned((shifts.data??null) as StaffDay|null)
    setEvents((records.data??[]) as ClockEvent[])
    if(shifts.error||records.error)setError((shifts.error||records.error)!.message)
    setLoading(false)
  }
  useEffect(()=>{
    const worker=workers.find(w=>w.id===operatorId)
    if(!worker)return
    let active=true
    void refresh(worker).then(()=>{if(!active)return})
    return()=>{active=false}
  },[operatorId,workers])

  const configuration=settings??(selected?{...fallbackSettings,hotel_id:selected.hotel_id}:null)
  const timezone=configuration?.timezone_name??'Europe/Madrid'
  const today=localDate(timezone)
  const latest=events[0]
  const closedToday=latest?.event_type==='OUT'&&latest.work_date===today
  const nextActions:ClockAction[] = !configuration?.is_enabled || closedToday ? [] :
    !latest || latest.event_type==='OUT' ? ['IN'] :
    latest.event_type==='BREAK_START' ? ['BREAK_END'] :
    latest.event_type==='IN'||latest.event_type==='BREAK_END' ? ['BREAK_START','OUT'] : []
  const ownDay=events.filter(e=>e.work_date===(latest&&latest.event_type!=='OUT'?latest.work_date:today))
    .sort((a,b)=>a.event_at.localeCompare(b.event_at))
  const todayShift=planned?.state==='SHIFT'?planned:null
  async function signOut(){await ariasAuth.signOut();navigate('/login',{replace:true})}

  async function punch(type:ClockAction){
    if(!selected||!configuration?.is_enabled||busy)return
    if(type==='OUT'&&configuration.signature_on_out&&!signature){
      setError('Firma en el recuadro antes de registrar la salida.');return
    }
    setBusy(true);setError('');setMessage('')
    let latitude:number|null=null,longitude:number|null=null,accuracy:number|null=null
    if(configuration.location_mode!=='OFF'){
      try{
        const position=await new Promise<GeolocationPosition>((resolve,reject)=>{
          if(!navigator.geolocation){reject(new Error('Ubicación no disponible en este dispositivo.'));return}
          navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:12000,maximumAge:0})
        })
        latitude=position.coords.latitude;longitude=position.coords.longitude;accuracy=position.coords.accuracy
      }catch(e){
        if(configuration.location_mode==='REQUIRED'){
          setError('No se pudo obtener la ubicación. Usa un dispositivo autorizado o contacta con el responsable. '+(e instanceof Error?e.message:''))
          setBusy(false);return
        }
      }
    }
    const result=await supabase.rpc('staff_clock_punch',{
      p_operator_id:selected.id,p_event_type:type,p_latitude:latitude,p_longitude:longitude,
      p_accuracy_m:accuracy,p_signature_png:type==='OUT'?signature:null,
    })
    if(result.error){setError(result.error.message);setBusy(false);return}
    setSignature(null)
    setMessage(actionLabels[type]+' registrada a las '+localTime((result.data as ClockEvent).event_at,timezone)+
      (latitude!==null?' · Ubicación guardada':''))
    await refresh(selected)
    setBusy(false)
  }
  if(authLoading || (loading&&!selected))return <main className="min-h-screen bg-slate-100 p-8 text-sm text-slate-500">Preparando el fichaje…</main>
  return <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:py-8">
    <div className="mx-auto max-w-md space-y-3">
      <header className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
        <button type="button" className="flex items-center gap-1.5 text-sm font-semibold" onClick={()=>navigate('/mi-horario')}><ArrowLeft size={18}/> Mi horario</button>
        <span className="flex items-center gap-1.5 text-sm font-bold"><Clock3 size={18}/> Fichaje</span>
        <button type="button" title="Cerrar sesión" aria-label="Cerrar sesión" className="rounded-lg border p-2" onClick={()=>void signOut()}><LogOut size={16}/></button>
      </header>
      {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message&&<p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"><CheckCircle2 className="shrink-0" size={18}/>{message}</p>}
      {!workers.length&&!loading?<section className="rounded-2xl bg-white p-5"><h1 className="font-bold">Cuenta sin trabajador vinculado</h1><p className="mt-2 text-sm text-slate-600">Un responsable debe asociar tu usuario con tu ficha de operario antes de fichar.</p></section>:
      selected&&<section className="space-y-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h1 className="truncate text-lg font-bold">{selected.display_name}</h1>
            <button type="button" title="Actualizar datos" className="rounded-lg border p-2" disabled={busy||loading} onClick={()=>void refresh(selected)}><RefreshCw size={16}/></button>
          </div>
          {workers.length>1&&<select aria-label="Elegir ficha de trabajador" value={operatorId} onChange={e=>{setOperatorId(e.target.value);setSignature(null)}}
            className="mt-2 w-full rounded-lg border p-2 text-sm">{workers.map(w=><option key={w.id} value={w.id}>{w.display_name}</option>)}</select>}
          <p className="mt-1 text-xs text-slate-500">{dayLabel(today)} · Horario local del centro</p>
          {todayShift?<div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Turno previsto</p>
            <p className="mt-1 text-lg font-bold">{splitShiftLabel(todayShift.start_time,todayShift.end_time)}</p>
            <p className="text-xs text-slate-600">{plannedMinutes(todayShift)/60} h previstas</p>
          </div>:<p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Hoy no hay un turno programado. El fichaje real, si se realiza, quedará identificado para revisión.</p>}
        </div>
        {!configuration?.is_enabled?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Registro pendiente de activar</h2>
          <p className="mt-1 text-sm text-amber-800">El responsable de este centro debe activar y configurar el registro de jornada. El cuadrante sigue disponible.</p>
        </div>:<>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold">Estado de jornada</h2>
            <p className="mt-1 text-sm text-slate-600">{closedToday?'Jornada finalizada':!latest||latest.event_type==='OUT'?'Pendiente de entrada':
              latest.event_type==='BREAK_START'?'En pausa':'En jornada'}</p>
            {latest&&<p className="mt-1 text-xs text-slate-500">Último fichaje: {actionLabels[latest.event_type]} · {localTime(latest.event_at,timezone)}</p>}
            {nextActions.includes('OUT')&&configuration.signature_on_out&&<div className="mt-4">
              <SignaturePad onChange={setSignature}/>
            </div>}
            <div className="mt-4 grid gap-2">
              {nextActions.filter(action=>action!=='BREAK_START').map(action=>
                <button key={action} type="button" disabled={busy||loading} onClick={()=>void punch(action)}
                  className="min-h-14 rounded-xl bg-slate-900 px-4 py-3 text-base font-bold text-white transition hover:bg-slate-700 disabled:opacity-50">
                  {busy?'Guardando fichaje…':'Registrar '+actionLabels[action].toLowerCase()}
                </button>)}
              {nextActions.includes('BREAK_START')&&<button type="button" disabled={busy||loading} onClick={()=>void punch('BREAK_START')}
                className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">
                Iniciar pausa
              </button>}
              {closedToday&&<p className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800">Jornada cerrada correctamente.</p>}
            </div>
            <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <MapPin size={16} className="mt-0.5 shrink-0"/>
              <span>{configuration.location_mode==='OFF'?'Este centro no recoge ubicación.':
                configuration.location_mode==='REQUIRED'?'La ubicación se solicita solo al fichar; es obligatoria en este centro.':
                  'Puedes permitir la ubicación solo al fichar; no se realiza seguimiento continuo.'}</span>
            </div>
          </div>
        </>}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold">Movimientos de jornada</h2>
          {!ownDay.length?<p className="mt-2 text-sm text-slate-500">Todavía no hay fichajes en esta jornada.</p>:
            <div className="mt-2 divide-y divide-slate-100">
              {ownDay.map(event=><div key={event.id} className="flex justify-between gap-2 py-2 text-sm">
                <div><p className="font-medium">{actionLabels[event.event_type]}</p>
                  <p className="text-[11px] text-slate-500">{event.latitude!==null?'Ubicación registrada':'Sin ubicación'}{event.event_type==='OUT'?' · Firma de cierre':''}</p>
                </div><time className="font-semibold tabular-nums">{localTime(event.event_at,timezone)}</time>
              </div>)}
            </div>}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Las horas se registran con la hora del servidor. El cuadrante es una referencia, no genera fichajes ni los modifica.</p>
        </section>
      </section>}
    </div>
  </main>
}
