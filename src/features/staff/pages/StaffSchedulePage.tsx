import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Printer, RefreshCw, UserRoundCog } from 'lucide-react'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useAuth } from '../../auth/context/AuthProvider'
import { supabase } from '../../../lib/supabase'
import {
  addDays, dateISO, fromISO, hours, isoWeek, minutesInShift, mondayOf, staffStateOptions,
  stateView, weekendHistory, type StaffDay, type StaffNote, type StaffOperator,
  type StaffOvertime, type StaffVacation,
} from '../staffModel'

type PageTab = 'CUADRANTE' | 'ANUAL' | 'FINES' | 'EXTRAS' | 'VACACIONES' | 'AUSENCIAS' | 'NOTAS'
type DayEditor = {
  operator_id:string; work_date:string; state:string; start_time:string; end_time:string;
  actual_hours:string; actual_confirmed:boolean; justification:string;
}
const tabs: Array<{id:PageTab;label:string}> = [
  {id:'CUADRANTE',label:'Cuadrante'}, {id:'ANUAL',label:'Resumen anual'},
  {id:'FINES',label:'Fines de semana'}, {id:'EXTRAS',label:'Horas extra'},
  {id:'VACACIONES',label:'Vacaciones'}, {id:'AUSENCIAS',label:'Bajas y ausencias'},
  {id:'NOTAS',label:'Observaciones privadas'},
]
const baseInput='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600'
const num = (v:number)=>v.toLocaleString('es-ES')
function asDisplayDate(iso:string) {return fromISO(iso).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
function getWeekendSummary(days:StaffDay[],operatorId:string,year:number) {
  const weeks=weekendHistory(days,year).get(operatorId) ?? new Map()
  return { weeks:[...weeks.entries()].sort((a,b)=>a[0].localeCompare(b[0])),
    total:weeks.size, full:[...weeks.values()].filter(w=>w.saturday&&w.sunday).length,
    verified:[...weeks.values()].filter(w=>w.confirmed).length }
}
function operatorTotals(days:StaffDay[],overtime:StaffOvertime[],operatorId:string,year:number){
  const own=days.filter(d=>d.operator_id===operatorId && d.work_date.startsWith(String(year)))
  const extra=overtime.filter(d=>d.operator_id===operatorId && d.entry_date.startsWith(String(year)))
  const money=(kind:string)=>extra.filter(e=>e.entry_type===kind).reduce((t,e)=>t+e.minutes,0)
  return {
    planned:own.filter(d=>d.state==='SHIFT').reduce((t,d)=>t+(d.planned_minutes??0),0),
    worked:own.filter(d=>d.actual_confirmed).reduce((t,d)=>t+(d.actual_minutes??0),0),
    shiftsConfirmed:own.filter(d=>d.actual_confirmed).length,
    vacation:own.filter(d=>d.state==='VACATION').length,
    vacationPrevious:own.filter(d=>d.state==='VACATION_PREVIOUS').length,
    sick:own.filter(d=>d.state==='MEDICAL_LEAVE').length,
    sickDocumented:own.filter(d=>d.state==='MEDICAL_LEAVE' && d.justification==='DOCUMENTED').length,
    sickUnknown:own.filter(d=>d.state==='MEDICAL_LEAVE' && d.justification!=='DOCUMENTED').length,
    earned:money('EARNED')+money('ADJUSTMENT_PLUS'),
    compensated:money('REST_TAKEN'),
    paid:money('PAID'),
    adjustedMinus:money('ADJUSTMENT_MINUS'),
  }
}
export default function StaffSchedulePage() {
  const navigate=useNavigate()
  const {hotel,isPlatformAdmin}=useHotelScope()
  const {session}=useAuth()
  const [year,setYear]=useState(new Date().getFullYear())
  const [weekStart,setWeekStart]=useState(mondayOf(dateISO(new Date())))
  const [tab,setTab]=useState<PageTab>('CUADRANTE')
  const [allowed,setAllowed]=useState(false)
  const [checking,setChecking]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [operators,setOperators]=useState<StaffOperator[]>([])
  const [days,setDays]=useState<StaffDay[]>([])
  const [overtime,setOvertime]=useState<StaffOvertime[]>([])
  const [vacations,setVacations]=useState<StaffVacation[]>([])
  const [notes,setNotes]=useState<StaffNote[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [dayEditor,setDayEditor]=useState<DayEditor|null>(null)
  const [showOperatorForm,setShowOperatorForm]=useState(false)
  const [name,setName]=useState('')
  const [weeklyHours,setWeeklyHours]=useState('40')
  const [rotation,setRotation]=useState<'NORMAL'|'EXCEPTIONAL'|'NONE'>('NORMAL')
  const [userId,setUserId]=useState('')
  const [overtimeDate,setOvertimeDate]=useState(dateISO(new Date()))
  const [overtimeType,setOvertimeType]=useState('EARNED')
  const [overtimeHours,setOvertimeHours]=useState('')
  const [overtimeReason,setOvertimeReason]=useState('')
  const [entitled,setEntitled]=useState('')
  const [carry,setCarry]=useState('0')
  const [adjust,setAdjust]=useState('0')
  const [privateNote,setPrivateNote]=useState('')

  useEffect(()=>{
    let mounted=true
    if(!hotel?.id){setAllowed(false);setChecking(false);return}
    setChecking(true)
    void supabase.rpc('has_hotel_permission',{target_hotel_id:hotel.id,permission_code:'maintenance.configure'})
      .then(({data,error:checkError})=>{
        if(!mounted)return
        setAllowed(isPlatformAdmin || (!checkError && data===true))
        setChecking(false)
      })
    return ()=>{mounted=false}
  },[hotel?.id,isPlatformAdmin])

  async function reload(){
    if(!hotel?.id||!allowed)return
    setBusy(true);setError('')
    const [people,entries,extras,years,privateNotes]=await Promise.all([
      supabase.from('staff_operators').select('*').eq('hotel_id',hotel.id).order('display_name'),
      supabase.from('staff_schedule_entries').select('*').eq('hotel_id',hotel.id)
        .gte('work_date',String(year-1)+'-12-25').lte('work_date',String(year+1)+'-01-10')
        .order('work_date'),
      supabase.from('staff_overtime_ledger').select('*').eq('hotel_id',hotel.id)
        .gte('entry_date',String(year)+'-01-01').lte('entry_date',String(year)+'-12-31').order('entry_date',{ascending:false}),
      supabase.from('staff_vacation_years').select('*').eq('hotel_id',hotel.id).eq('year',year),
      supabase.from('staff_private_notes').select('*').eq('hotel_id',hotel.id),
    ])
    const failure=people.error||entries.error||extras.error||years.error||privateNotes.error
    if(failure){setError(failure.message);setBusy(false);return}
    const loaded=people.data as StaffOperator[]
    setOperators(loaded);setDays(entries.data as StaffDay[]);setOvertime(extras.data as StaffOvertime[])
    setVacations(years.data as StaffVacation[]);setNotes(privateNotes.data as StaffNote[])
    setSelectedId(prev=>loaded.some(p=>p.id===prev)?prev:(loaded[0]?.id??''))
    setBusy(false)
  }
  useEffect(()=>{void reload()},[hotel?.id,allowed,year])
  const selected=operators.find(p=>p.id===selectedId)??null
  const selectedVacation=vacations.find(v=>v.operator_id===selectedId)??null
  const summary=useMemo(()=>operators.map(o=>({
    operator:o,...operatorTotals(days,overtime,o.id,year),...getWeekendSummary(days,o.id,year)
  })),[operators,days,overtime,year])
  const selectedSummary=summary.find(s=>s.operator.id===selectedId)??null
  const byDay=useMemo(()=>new Map(days.map(d=>[d.operator_id+'|'+d.work_date,d])),[days])
  const dates=Array.from({length:7},(_,i)=>addDays(weekStart,i))
  const yearVacationDays=selectedSummary?.vacation??0

  useEffect(()=>{
    const record=vacations.find(v=>v.operator_id===selectedId)
    setEntitled(record?.entitlement_days==null?'':String(record.entitlement_days))
    setCarry(String(record?.carryover_days??0))
    setAdjust(String(record?.adjustment_days??0))
    setPrivateNote(notes.find(n=>n.operator_id===selectedId)?.content??'')
  },[selectedId,vacations,notes])

  function openDay(operatorId:string,workDate:string){
    const row=byDay.get(operatorId+'|'+workDate)
    setDayEditor({
      operator_id:operatorId,work_date:workDate,state:row?.state??'SHIFT',
      start_time:row?.start_time?.slice(0,5)??'08:00',end_time:row?.end_time?.slice(0,5)??'16:00',
      actual_hours:row?.actual_minutes==null?'':String(row.actual_minutes/60),
      actual_confirmed:row?.actual_confirmed??false,justification:row?.justification??'UNKNOWN'
    })
  }
  async function saveDay(){
    if(!dayEditor||!hotel?.id)return
    const isShift=dayEditor.state==='SHIFT'
    const minutes=isShift?minutesInShift(dayEditor.start_time,dayEditor.end_time):null
    const actual=dayEditor.actual_hours.trim()===''?null:Math.round(Number(dayEditor.actual_hours)*60)
    if((isShift && !minutes)|| (actual!==null && (!Number.isFinite(actual)||actual<0||actual>1440))){
      setError('Revisa las horas de entrada, salida o las horas efectivas.');return
    }
    setBusy(true);setError('')
    const existing=byDay.get(dayEditor.operator_id+'|'+dayEditor.work_date)
    const result=await supabase.from('staff_schedule_entries').upsert({
      hotel_id:hotel.id,operator_id:dayEditor.operator_id,work_date:dayEditor.work_date,
      state:dayEditor.state,start_time:isShift?dayEditor.start_time:null,end_time:isShift?dayEditor.end_time:null,
      planned_minutes:minutes,actual_minutes:actual,
      actual_confirmed:actual!==null&&dayEditor.actual_confirmed,
      justification:dayEditor.justification,
      source_kind:'MANUAL',source_code:existing?.source_code??null,
      changed_by:session?.user.id??null,updated_at:new Date().toISOString(),
    },{onConflict:'operator_id,work_date'})
    if(result.error)setError(result.error.message)
    else{setDayEditor(null);setSuccess('Jornada guardada.');await reload()}
    setBusy(false)
  }
  function editOperator(operator:StaffOperator|null) {
    setSelectedId(operator?.id??selectedId)
    setName(operator?.display_name??'')
    setWeeklyHours(operator?.weekly_target_minutes==null?'':String(operator.weekly_target_minutes/60))
    setRotation(operator?.rotation_type??'NORMAL')
    setUserId(operator?.linked_user_id??'')
    setShowOperatorForm(true)
  }
  async function saveOperator(){
    if(!hotel?.id||!name.trim())return
    if(userId.trim()&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId.trim())){
      setError('El identificador de cuenta debe tener formato UUID.');return
    }
    const minutes=weeklyHours.trim()===''?null:Math.round(Number(weeklyHours)*60)
    if(minutes!==null&&(!Number.isFinite(minutes)||minutes<0||minutes>6000)){setError('Jornada semanal no válida.');return}
    setBusy(true);setError('')
    const payload={hotel_id:hotel.id,display_name:name.trim(),
      weekly_target_minutes:minutes,rotation_type:rotation,
      linked_user_id:userId.trim()||null,updated_at:new Date().toISOString()}
    const result=selected&&showOperatorForm&&name!==''&&operators.some(p=>p.id===selected.id&&p.display_name===name)
      ?await supabase.from('staff_operators').update(payload).eq('id',selected.id).eq('hotel_id',hotel.id)
      :await supabase.from('staff_operators').insert(payload)
    if(result.error)setError(result.error.message)
    else{setShowOperatorForm(false);setSuccess('Ficha de operario guardada.');await reload()}
    setBusy(false)
  }
  async function changeActive(operator:StaffOperator){
    if(!hotel?.id||!window.confirm((operator.active?'Desactivar':'Reactivar')+' a '+operator.display_name+'? Se conservará su historial.'))return
    setBusy(true)
    const result=await supabase.from('staff_operators').update({active:!operator.active,updated_at:new Date().toISOString()})
      .eq('id',operator.id).eq('hotel_id',hotel.id)
    if(result.error)setError(result.error.message);else await reload()
    setBusy(false)
  }
  async function saveVacation(){
    if(!hotel?.id||!selectedId)return
    const e=entitled.trim()===''?null:Number(entitled)
    if((e!==null&&(!Number.isInteger(e)||e<0||e>366))||![Number(carry),Number(adjust)].every(Number.isInteger)){
      setError('Revisa los días de vacaciones.');return
    }
    setBusy(true);setError('')
    const result=await supabase.from('staff_vacation_years').upsert({
      hotel_id:hotel.id,operator_id:selectedId,year,entitlement_days:e,
      carryover_days:Number(carry),adjustment_days:Number(adjust),
      changed_by:session?.user.id??null,updated_at:new Date().toISOString(),
    },{onConflict:'operator_id,year'})
    if(result.error)setError(result.error.message);else{setSuccess('Saldo anual guardado.');await reload()}
    setBusy(false)
  }
  async function saveNote(){
    if(!hotel?.id||!selectedId)return
    setBusy(true);setError('')
    const result=await supabase.from('staff_private_notes').upsert({
      hotel_id:hotel.id,operator_id:selectedId,content:privateNote,
      changed_by:session?.user.id??null,updated_at:new Date().toISOString(),
    },{onConflict:'operator_id'})
    if(result.error)setError(result.error.message);else{setSuccess('Observación privada guardada.');await reload()}
    setBusy(false)
  }
  async function saveOvertime(){
    if(!hotel?.id||!selectedId)return
    const minutes=Math.round(Number(overtimeHours)*60)
    if(!overtimeReason.trim()||!Number.isFinite(minutes)||minutes<=0||minutes>14400){
      setError('Indica un motivo y una duración de horas válida.');return
    }
    setBusy(true);setError('')
    const result=await supabase.from('staff_overtime_ledger').insert({
      hotel_id:hotel.id,operator_id:selectedId,entry_date:overtimeDate,
      entry_type:overtimeType,minutes,reason:overtimeReason.trim(),
      confirmed:true,changed_by:session?.user.id??null,
    })
    if(result.error)setError(result.error.message)
    else{setOvertimeHours('');setOvertimeReason('');setSuccess('Movimiento de horas registrado.');await reload()}
    setBusy(false)
  }
  if(checking)return <main className="p-8 text-slate-600">Comprobando permisos del planificador…</main>
  if(!allowed)return <main className="mx-auto max-w-xl p-8"><h1 className="text-xl font-bold">Planificador horario</h1><p className="mt-3 text-slate-600">La gestión de horarios y las observaciones del personal están reservadas a responsables autorizados.</p><button onClick={()=>navigate('/')} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white">Volver</button></main>
  return <main className="min-h-screen bg-slate-100 p-3 text-slate-900 sm:p-6 print:bg-white">
    <div className="mx-auto max-w-[1550px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div><h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl"><CalendarDays size={25}/> Planificador horario</h1>
          <p className="mt-1 text-sm text-slate-500">{hotel?.name} · Cuadrante, operarios, jornada, vacaciones y compensaciones</p></div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>navigate('/')}>Inicio</button>
          <button className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm" onClick={()=>void reload()} disabled={busy}><RefreshCw size={15}/> Actualizar</button>
          <button className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm" onClick={()=>window.print()}><Printer size={15}/> Imprimir</button>
        </div>
      </header>
      {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {success&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" onClick={()=>setSuccess('')}>{success}</div>}
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">Año
            <select value={year} onChange={e=>{const y=Number(e.target.value);setYear(y);setWeekStart(mondayOf(String(y)+'-01-05'))}} className={baseInput+' mt-1'}>
              {[2025,2026,2027,2028].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="min-w-[170px] text-xs font-semibold text-slate-600">Operario
            <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className={baseInput+' mt-1'}>
              {operators.map(o=><option key={o.id} value={o.id}>{o.display_name}{o.active?'':' · inactivo'}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" onClick={()=>{setSelectedId('');editOperator(null)}}><Plus size={16}/> Operario</button>
          {selected&&<button className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm" onClick={()=>editOperator(selected)}><UserRoundCog size={16}/> Editar ficha</button>}
        </div>
      </section>
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm print:hidden" aria-label="Secciones del planificador">
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium '+(tab===t.id?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100')}>{t.label}</button>)}
      </nav>

      {tab==='CUADRANTE'&&<section className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-bold">Semana {isoWeek(weekStart)}</h2><p className="text-xs text-slate-500">{asDisplayDate(weekStart)} — {asDisplayDate(addDays(weekStart,6))} · Pulsa una casilla para editar</p></div>
          <div className="flex gap-2 print:hidden">
            <button className="rounded-lg border p-2" aria-label="Semana anterior" onClick={()=>setWeekStart(addDays(weekStart,-7))}><ChevronLeft size={18}/></button>
            <button className="rounded-lg border px-3 py-2 text-xs" onClick={()=>setWeekStart(mondayOf(dateISO(new Date())))}>Esta semana</button>
            <button className="rounded-lg border p-2" aria-label="Semana siguiente" onClick={()=>setWeekStart(addDays(weekStart,7))}><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="sticky left-0 bg-slate-50 p-3">Operario</th>
              {dates.map(d=><th key={d} className="p-2 text-center">{fromISO(d).toLocaleDateString('es-ES',{weekday:'short'})}<br/>{asDisplayDate(d).slice(0,5)}</th>)}</tr></thead>
            <tbody>{operators.filter(o=>o.active).map(o=><tr key={o.id} className="border-t">
              <td className="sticky left-0 bg-white p-3 font-semibold">{o.display_name}<div className="text-[10px] font-normal text-slate-400">{o.rotation_type==='EXCEPTIONAL'?'Cobertura excepcional':o.rotation_type==='NONE'?'Sin rotación':'Rotación habitual'}</div></td>
              {dates.map(d=>{const entry=byDay.get(o.id+'|'+d);const state=stateView(entry?.state??'UNASSIGNED');
                return <td key={d} className="p-1">
                  <button className={'min-h-[65px] w-full rounded-lg px-2 py-2 text-center text-xs font-semibold hover:ring-2 hover:ring-sky-400 '+state.tone}
                    onClick={()=>openDay(o.id,d)} title={'Editar '+o.display_name+' · '+asDisplayDate(d)}>
                    <span className="block">{entry?.state==='SHIFT'?(entry.start_time?.slice(0,5)??'—')+'–'+(entry.end_time?.slice(0,5)??'—'):state.label}</span>
                    {entry?.source_kind?.startsWith('EXCEL')&&<span className="mt-1 block text-[10px] font-normal opacity-75">Excel · sin verificar</span>}
                    {entry?.actual_confirmed&&<span className="mt-1 block text-[10px]">✓ Real</span>}
                  </button>
                </td>})}</tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Los horarios importados son planificación histórica, no un registro confirmado de presencia. El color se acompaña siempre de texto.</p>
      </section>}

      {tab==='ANUAL'&&<section className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['Operarios activos',String(operators.filter(o=>o.active).length)],
            ['Jornadas verificadas',String(summary.reduce((v,s)=>v+s.shiftsConfirmed,0))],
            ['Fines de semana previstos',String(summary.reduce((v,s)=>v+s.total,0))],
          ].map(([label,value])=><div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
        </div>
        <div className="overflow-x-auto rounded-2xl bg-white p-3 shadow-sm">
          <table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs"><th className="p-3">Operario</th><th>Turnos previstos</th><th>Horas efectivas verificadas</th><th>Fines de semana programados</th><th>Vacaciones previstas</th><th>Días de baja registrados</th><th>Saldo horas extra</th></tr></thead><tbody>
            {summary.map(s=><tr key={s.operator.id} className="border-b"><td className="p-3 font-semibold">{s.operator.display_name}</td>
              <td>{hours(s.planned)}</td><td>{hours(s.worked)}</td><td>{s.total}</td><td>{s.vacation} d</td><td>{s.sick} d</td><td>{hours(s.earned-s.compensated-s.paid-s.adjustedMinus)}</td></tr>)}
          </tbody></table>
          <p className="mt-2 text-xs text-slate-500">Las horas de los turnos se calculan entre entrada y salida, sin descontar pausas no identificadas. No equivalen automáticamente a horas efectivas.</p>
        </div>
      </section>}

      {tab==='FINES'&&<section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Historial de fines de semana · {year}</h2>
        <p className="mt-1 text-sm text-slate-500">Total por operario y detalle de semanas concretas, sin limitarse al último fin de semana.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(s=><div key={s.operator.id} className="rounded-xl border p-3">
          <p className="font-semibold">{s.operator.display_name}</p><p className="mt-1 text-2xl font-bold">{num(s.total)} <span className="text-sm font-normal text-slate-500">semanas</span></p>
          <p className="text-xs text-slate-500">{s.full} completos · {s.verified} con presencia verificada</p>
          <p className="mt-1 text-xs text-slate-500">{s.operator.rotation_type==='EXCEPTIONAL'?'Cobertura excepcional':s.operator.rotation_type==='NONE'?'Fuera de rotación':'Rotación habitual'}</p>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">{s.weeks.map(([m,w])=><p key={m} className="rounded bg-slate-50 px-2 py-1 text-xs">Semana {isoWeek(m)} · {asDisplayDate(m)} · {w.saturday?'Sáb':''}{w.saturday&&w.sunday?' + ':''}{w.sunday?'Dom':''}{w.confirmed?' ✓ verificado':' · previsto'}</p>)}</div>
        </div>)}</div>
      </section>}

      {tab==='EXTRAS'&&<section className="space-y-4">
        {selected&&<div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">Horas extra y compensaciones · {selected.display_name}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[['Generadas',selectedSummary?.earned??0],['Disfrutadas',selectedSummary?.compensated??0],['Pagadas',selectedSummary?.paid??0],['Saldo', (selectedSummary?.earned??0)-(selectedSummary?.compensated??0)-(selectedSummary?.paid??0)-(selectedSummary?.adjustedMinus??0)]].map(([n,v])=><div key={n} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{n}</p><p className="mt-1 text-lg font-bold">{hours(Number(v))}</p></div>)}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[180px_170px_120px_1fr_auto]">
            <label className="text-xs">Fecha<input type="date" className={baseInput+' mt-1'} value={overtimeDate} onChange={e=>setOvertimeDate(e.target.value)}/></label>
            <label className="text-xs">Movimiento<select className={baseInput+' mt-1'} value={overtimeType} onChange={e=>setOvertimeType(e.target.value)}>
              <option value="EARNED">Horas generadas</option><option value="REST_TAKEN">Descanso disfrutado</option><option value="PAID">Abonadas</option><option value="ADJUSTMENT_PLUS">Ajuste positivo</option><option value="ADJUSTMENT_MINUS">Ajuste negativo</option>
            </select></label>
            <label className="text-xs">Horas<input type="number" min="0.01" step="0.25" className={baseInput+' mt-1'} value={overtimeHours} onChange={e=>setOvertimeHours(e.target.value)} placeholder="2,5"/></label>
            <label className="text-xs">Motivo obligatorio<input className={baseInput+' mt-1'} value={overtimeReason} onChange={e=>setOvertimeReason(e.target.value)} placeholder="Urgencia, sustitución, descanso de horas del día…"/></label>
            <button disabled={busy} onClick={()=>void saveOvertime()} className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Registrar</button>
          </div>
          <div className="mt-4 max-h-[370px] overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b bg-slate-50"><th className="p-2">Fecha</th><th>Tipo</th><th>Duración</th><th>Motivo</th></tr></thead><tbody>
            {overtime.filter(e=>e.operator_id===selectedId).map(e=><tr key={e.id} className="border-b"><td className="p-2">{asDisplayDate(e.entry_date)}</td><td>{({EARNED:'Generadas',REST_TAKEN:'Disfrutadas',PAID:'Abonadas',ADJUSTMENT_PLUS:'Ajuste +',ADJUSTMENT_MINUS:'Ajuste −'} as Record<string,string>)[e.entry_type]}</td><td>{hours(e.minutes)}</td><td>{e.reason}</td></tr>)}
          </tbody></table></div>
        </div>}
      </section>}

      {tab==='VACACIONES'&&<section className="space-y-4">
        <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">Vacaciones · control anual {year}</h2>
          <table className="mt-3 w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-2">Operario</th><th>Derecho configurado</th><th>Previstas en cuadrante</th><th>Año anterior</th><th>Saldo provisional</th></tr></thead><tbody>{summary.map(s=>{
            const v=vacations.find(t=>t.operator_id===s.operator.id);const balance=v?.entitlement_days==null?'Sin configurar':String(v.entitlement_days+v.carryover_days+v.adjustment_days-s.vacation)
            return <tr key={s.operator.id} className="border-b"><td className="p-2 font-semibold">{s.operator.display_name}</td><td>{v?.entitlement_days==null?'—':v.entitlement_days+' d'}</td><td>{s.vacation} d</td><td>{s.vacationPrevious} d</td><td>{balance}</td></tr>
          })}</tbody></table>
          <p className="mt-3 text-xs text-slate-500">Los días importados del Excel son previstos, no se certifican como disfrutados. El derecho legal anual y las compensaciones requieren configuración expresa.</p>
        </div>
        {selected&&<div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="font-bold">Configuración de vacaciones de {selected.display_name}</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs">Derecho anual (días naturales)<input type="number" min="0" max="366" className={baseInput+' mt-1 w-40'} value={entitled} onChange={e=>setEntitled(e.target.value)} placeholder="Sin configurar"/></label>
            <label className="text-xs">Pendientes anteriores<input type="number" className={baseInput+' mt-1 w-36'} value={carry} onChange={e=>setCarry(e.target.value)}/></label>
            <label className="text-xs">Ajuste (+ / −)<input type="number" className={baseInput+' mt-1 w-32'} value={adjust} onChange={e=>setAdjust(e.target.value)}/></label>
            <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={()=>void saveVacation()}>Guardar saldo</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Observación: los 30 días del Excel no se trasladan como derecho contractual automáticamente.</p>
          <div className="mt-4 flex flex-wrap gap-2">{days.filter(d=>d.operator_id===selectedId&&d.work_date.startsWith(String(year))&&['VACATION','VACATION_PREVIOUS'].includes(d.state)).map(d=><span key={d.id} className="rounded-lg bg-sky-100 px-2 py-1 text-xs text-sky-900">{asDisplayDate(d.work_date)}{d.state==='VACATION_PREVIOUS'?' · ant.':''}</span>)}</div>
        </div>}
      </section>}

      {tab==='AUSENCIAS'&&<section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">Bajas y ausencias · {year}</h2>
        <p className="mt-1 text-sm text-slate-500">Justificación documental, fechas y días registrados. No se guardan diagnósticos.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-2">Operario</th><th>Fecha</th><th>Estado</th><th>Justificación</th><th>Edición</th></tr></thead><tbody>
          {days.filter(d=>d.work_date.startsWith(String(year))&&['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state)).map(d=><tr key={d.id} className="border-b"><td className="p-2">{operators.find(o=>o.id===d.operator_id)?.display_name}</td><td>{asDisplayDate(d.work_date)}</td><td>{stateView(d.state).label}</td><td>{({UNKNOWN:'Sin verificar',PENDING:'Pendiente',DOCUMENTED:'Documentada',UNJUSTIFIED:'No justificada'} as Record<string,string>)[d.justification]??'Sin dato'}</td><td><button className="rounded border px-2 py-1 text-xs" onClick={()=>openDay(d.operator_id,d.work_date)}>Revisar</button></td></tr>)}
        </tbody></table></div>
      </section>}

      {tab==='NOTAS'&&<section className="max-w-3xl rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">Observaciones privadas de {selected?.display_name??'operario'}</h2>
        <p className="mt-1 text-sm text-slate-500">Exclusivas de responsables autorizados. Nunca aparecen en la vista del operario.</p>
        <textarea value={privateNote} onChange={e=>setPrivateNote(e.target.value)} rows={8} className={baseInput+' mt-4'} placeholder="Observaciones administrativas y organizativas, sin diagnósticos ni información médica innecesaria."/>
        <button disabled={busy||!selected} onClick={()=>void saveNote()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Guardar observaciones</button>
      </section>}

      {showOperatorForm&&<div role="presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setShowOperatorForm(false)}}>
        <section role="dialog" aria-modal="true" aria-label="Editar operario" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="text-lg font-bold">Ficha del operario</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium">Nombre del operario<input className={baseInput+' mt-1'} value={name} onChange={e=>setName(e.target.value)}/></label>
            <label className="block text-xs font-medium">Jornada objetivo semanal (horas)<input type="number" min="0" max="100" step="0.25" className={baseInput+' mt-1'} value={weeklyHours} onChange={e=>setWeeklyHours(e.target.value)}/></label>
            <label className="block text-xs font-medium">Participación en fines de semana<select className={baseInput+' mt-1'} value={rotation} onChange={e=>setRotation(e.target.value as typeof rotation)}>
              <option value="NORMAL">Rotación habitual</option><option value="EXCEPTIONAL">Cobertura excepcional</option><option value="NONE">Fuera de rotación</option></select></label>
            <label className="block text-xs font-medium">ID de cuenta Arias Suite (opcional)<input className={baseInput+' mt-1'} value={userId} onChange={e=>setUserId(e.target.value)} placeholder="UUID · para acceso personal"/></label>
            <p className="text-xs text-slate-500">La ficha de operario es independiente de su cuenta. Si se vincula una cuenta, su titular podrá entrar en «Mi horario» y ver solo sus propios datos. La vinculación se validará con permisos de base de datos.</p>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            {selected&&<button disabled={busy} onClick={()=>void changeActive(selected)} className="rounded-lg border border-orange-300 px-3 py-2 text-xs text-orange-800">{selected.active?'Desactivar (conservar historial)':'Reactivar'}</button>}
            <div className="ml-auto flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setShowOperatorForm(false)}>Cancelar</button><button disabled={busy||!name.trim()} onClick={()=>void saveOperator()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Guardar</button></div>
          </div>
        </section>
      </div>}
      {dayEditor&&<div role="presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setDayEditor(null)}}>
        <section role="dialog" aria-modal="true" aria-label="Editar jornada" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="font-bold">Editar jornada · {asDisplayDate(dayEditor.work_date)}</h2>
          <p className="mt-1 text-sm text-slate-500">{operators.find(o=>o.id===dayEditor.operator_id)?.display_name}</p>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium">Estado<select className={baseInput+' mt-1'} value={dayEditor.state} onChange={e=>setDayEditor({...dayEditor,state:e.target.value})}>{staffStateOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            {dayEditor.state==='SHIFT'&&<div className="grid grid-cols-2 gap-3">
              <label className="text-xs">Entrada<input type="time" className={baseInput+' mt-1'} value={dayEditor.start_time} onChange={e=>setDayEditor({...dayEditor,start_time:e.target.value})}/></label>
              <label className="text-xs">Salida<input type="time" className={baseInput+' mt-1'} value={dayEditor.end_time} onChange={e=>setDayEditor({...dayEditor,end_time:e.target.value})}/></label>
            </div>}
            <label className="block text-xs">Horas efectivamente verificadas<input type="number" min="0" max="24" step="0.25" className={baseInput+' mt-1'} value={dayEditor.actual_hours} onChange={e=>setDayEditor({...dayEditor,actual_hours:e.target.value})} placeholder="No verificadas"/></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dayEditor.actual_confirmed} onChange={e=>setDayEditor({...dayEditor,actual_confirmed:e.target.checked})}/> Confirmar horas realmente trabajadas</label>
            {['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERMISSION'].includes(dayEditor.state)&&
              <label className="block text-xs">Justificación<select className={baseInput+' mt-1'} value={dayEditor.justification} onChange={e=>setDayEditor({...dayEditor,justification:e.target.value})}>
                <option value="UNKNOWN">Sin verificar</option><option value="PENDING">Pendiente</option><option value="DOCUMENTED">Documentada</option><option value="UNJUSTIFIED">No justificada</option></select></label>}
          </div>
          <div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setDayEditor(null)}>Cancelar</button><button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={()=>void saveDay()}>Guardar jornada</button></div>
        </section>
      </div>}
    </div>
  </main>
}
