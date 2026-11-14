import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Printer, RefreshCw, UserRoundCog } from 'lucide-react'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useAuth } from '../../auth/context/AuthProvider'
import { supabase } from '../../../lib/supabase'
import {
  addDays, dateISO, fromISO, hours, isoWeek, minutesInShift, mondayOf, staffStateOptions,
  stateView, weekendHistory, type StaffDay, type StaffNote, type StaffOperator,
  type StaffOvertime, type StaffVacation,
} from '../staffModel'
import { groupConsecutiveDays, loadAllStaffDays } from '../staffData'

type PageTab = 'CUADRANTE' | 'ANUAL' | 'FINES' | 'EXTRAS' | 'VACACIONES' | 'AUSENCIAS' | 'NOTAS'
type DayEditor = {
  operator_id:string; work_date:string; state:string; start_time:string; end_time:string;
  actual_hours:string; actual_confirmed:boolean; justification:string;
}
const tabs: Array<{id:PageTab;label:string;mobile:string}> = [
  {id:'CUADRANTE',label:'Cuadrante',mobile:'Turnos'}, {id:'ANUAL',label:'Resumen anual',mobile:'Resumen'},
  {id:'FINES',label:'Fines de semana',mobile:'F. semana'}, {id:'EXTRAS',label:'Horas extra',mobile:'Horas'},
  {id:'VACACIONES',label:'Vacaciones',mobile:'Vacac.'}, {id:'AUSENCIAS',label:'Bajas y ausencias',mobile:'Bajas'},
  {id:'NOTAS',label:'Observaciones privadas',mobile:'Notas'},
]
const baseInput='w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-sky-600 sm:px-3 sm:py-2'
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
    cumulativeBalance:overtime.filter(e=>e.operator_id===operatorId)
      .reduce((total,e)=>total+(e.entry_type==='EARNED'||e.entry_type==='ADJUSTMENT_PLUS'?e.minutes:-e.minutes),0),
  }
}
export default function StaffSchedulePage() {
  const navigate=useNavigate()
  const {hotel,isPlatformAdmin}=useHotelScope()
  const {session}=useAuth()
  const [year,setYear]=useState(new Date().getFullYear())
  const [weekStart,setWeekStart]=useState(mondayOf(dateISO(new Date())))
  const [tab,setTab]=useState<PageTab>('CUADRANTE')
  const [mobileDayIndex,setMobileDayIndex]=useState((new Date().getDay()+6)%7)
  const [showOvertimeForm,setShowOvertimeForm]=useState(false)
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
  const [editingOperatorId,setEditingOperatorId]=useState<string|null>(null)
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
      loadAllStaffDays({
        hotelId:hotel.id,
        startDate:String(year-1)+'-12-25',
        endDate:String(year+1)+'-01-10',
      }),
      supabase.from('staff_overtime_ledger').select('*').eq('hotel_id',hotel.id)
        .lte('entry_date',String(year)+'-12-31').order('entry_date',{ascending:false}),
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
  const summary=useMemo(()=>operators.map(o=>({
    operator:o,...operatorTotals(days,overtime,o.id,year),...getWeekendSummary(days,o.id,year)
  })),[operators,days,overtime,year])
  const selectedSummary=summary.find(s=>s.operator.id===selectedId)??null
  const byDay=useMemo(()=>new Map(days.map(d=>[d.operator_id+'|'+d.work_date,d])),[days])
  const dates=Array.from({length:7},(_,i)=>addDays(weekStart,i))
  const selectedVacationDays=days.filter(d=>d.operator_id===selectedId && d.work_date.startsWith(String(year))
    && (d.state==='VACATION'||d.state==='VACATION_PREVIOUS'))
  const selectedVacationPeriods=groupConsecutiveDays(selectedVacationDays)
  const selectedMedicalDays=days.filter(d=>d.operator_id===selectedId && d.work_date.startsWith(String(year))
    && d.state==='MEDICAL_LEAVE')
  const selectedMedicalPeriods=groupConsecutiveDays(selectedMedicalDays)
  const selectedOtherAbsences=days.filter(d=>d.operator_id===selectedId && d.work_date.startsWith(String(year))
    && ['UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state))
  const selectedOtherAbsencePeriods=groupConsecutiveDays(selectedOtherAbsences)


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
    setEditingOperatorId(operator?.id??null)
    if(operator) setSelectedId(operator.id)
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
    const result=editingOperatorId
      ?await supabase.from('staff_operators').update(payload).eq('id',editingOperatorId).eq('hotel_id',hotel.id)
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
  return <main className="min-h-screen bg-slate-100 p-1.5 text-slate-900 sm:p-4 lg:p-6 print:bg-white">
    <div className="mx-auto max-w-[1550px] space-y-2 sm:space-y-4">
      <header className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 shadow-sm sm:rounded-2xl sm:p-4">
        <div className="min-w-0"><h1 className="flex items-center gap-1.5 text-base font-bold sm:gap-2 sm:text-2xl"><CalendarDays size={19} className="shrink-0 sm:h-6 sm:w-6"/> <span className="truncate">Planificador horario</span></h1>
          <p className="mt-1 hidden truncate text-xs text-slate-500 sm:block">{hotel?.name}</p></div>
        <div className="flex shrink-0 gap-1 print:hidden sm:gap-2">
          <button aria-label="Inicio" title="Inicio" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs sm:px-3" onClick={()=>navigate('/')}><span className="sm:hidden">⌂</span><span className="hidden sm:inline">Inicio</span></button>
          <button aria-label="Actualizar" title="Actualizar" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border" onClick={()=>void reload()} disabled={busy}><RefreshCw size={16}/></button>
          <button aria-label="Imprimir" title="Imprimir" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border" onClick={()=>window.print()}><Printer size={16}/></button>
        </div>
      </header>
      {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {success&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" onClick={()=>setSuccess('')}>{success}</div>}
      <section className="flex items-end gap-1.5 rounded-xl bg-white p-2 shadow-sm sm:flex-wrap sm:gap-3 sm:rounded-2xl sm:p-4">
        <label className="w-[76px] shrink-0 text-[10px] font-semibold text-slate-600 sm:w-24 sm:text-xs">Año
          <select value={year} onChange={e=>{const y=Number(e.target.value);setYear(y);setWeekStart(mondayOf(String(y)+'-01-05'))}} className={baseInput+' mt-0.5 sm:mt-1'}>
            {[2025,2026,2027,2028].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-1 text-[10px] font-semibold text-slate-600 sm:max-w-xs sm:text-xs">Operario
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className={baseInput+' mt-0.5 sm:mt-1'}>
            {operators.map(o=><option key={o.id} value={o.id}>{o.display_name}{o.active?'':' · inactivo'}</option>)}
          </select>
        </label>
        <div className="flex shrink-0 gap-1 print:hidden sm:ml-auto sm:gap-2">
          <button aria-label="Añadir operario" title="Añadir operario" className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-sm font-semibold text-white sm:px-3" onClick={()=>{setSelectedId('');editOperator(null)}}><Plus size={17}/><span className="hidden sm:inline">Operario</span></button>
          {selected&&<button aria-label="Editar ficha" title="Editar ficha" className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm sm:px-3" onClick={()=>editOperator(selected)}><UserRoundCog size={17}/><span className="hidden sm:inline">Editar ficha</span></button>}
        </div>
      </section>
      <nav className="flex gap-0.5 overflow-x-auto rounded-xl bg-white p-1 shadow-sm print:hidden" aria-label="Secciones del planificador">
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} title={t.label} aria-current={tab===t.id?'page':undefined} className={'min-h-9 shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm '+(tab===t.id?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100')}><span className="sm:hidden">{t.mobile}</span><span className="hidden sm:inline">{t.label}</span></button>)}
      </nav>

      {tab==='CUADRANTE'&&<section className="rounded-xl bg-white p-2 shadow-sm sm:rounded-2xl sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="text-sm font-bold sm:text-base">Semana {isoWeek(weekStart)} <span className="font-normal text-slate-500">· {asDisplayDate(weekStart).slice(0,5)}–{asDisplayDate(addDays(weekStart,6)).slice(0,5)}</span></h2></div>
          <div className="flex shrink-0 gap-1 print:hidden sm:gap-2">
            <input type="date" aria-label="Ir a una fecha" title="Ir a una fecha" value={weekStart}
              className="min-h-9 max-w-[120px] rounded-lg border bg-white px-1 text-[11px] sm:max-w-none sm:px-2 sm:text-xs"
              onChange={e=>{if(e.target.value){setWeekStart(mondayOf(e.target.value));setYear(Number(e.target.value.slice(0,4)))}}}/>
            <button className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border" aria-label="Semana anterior" onClick={()=>setWeekStart(addDays(weekStart,-7))}><ChevronLeft size={17}/></button>
            <button className="min-h-9 rounded-lg border px-2 text-xs" onClick={()=>{setWeekStart(mondayOf(dateISO(new Date())));setMobileDayIndex((new Date().getDay()+6)%7)}}>Hoy</button>
            <button className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border" aria-label="Semana siguiente" onClick={()=>setWeekStart(addDays(weekStart,7))}><ChevronRight size={17}/></button>
          </div>
        </div>
        <div className="md:hidden">
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Elegir día de la semana">
            {dates.map((d,i)=><button key={d} onClick={()=>setMobileDayIndex(i)} aria-pressed={mobileDayIndex===i}
              className={'flex min-h-11 flex-col items-center justify-center rounded-lg text-[11px] leading-tight '+(mobileDayIndex===i?'bg-slate-900 font-bold text-white':'bg-slate-100 text-slate-700')}>
              <span>{['L','M','X','J','V','S','D'][i]}</span><span className="mt-0.5">{fromISO(d).getDate()}</span>
            </button>)}
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            {operators.filter(o=>o.active).map(o=>{
              const d=dates[mobileDayIndex];const entry=byDay.get(o.id+'|'+d);
              const view=stateView(entry?.state??'UNASSIGNED');
              const label=entry?.state==='SHIFT'? (entry.start_time?.slice(0,5)??'—')+'–'+(entry.end_time?.slice(0,5)??'—') :
                entry?.source_code?.startsWith('Festivo/ref.')?'Festivo por revisar':view.label;
              return <button key={o.id} onClick={()=>openDay(o.id,d)} className="flex min-h-12 w-full items-center justify-between gap-2 py-1.5 text-left">
                <span className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold">{o.display_name}</span>
                <span className={'flex min-w-[116px] max-w-[62%] items-center justify-center rounded-md px-2 py-2 text-center text-xs font-semibold '+view.tone}>{label}{entry?.actual_confirmed?' ✓':''}</span>
              </button>
            })}
          </div>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[840px] border-collapse text-xs">
            <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="sticky left-0 bg-slate-50 p-2">Operario</th>
              {dates.map(d=><th key={d} className="p-1 text-center">{fromISO(d).toLocaleDateString('es-ES',{weekday:'short'})}<br/>{asDisplayDate(d).slice(0,5)}</th>)}</tr></thead>
            <tbody>{operators.filter(o=>o.active).map(o=><tr key={o.id} className="border-t">
              <td className="sticky left-0 bg-white p-2 font-semibold">{o.display_name}</td>
              {dates.map(d=>{const entry=byDay.get(o.id+'|'+d);const state=stateView(entry?.state??'UNASSIGNED');
                return <td key={d} className="p-1">
                  <button className={'min-h-10 w-full rounded-md px-1 py-1.5 text-center text-xs font-semibold hover:ring-2 hover:ring-sky-400 '+state.tone}
                    onClick={()=>openDay(o.id,d)} title={'Editar '+o.display_name+' · '+asDisplayDate(d)}>
                    <span className="block">{entry?.state==='SHIFT'?(entry.start_time?.slice(0,5)??'—')+'–'+(entry.end_time?.slice(0,5)??'—'):entry?.source_code?.startsWith('Festivo/ref.')?'Festivo por revisar':state.label}</span>
                    {entry?.actual_confirmed&&<span className="mt-1 block text-[10px]">✓ Real</span>}
                  </button>
                </td>})}</tr>)}</tbody>
          </table>
        </div>
      </section>}

      {tab==='ANUAL'&&<section className="space-y-2 sm:space-y-3">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {[
            ['Operarios activos',String(operators.filter(o=>o.active).length)],
            ['Jornadas verificadas',String(summary.reduce((v,s)=>v+s.shiftsConfirmed,0))],
            ['Fines de semana previstos',String(summary.reduce((v,s)=>v+s.total,0))],
          ].map(([label,value])=><div key={label} className="rounded-xl bg-white p-2 shadow-sm sm:rounded-2xl sm:p-4"><p className="text-[10px] leading-tight text-slate-500 sm:text-xs">{label}</p><p className="mt-0.5 text-lg font-bold sm:mt-1 sm:text-2xl">{value}</p></div>)}
        </div>
        <div className="space-y-1.5 md:hidden">
          {summary.map(s=><div key={s.operator.id} className="rounded-xl bg-white px-3 py-2 shadow-sm">
            <div className="mb-1 text-sm font-bold">{s.operator.display_name}</div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[['Previstas',hours(s.planned)],['Reales',hours(s.worked)],['F. semana',String(s.total)],
              ['Vacaciones',s.vacation+' d'],['Baja',s.sick+' d'],['H. extra',hours(s.cumulativeBalance)]].map(([label,value])=>
                <div key={label} className="rounded-md bg-slate-50 px-1 py-1"><div className="text-[10px] text-slate-500">{label}</div><div className="text-xs font-semibold">{value}</div></div>)}
            </div>
          </div>)}
        </div>
        <div className="hidden overflow-x-auto rounded-2xl bg-white p-3 shadow-sm md:block">
          <table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs"><th className="p-3">Operario</th><th>Turnos previstos</th><th>Horas efectivas verificadas</th><th>Fines de semana programados</th><th>Vacaciones previstas</th><th>Días de baja registrados</th><th>Saldo acumulado de horas extra</th></tr></thead><tbody>
            {summary.map(s=><tr key={s.operator.id} className="border-b"><td className="p-3 font-semibold">{s.operator.display_name}</td>
              <td>{hours(s.planned)}</td><td>{hours(s.worked)}</td><td>{s.total}</td><td>{s.vacation} d</td><td>{s.sick} d</td><td>{hours(s.cumulativeBalance)}</td></tr>)}
          </tbody></table>
        </div>
      </section>}

      {tab==='FINES'&&<section className="rounded-xl bg-white p-2 shadow-sm sm:rounded-2xl sm:p-4">
        <h2 className="mb-2 text-sm font-bold sm:text-lg">Fines de semana · {year}</h2>
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">{summary.map(s=><details key={s.operator.id} className="group rounded-lg border px-3 py-2 sm:rounded-xl sm:p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{s.operator.display_name}</span>
            <span className="shrink-0 text-sm font-bold">{num(s.total)} <span className="text-xs font-normal text-slate-500">sem.</span> <span className="text-slate-400">⌄</span></span>
          </summary>
          <div className="mt-1 text-[11px] text-slate-500">{s.full} completos · {s.verified} verificados</div>
          <div className="mt-1 max-h-56 divide-y overflow-y-auto">{s.weeks.map(([m,w])=><p key={m} className="py-1 text-xs">S{isoWeek(m)} · {asDisplayDate(m)} · {w.saturday?'Sáb':''}{w.saturday&&w.sunday?' + ':''}{w.sunday?'Dom':''}{w.confirmed?' ✓':''}</p>)}</div>
        </details>)}</div>
      </section>}

      {tab==='EXTRAS'&&<section className="space-y-2 sm:space-y-4">
        {selected&&<div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <h2 className="text-sm font-bold sm:text-base">Horas extra · {selected.display_name}</h2>
          <div className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-3 sm:gap-2">
            {[['Generadas',selectedSummary?.earned??0],['Disfrutadas',selectedSummary?.compensated??0],['Pagadas',selectedSummary?.paid??0],['Saldo acumulado', selectedSummary?.cumulativeBalance??0]].map(([n,v])=><div key={n} className="rounded-lg bg-slate-50 px-1 py-2 text-center sm:rounded-xl sm:p-3"><p className="text-[10px] leading-tight text-slate-500 sm:text-xs">{n}</p><p className="mt-0.5 text-xs font-bold sm:mt-1 sm:text-lg">{hours(Number(v))}</p></div>)}
          </div>
          <button className="mt-2 w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold md:hidden" onClick={()=>setShowOvertimeForm(v=>!v)} aria-expanded={showOvertimeForm}>{showOvertimeForm?'Cerrar registro':'＋ Nuevo movimiento'}</button>
          <div className={'mt-2 grid grid-cols-2 gap-2 md:mt-4 md:grid-cols-[180px_170px_120px_1fr_auto] md:gap-3 '+(showOvertimeForm?'':'hidden md:grid')}>
            <label className="text-xs">Fecha<input type="date" className={baseInput+' mt-1'} value={overtimeDate} onChange={e=>setOvertimeDate(e.target.value)}/></label>
            <label className="text-xs">Movimiento<select className={baseInput+' mt-1'} value={overtimeType} onChange={e=>setOvertimeType(e.target.value)}>
              <option value="EARNED">Horas generadas</option><option value="REST_TAKEN">Descanso disfrutado</option><option value="PAID">Abonadas</option><option value="ADJUSTMENT_PLUS">Ajuste positivo</option><option value="ADJUSTMENT_MINUS">Ajuste negativo</option>
            </select></label>
            <label className="text-xs">Horas<input type="number" min="0.01" step="0.25" className={baseInput+' mt-1'} value={overtimeHours} onChange={e=>setOvertimeHours(e.target.value)} placeholder="2,5"/></label>
            <label className="col-span-2 text-xs md:col-span-1">Motivo obligatorio<input className={baseInput+' mt-1'} value={overtimeReason} onChange={e=>setOvertimeReason(e.target.value)} placeholder="Urgencia, sustitución, descanso de horas del día…"/></label>
            <button disabled={busy} onClick={()=>void saveOvertime()} className="col-span-2 min-h-9 self-end rounded-lg bg-slate-900 px-4 py-2 text-sm text-white md:col-span-1">Registrar</button>
          </div>
          <div className="mt-2 max-h-[48vh] overflow-auto sm:mt-4"><table className="w-full text-left text-xs"><thead><tr className="border-b bg-slate-50"><th className="p-1.5 text-left">Fecha</th><th className="text-left">Tipo</th><th>Horas</th><th className="text-left">Motivo</th></tr></thead><tbody>
            {overtime.filter(e=>e.operator_id===selectedId).map(e=><tr key={e.id} className="border-b"><td className="whitespace-nowrap p-1.5">{asDisplayDate(e.entry_date).slice(0,5)}</td><td>{({EARNED:'Generadas',REST_TAKEN:'Disfrutadas',PAID:'Abonadas',ADJUSTMENT_PLUS:'Ajuste +',ADJUSTMENT_MINUS:'Ajuste −'} as Record<string,string>)[e.entry_type]}</td><td>{hours(e.minutes)}</td><td className="max-w-[190px] truncate px-1 text-[11px]" title={e.reason}>{e.reason}</td></tr>)}
          </tbody></table></div>
        </div>}
      </section>}

      {tab==='VACACIONES'&&<section className="space-y-2 sm:space-y-4">
        <div className="overflow-x-auto rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <h2 className="text-sm font-bold sm:text-base">Vacaciones · {year}</h2>
          <div className="mt-2 space-y-1 md:hidden">{summary.map(s=>{
            const v=vacations.find(t=>t.operator_id===s.operator.id);
            const balance=v?.entitlement_days==null?'—':String(v.entitlement_days+v.carryover_days+v.adjustment_days-s.vacation);
            return <div key={s.operator.id} className="grid grid-cols-[minmax(0,1fr)_repeat(3,46px)] items-center gap-2 border-b py-1.5 text-xs">
              <span className="truncate font-semibold">{s.operator.display_name}</span>
              <span title="Derecho" className="text-center">{v?.entitlement_days??'—'}</span>
              <span title="Previstas" className="text-center">{s.vacation}</span>
              <span title="Saldo provisional" className="text-center font-bold">{balance}</span>
            </div>
          })}<p className="text-right text-[10px] text-slate-500">Derecho · Previstas · Saldo</p></div>
          <table className="mt-3 hidden w-full min-w-[640px] text-left text-sm md:table"><thead><tr className="border-b bg-slate-50"><th className="p-2">Operario</th><th>Derecho configurado</th><th>Previstas en cuadrante</th><th>Año anterior</th><th>Saldo provisional</th></tr></thead><tbody>{summary.map(s=>{
            const v=vacations.find(t=>t.operator_id===s.operator.id);const balance=v?.entitlement_days==null?'Sin configurar':String(v.entitlement_days+v.carryover_days+v.adjustment_days-s.vacation)
            return <tr key={s.operator.id} className="border-b"><td className="p-2 font-semibold">{s.operator.display_name}</td><td>{v?.entitlement_days==null?'—':v.entitlement_days+' d'}</td><td>{s.vacation} d</td><td>{s.vacationPrevious} d</td><td>{balance}</td></tr>
          })}</tbody></table>
        </div>
        {selected&&<div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <h3 className="text-sm font-bold sm:text-base">Saldo · {selected.display_name}</h3>
          <div className="mt-2 flex flex-wrap items-end gap-2 sm:mt-3 sm:gap-3">
            <label className="text-xs">Derecho anual (días naturales)<input type="number" min="0" max="366" className={baseInput+' mt-1 w-40'} value={entitled} onChange={e=>setEntitled(e.target.value)} placeholder="Sin configurar"/></label>
            <label className="text-xs">Pendientes anteriores<input type="number" className={baseInput+' mt-1 w-36'} value={carry} onChange={e=>setCarry(e.target.value)}/></label>
            <label className="text-xs">Ajuste (+ / −)<input type="number" className={baseInput+' mt-1 w-32'} value={adjust} onChange={e=>setAdjust(e.target.value)}/></label>
            <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={()=>void saveVacation()}>Guardar saldo</button>
          </div>
          <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Fechas de vacaciones</summary><div className="mt-2 flex flex-wrap gap-1">{days.filter(d=>d.operator_id===selectedId&&d.work_date.startsWith(String(year))&&['VACATION','VACATION_PREVIOUS'].includes(d.state)).map(d=><span key={d.id} className="rounded bg-sky-100 px-1.5 py-1 text-xs text-sky-900">{asDisplayDate(d.work_date).slice(0,5)}{d.state==='VACATION_PREVIOUS'?' · ant.':''}</span>)}</div></details>
        </div>}
      </section>}

      {tab==='AUSENCIAS'&&<section className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
        <h2 className="text-sm font-bold sm:text-base">Bajas y ausencias · {year}</h2>
        <div className="mt-2 space-y-1.5 md:hidden">
          {days.filter(d=>d.work_date.startsWith(String(year))&&['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state)).map(d=>
            <button key={d.id} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 text-left" onClick={()=>openDay(d.operator_id,d.work_date)}>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{operators.find(o=>o.id===d.operator_id)?.display_name}</span>
              <span className="shrink-0 text-[11px]">{asDisplayDate(d.work_date).slice(0,5)}</span>
              <span className="max-w-[42%] truncate text-[11px] text-slate-600">{stateView(d.state).label}</span>
              <span className="shrink-0 text-[10px] font-bold">{d.justification==='DOCUMENTED'?'✓':d.justification==='UNJUSTIFIED'?'!':'·'}</span>
            </button>)}
        </div>
        <div className="mt-3 hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-2">Operario</th><th>Fecha</th><th>Estado</th><th>Justificación</th><th>Edición</th></tr></thead><tbody>
          {days.filter(d=>d.work_date.startsWith(String(year))&&['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state)).map(d=><tr key={d.id} className="border-b"><td className="p-2">{operators.find(o=>o.id===d.operator_id)?.display_name}</td><td>{asDisplayDate(d.work_date)}</td><td>{stateView(d.state).label}</td><td>{({UNKNOWN:'Sin verificar',PENDING:'Pendiente',DOCUMENTED:'Documentada',UNJUSTIFIED:'No justificada'} as Record<string,string>)[d.justification]??'Sin dato'}</td><td><button className="rounded border px-2 py-1 text-xs" onClick={()=>openDay(d.operator_id,d.work_date)}>Revisar</button></td></tr>)}
        </tbody></table></div>
      </section>}

      {tab==='NOTAS'&&<section className="max-w-3xl rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
        <h2 className="text-sm font-bold sm:text-base">Observaciones · {selected?.display_name??'operario'}</h2>
        <textarea value={privateNote} onChange={e=>setPrivateNote(e.target.value)} rows={4} className={baseInput+' mt-2'} placeholder="Observaciones administrativas y organizativas, sin diagnósticos ni información médica innecesaria."/>
        <button disabled={busy||!selected} onClick={()=>void saveNote()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Guardar observaciones</button>
      </section>}

      {showOperatorForm&&<div role="presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-2 sm:p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setShowOperatorForm(false)}}>
        <section role="dialog" aria-modal="true" aria-label="Editar operario" className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-3 shadow-xl sm:rounded-2xl sm:p-5">
          <h2 className="text-lg font-bold">Ficha del operario</h2>
          <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-3">
            <label className="block text-xs font-medium">Nombre del operario<input className={baseInput+' mt-1'} value={name} onChange={e=>setName(e.target.value)}/></label>
            <label className="block text-xs font-medium">Jornada objetivo semanal (horas)<input type="number" min="0" max="100" step="0.25" className={baseInput+' mt-1'} value={weeklyHours} onChange={e=>setWeeklyHours(e.target.value)}/></label>
            <label className="block text-xs font-medium">Participación en fines de semana<select className={baseInput+' mt-1'} value={rotation} onChange={e=>setRotation(e.target.value as typeof rotation)}>
              <option value="NORMAL">Rotación habitual</option><option value="EXCEPTIONAL">Cobertura excepcional</option><option value="NONE">Fuera de rotación</option></select></label>
            <label className="block text-xs font-medium">ID de cuenta Arias Suite (opcional)<input className={baseInput+' mt-1'} value={userId} onChange={e=>setUserId(e.target.value)} placeholder="UUID · para acceso personal"/></label>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            {selected&&<button disabled={busy} onClick={()=>void changeActive(selected)} className="rounded-lg border border-orange-300 px-3 py-2 text-xs text-orange-800">{selected.active?'Desactivar (conservar historial)':'Reactivar'}</button>}
            <div className="ml-auto flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setShowOperatorForm(false)}>Cancelar</button><button disabled={busy||!name.trim()} onClick={()=>void saveOperator()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Guardar</button></div>
          </div>
        </section>
      </div>}
      {dayEditor&&<div role="presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-2 sm:p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setDayEditor(null)}}>
        <section role="dialog" aria-modal="true" aria-label="Editar jornada" className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-3 shadow-xl sm:rounded-2xl sm:p-5">
          <h2 className="font-bold">Editar jornada · {asDisplayDate(dayEditor.work_date)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{operators.find(o=>o.id===dayEditor.operator_id)?.display_name}</p>
          <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-3">
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
          <div className="mt-3 flex justify-end gap-2 sm:mt-5"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setDayEditor(null)}>Cancelar</button><button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={()=>void saveDay()}>Guardar jornada</button></div>
        </section>
      </div>}
    </div>
  </main>
}
