import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { Plus, Printer, RefreshCw, UserRoundCog, Pencil } from 'lucide-react'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useAuth } from '../../auth/context/AuthProvider'
import { supabase } from '../../../lib/supabase'
import {
  dateISO, fromISO, hours, isoWeek, minutesInShift, staffStateOptions,
  stateView, weekendHistory, isVacationState, vacationStage, vacationStageLabel, vacationTone, type VacationStage,
  type StaffDay, type StaffNote, type StaffOperator,
  type StaffOvertime, type StaffVacation,
} from '../staffModel'
import { groupConsecutiveDays, loadAllStaffDays } from '../staffData'
import StaffCalendar from '../StaffCalendar'
import StaffReport from '../StaffReport'
import StaffHoursBatch from '../StaffHoursBatch'

type PageTab = 'CUADRANTE' | 'ANUAL' | 'VERIFICACION' | 'FINES' | 'EXTRAS' | 'VACACIONES' | 'AUSENCIAS' | 'NOTAS' | 'REPORTES'
type VacationFilter = 'ALL' | VacationStage
type DayEditor = {
  operator_id:string; work_date:string; state:string; start_time:string; end_time:string;
  actual_hours:string; actual_confirmed:boolean; justification:string;
  vacation_taken_confirmed:boolean;
}
const tabs: Array<{id:PageTab;label:string;mobile:string}> = [
  {id:'CUADRANTE',label:'Cuadrante',mobile:'Turnos'}, {id:'ANUAL',label:'Resumen anual',mobile:'Resumen'},
  {id:'VERIFICACION',label:'Verificar horas',mobile:'Verificar'},
  {id:'FINES',label:'Fines de semana',mobile:'F. semana'}, {id:'EXTRAS',label:'Horas extra',mobile:'Horas'},
  {id:'VACACIONES',label:'Vacaciones',mobile:'Vacac.'}, {id:'AUSENCIAS',label:'Bajas y ausencias',mobile:'Bajas'},
  {id:'NOTAS',label:'Observaciones privadas',mobile:'Notas'},
  {id:'REPORTES',label:'Reportes y PDF',mobile:'PDF'},
]
const baseInput='w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-sky-600 sm:px-3 sm:py-2'
const num = (v:number)=>v.toLocaleString('es-ES')
function asDisplayDate(iso:string) {return fromISO(iso).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
function normalizeDigitalTime(value: string) {
  const clean = value.trim()
  const digits = clean.replace(/[^0-9]/g, '')
  if (/^\d{3,4}$/.test(digits)) {
    return digits.padStart(4, '0').slice(0, 2) + ':' + digits.padStart(4, '0').slice(2)
  }
  if (/^\d{1,2}:\d{1,2}$/.test(clean)) {
    const [h, m] = clean.split(':')
    return h.padStart(2, '0') + ':' + m.padStart(2, '0')
  }
  return clean
}
function validDigitalTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) }
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
    sickUnjustified:own.filter(d=>d.state==='MEDICAL_LEAVE' && d.justification==='UNJUSTIFIED').length,
    sickUnknown:own.filter(d=>d.state==='MEDICAL_LEAVE' && ['UNKNOWN','PENDING'].includes(d.justification)).length,
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
  const [calendarFilter,setCalendarFilter]=useState('ALL')
  const [vacationOperatorFilter,setVacationOperatorFilter]=useState('ALL')
  const [vacationStatusFilter,setVacationStatusFilter]=useState<VacationFilter>('ALL')
  const [checkedVacationIds,setCheckedVacationIds]=useState<string[]>([])
  const [checkedAbsenceIds,setCheckedAbsenceIds]=useState<string[]>([])
  const [bulkAbsenceStatus,setBulkAbsenceStatus]=useState<'DOCUMENTED'|'PENDING'|'UNJUSTIFIED'|'UNKNOWN'>('DOCUMENTED')
  const [tab,setTab]=useState<PageTab>(()=>new URLSearchParams(window.location.search).get('tab')==='reportes'?'REPORTES':'CUADRANTE')
  const [showOvertimeForm,setShowOvertimeForm]=useState(false)
  const [allowed,setAllowed]=useState(false)
  const [checking,setChecking]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [operators,setOperators]=useState<StaffOperator[]>([])
  const [days,setDays]=useState<StaffDay[]>([])
  const [holidays,setHolidays]=useState<string[]>([])
  const [overtime,setOvertime]=useState<StaffOvertime[]>([])
  const [vacations,setVacations]=useState<StaffVacation[]>([])
  const [notes,setNotes]=useState<StaffNote[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [dayEditor,setDayEditor]=useState<DayEditor|null>(null)
  const [dayEditorError,setDayEditorError]=useState('')
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
    const [people,entries,extras,years,privateNotes,holidayRows]=await Promise.all([
      supabase.from('staff_operators').select('*').eq('hotel_id',hotel.id).order('display_name'),
      loadAllStaffDays({
        hotelId:hotel.id,
        startDate:String(year-1)+'-12-01',
        endDate:String(year+1)+'-01-31',
      }),
      supabase.from('staff_overtime_ledger').select('*').eq('hotel_id',hotel.id)
        .lte('entry_date',String(year)+'-12-31').order('entry_date',{ascending:false}),
      supabase.from('staff_vacation_years').select('*').eq('hotel_id',hotel.id).eq('year',year),
      supabase.from('staff_private_notes').select('*').eq('hotel_id',hotel.id),
      supabase.from('staff_calendar_holidays').select('holiday_date').eq('hotel_id',hotel.id)
        .gte('holiday_date',String(year-1)+'-12-25').lte('holiday_date',String(year+1)+'-01-10'),
    ])
    const failure=people.error||entries.error||extras.error||years.error||privateNotes.error||holidayRows.error
    if(failure){setError(failure.message);setBusy(false);return}
    const loaded=people.data as StaffOperator[]
    setOperators(loaded);setDays(entries.data as StaffDay[]);setOvertime(extras.data as StaffOvertime[])
    setHolidays((holidayRows.data??[]).map(row=>row.holiday_date))
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
  const vacationToday=dateISO(new Date())
  const vacationYearDays=days.filter(d=>d.work_date.startsWith(String(year)) && isVacationState(d.state))
  const vacationPeople=operators.filter(person=>
    (vacationOperatorFilter==='ALL'||vacationOperatorFilter===person.id) &&
    (vacationOperatorFilter!=='ALL'||vacationYearDays.some(d=>d.operator_id===person.id)))
  const vacationScopedDays=vacationYearDays.filter(d=>
    vacationOperatorFilter==='ALL'||d.operator_id===vacationOperatorFilter)
  const vacationCounts={
    ALL:vacationScopedDays.length,
    TAKEN:vacationScopedDays.filter(d=>vacationStage(d,vacationToday)==='TAKEN').length,
    UPCOMING:vacationScopedDays.filter(d=>vacationStage(d,vacationToday)==='UPCOMING').length,
    UNVERIFIED:vacationScopedDays.filter(d=>vacationStage(d,vacationToday)==='UNVERIFIED').length,
  }
  // Include the full continuous period when it crosses December / January.
  // Annual totals count only dates belonging to the selected calendar year.
  const vacationGroups=vacationPeople.map(person=>{
    const annual=vacationYearDays.filter(d=>d.operator_id===person.id)
    const periods=groupConsecutiveDays(days.filter(d=>d.operator_id===person.id &&
      isVacationState(d.state))).filter(period=>period.rows.some(d=>d.work_date.startsWith(String(year))))
    const shown=periods.map(period=>({
      ...period,
      visibleDays:period.rows.filter(d=>vacationStatusFilter==='ALL' ||
        vacationStage(d,vacationToday)===vacationStatusFilter),
    })).filter(period=>period.visibleDays.length>0 &&
      period.visibleDays.some(d=>d.work_date.startsWith(String(year))))
    return {person,annual,shown}
  }).filter(group=>group.shown.length>0)
  const selectedMedicalDays=days.filter(d=>d.operator_id===selectedId && d.work_date.startsWith(String(year))
    && d.state==='MEDICAL_LEAVE')
  const selectedMedicalPeriods=groupConsecutiveDays(selectedMedicalDays)
  const selectedOtherAbsences=days.filter(d=>d.operator_id===selectedId && d.work_date.startsWith(String(year))
    && ['UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state))
  const selectedOtherAbsencePeriods=groupConsecutiveDays(selectedOtherAbsences)
  const absenceSelectableDays=[...selectedMedicalDays,...selectedOtherAbsences]
  const selectedAbsenceRows=absenceSelectableDays.filter(day=>checkedAbsenceIds.includes(day.id))
  const selectableVacationRows=vacationGroups.flatMap(group=>group.shown.flatMap(period=>period.visibleDays))
    .filter(day=>vacationStage(day,vacationToday)==='UNVERIFIED')
  const selectedVacationRows=selectableVacationRows.filter(day=>checkedVacationIds.includes(day.id))

  useEffect(()=>{
    setCheckedVacationIds([])
  },[year,vacationOperatorFilter,vacationStatusFilter,hotel?.id])
  useEffect(()=>{
    setCheckedAbsenceIds([])
  },[year,selectedId,hotel?.id])

  function toggleChecked(id:string,checked:boolean,type:'VACATION'|'ABSENCE'){
    const setter=type==='VACATION'?setCheckedVacationIds:setCheckedAbsenceIds
    setter(prev=>checked?[...new Set([...prev,id])]:prev.filter(v=>v!==id))
  }
  function togglePeriodSelection(rows:StaffDay[],type:'VACATION'|'ABSENCE'){
    const setter=type==='VACATION'?setCheckedVacationIds:setCheckedAbsenceIds
    const ids=rows.map(d=>d.id)
    setter(prev=>ids.every(id=>prev.includes(id))?prev.filter(id=>!ids.includes(id)):
      [...new Set([...prev,...ids])])
  }


  useEffect(()=>{
    const record=vacations.find(v=>v.operator_id===selectedId)
    setEntitled(record?.entitlement_days==null?'':String(record.entitlement_days))
    setCarry(String(record?.carryover_days??0))
    setAdjust(String(record?.adjustment_days??0))
    setPrivateNote(notes.find(n=>n.operator_id===selectedId)?.content??'')
  },[selectedId,vacations,notes])

  function openDay(operatorId:string,workDate:string){
    setDayEditorError('')
    const row=byDay.get(operatorId+'|'+workDate)
    setDayEditor({
      operator_id:operatorId,work_date:workDate,state:row?.state??'SHIFT',
      start_time:row?.start_time?.slice(0,5)??'08:00',end_time:row?.end_time?.slice(0,5)??'16:00',
      actual_hours:row?.actual_minutes==null?'':String(row.actual_minutes/60),
      actual_confirmed:row?.actual_confirmed??false,justification:row?.justification??'UNKNOWN',
      vacation_taken_confirmed:row?.vacation_taken_confirmed??false
    })
  }
  async function saveDay(){
    if(!dayEditor||!hotel?.id)return
    const isShift=dayEditor.state==='SHIFT'
    const start=normalizeDigitalTime(dayEditor.start_time)
    const end=normalizeDigitalTime(dayEditor.end_time)
    if(isShift && (!validDigitalTime(start)||!validDigitalTime(end))) {
      setDayEditorError('Indica las horas con formato digital HH:MM (por ejemplo, 08:00).')
      return
    }
    const minutes=isShift?minutesInShift(start,end):null
    const actual=dayEditor.actual_hours.trim()===''?null:Math.round(Number(dayEditor.actual_hours)*60)
    if((isShift && !minutes)|| (isShift && actual!==null && (!Number.isFinite(actual)||actual<0||actual>1440))){
      setDayEditorError('Revisa las horas de entrada, salida o las horas efectivas.');return
    }
    setBusy(true);setError('');setDayEditorError('')
    const existing=byDay.get(dayEditor.operator_id+'|'+dayEditor.work_date)
    const confirmedVacation=isVacationState(dayEditor.state) && dayEditor.vacation_taken_confirmed
    if(confirmedVacation && dayEditor.work_date>dateISO(new Date())) {
      setDayEditorError('No se puede confirmar como disfrutado un día futuro.')
      setBusy(false)
      return
    }
    const timeNow=new Date().toISOString()
    const result=await supabase.from('staff_schedule_entries').upsert({
      hotel_id:hotel.id,operator_id:dayEditor.operator_id,work_date:dayEditor.work_date,
      state:dayEditor.state,start_time:isShift?start:null,end_time:isShift?end:null,
      planned_minutes:minutes,actual_minutes:isShift?actual:null,
      actual_confirmed:isShift&&actual!==null&&dayEditor.actual_confirmed,
      justification:dayEditor.justification,
      source_kind:'MANUAL',source_code:existing?.source_code??null,
      vacation_taken_confirmed:confirmedVacation,
      vacation_confirmed_at:confirmedVacation
        ? (existing?.vacation_taken_confirmed ? existing?.vacation_confirmed_at ?? timeNow : timeNow) : null,
      vacation_confirmed_by:confirmedVacation ? session?.user.id??null : null,
      changed_by:session?.user.id??null,updated_at:timeNow,
    },{onConflict:'operator_id,work_date'})
    if(result.error)setDayEditorError(result.error.message)
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
  async function confirmSelectedVacations(){
    if(!hotel?.id||busy)return
    const selected=selectedVacationRows
    if(!selected.length)return
    if(!window.confirm('¿Confirmar como disfrutados los '+selected.length+
      ' días de vacaciones seleccionados? Solo se modificarán esas fechas.'))return
    setBusy(true);setError('');setSuccess('')
    const now=new Date().toISOString()
    const result=await supabase.from('staff_schedule_entries')
      .update({vacation_taken_confirmed:true,vacation_confirmed_at:now,
        vacation_confirmed_by:session?.user.id??null,changed_by:session?.user.id??null,updated_at:now})
      .eq('hotel_id',hotel.id)
      .in('id',selected.map(d=>d.id)).in('state',['VACATION','VACATION_PREVIOUS'])
      .lte('work_date',dateISO(new Date())).eq('vacation_taken_confirmed',false)
      .select('id')
    if(result.error)setError(result.error.message)
    else if((result.data?.length??0)!==selected.length)
      setError('Se actualizaron '+(result.data?.length??0)+' de '+selected.length+
        ' días. Puede que algún registro haya cambiado. Actualiza y revisa la selección.')
    else {setCheckedVacationIds([]);setSuccess(selected.length+' días de vacaciones confirmados.');await reload()}
    setBusy(false)
  }

  async function applySelectedAbsences(){
    if(!hotel?.id||!selectedId||busy)return
    const selected=selectedAbsenceRows
    if(!selected.length)return
    const statusLabel=({
      DOCUMENTED:'Documentada',PENDING:'Pendiente de verificar',
      UNJUSTIFIED:'No justificada',UNKNOWN:'Sin verificar',
    } as Record<string,string>)[bulkAbsenceStatus]
    if(!window.confirm('¿Aplicar «'+statusLabel+'» a '+selected.length+
      ' días seleccionados de '+(selected?.length?operators.find(o=>o.id===selectedId)?.display_name??'este operario':'')+
      '? Comprueba que dispones de la documentación correspondiente.'))return
    setBusy(true);setError('');setSuccess('')
    const now=new Date().toISOString()
    const result=await supabase.from('staff_schedule_entries')
      .update({justification:bulkAbsenceStatus,changed_by:session?.user.id??null,updated_at:now})
      .eq('hotel_id',hotel.id).eq('operator_id',selectedId)
      .in('id',selected.map(d=>d.id))
      .in('state',['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'])
      .select('id')
    if(result.error)setError(result.error.message)
    else if((result.data?.length??0)!==selected.length)
      setError('Se actualizaron '+(result.data?.length??0)+' de '+selected.length+
        ' días. Actualiza y revisa las fechas.')
    else {setCheckedAbsenceIds([]);setSuccess(selected.length+' días de ausencia actualizados a «'+statusLabel+'».');await reload()}
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
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight sm:text-2xl">Planificador horario</h1>
            <p className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">{hotel?.name}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1 print:hidden sm:gap-2">
          <button aria-label="Actualizar" title="Actualizar" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border" onClick={()=>void reload()} disabled={busy}><RefreshCw size={16}/></button>
          <button aria-label="Reportes y PDF" title="Reportes y PDF" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border" onClick={()=>setTab('REPORTES')}><Printer size={16}/></button>
        </div>
      </header>
      {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {success&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" onClick={()=>setSuccess('')}>{success}</div>}
      <section className="flex items-end gap-1.5 rounded-xl bg-white p-2 shadow-sm sm:flex-wrap sm:gap-3 sm:rounded-2xl sm:p-4">
        <label className="w-[76px] shrink-0 text-[10px] font-semibold text-slate-600 sm:w-24 sm:text-xs">Año
          <select value={year} onChange={e=>setYear(Number(e.target.value))} className={baseInput+' mt-0.5 sm:mt-1'}>
            {Array.from({length:9},(_,i)=>year-4+i).map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-1 text-[10px] font-semibold text-slate-600 sm:max-w-xs sm:text-xs">Operario
          <select value={tab==='CUADRANTE'||tab==='VERIFICACION'?calendarFilter:tab==='VACACIONES'?vacationOperatorFilter:selectedId}
            onChange={e=>{
              if(tab==='CUADRANTE'||tab==='VERIFICACION'){
                setCalendarFilter(e.target.value)
                if(e.target.value!=='ALL') setSelectedId(e.target.value)
              } else if(tab==='VACACIONES'){
                setVacationOperatorFilter(e.target.value)
                if(e.target.value!=='ALL') setSelectedId(e.target.value)
              } else {
                setSelectedId(e.target.value)
              }
            }}
            className={baseInput+' mt-0.5 sm:mt-1'}>
            {(tab==='CUADRANTE'||tab==='VERIFICACION'||tab==='VACACIONES')&&<option value="ALL">Todos los operarios</option>}
            {operators.map(o=><option key={o.id} value={o.id}>{o.display_name}{o.active?'':' · inactivo'}</option>)}
          </select>
        </label>
        <div className="flex shrink-0 gap-1 print:hidden sm:ml-auto sm:gap-2">
          <button aria-label="Añadir operario" title="Añadir operario" className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-sm font-semibold text-white sm:px-3" onClick={()=>{setSelectedId('');editOperator(null)}}><Plus size={17}/><span className="hidden sm:inline">Operario</span></button>
          {selected&&((tab!=='CUADRANTE'&&tab!=='VERIFICACION')||calendarFilter!=='ALL')&&(tab!=='VACACIONES'||vacationOperatorFilter!=='ALL')&&<button aria-label="Editar ficha" title="Editar ficha" className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm sm:px-3" onClick={()=>editOperator(selected)}><UserRoundCog size={17}/><span className="hidden sm:inline">Editar ficha</span></button>}
        </div>
      </section>
      <nav className="flex gap-0.5 overflow-x-auto rounded-xl bg-white p-1 shadow-sm print:hidden" aria-label="Secciones del planificador">
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} title={t.label} aria-current={tab===t.id?'page':undefined} className={'min-h-9 shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm '+(tab===t.id?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100')}><span className="sm:hidden">{t.mobile}</span><span className="hidden sm:inline">{t.label}</span></button>)}
      </nav>

      {tab==='REPORTES'&&hotel?.id&&<StaffReport
        hotelId={hotel.id}
        hotelName={hotel.name??'Hotel'}
        operators={operators}
        initialYear={year}
      />}

      {tab==='VERIFICACION'&&hotel?.id&&<StaffHoursBatch
        key={year}
        hotelId={hotel.id}
        year={year}
        operatorId={calendarFilter}
        operators={operators}
        days={days}
        changedBy={session?.user.id??null}
        reload={reload}
      />}

      {tab==='CUADRANTE'&&<StaffCalendar
        year={year}
        operators={operators}
        days={days}
        holidays={holidays}
        operatorId={calendarFilter}
        onYearChange={setYear}
        onEditDay={openDay}
      />}

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

      {tab==='VACACIONES'&&<section className="space-y-2 sm:space-y-3">
        <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold sm:text-base">
              Vacaciones · {year}{vacationOperatorFilter==='ALL'?' · Todos los operarios':''}
            </h2>
            {vacationOperatorFilter!=='ALL'&&<button type="button" onClick={()=>setVacationOperatorFilter('ALL')}
              className="shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-semibold">
              Ver todos
            </button>}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Pulsa un estado para mostrar únicamente esas vacaciones.</p>
          <div className="mt-2 grid grid-cols-4 gap-1 sm:gap-2">
            {([
              {key:'ALL',label:'Todas',tone:'bg-slate-100 text-slate-800'},
              {key:'TAKEN',label:'Disfrutadas',tone:'bg-emerald-600 text-white'},
              {key:'UPCOMING',label:'Pendientes',tone:'bg-emerald-200 text-emerald-950'},
              {key:'UNVERIFIED',label:'Por confirmar',tone:'bg-amber-50 text-amber-900'},
            ] as const).map(item=><button type="button" key={item.key} onClick={()=>setVacationStatusFilter(item.key)}
              aria-pressed={vacationStatusFilter===item.key}
              className={'min-h-14 rounded-lg border px-1 py-2 text-center transition sm:min-h-16 '+
                item.tone+(vacationStatusFilter===item.key?' border-slate-900 ring-2 ring-slate-800 ring-offset-1':' border-transparent')}>
              <span className="block text-[9px] font-semibold leading-3 sm:text-xs">{item.label}</span>
              <span className="mt-1 block text-base font-bold sm:text-xl">{vacationCounts[item.key]}</span>
            </button>)}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Los contadores son del año {year}. «Por confirmar» no significa disfrutadas.
            Los períodos que continúan en enero muestran ambos años.
          </p>
        </div>

        <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold">{selectedVacationRows.length} días seleccionados para confirmar</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={busy||selectableVacationRows.length===0}
                className="rounded-md border px-2 py-1.5 text-[11px] disabled:opacity-40"
                onClick={()=>togglePeriodSelection(selectableVacationRows,'VACATION')}>
                {selectableVacationRows.length>0&&selectableVacationRows.every(d=>checkedVacationIds.includes(d.id))?
                  'Deseleccionar todos':'Seleccionar pendientes visibles'}
              </button>
              <button type="button" disabled={busy||checkedVacationIds.length===0}
                onClick={()=>setCheckedVacationIds([])}
                className="rounded-md border px-2 py-1.5 text-[11px] disabled:opacity-40">Limpiar</button>
              <button type="button" disabled={busy||selectedVacationRows.length===0}
                onClick={()=>void confirmSelectedVacations()}
                className="rounded-md bg-emerald-700 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
                Confirmar seleccionados ({selectedVacationRows.length})
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {vacationGroups.map(group=>{
            const assigned=vacations.find(v=>v.operator_id===group.person.id)
            const assignedDays=assigned?.entitlement_days
            const pendingProgram=assignedDays==null?null:assignedDays+assigned!.adjustment_days-
              group.annual.filter(d=>d.state==='VACATION').length
            return <section key={group.person.id} className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{group.person.display_name}</h3>
                <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold"
                  onClick={()=>{setSelectedId(group.person.id);setVacationOperatorFilter(group.person.id)}}>
                  Ver solo este operario
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
                <span>Programados en {year}: <strong>{group.annual.length} d</strong></span>
                <span>Asignados: <strong>{assignedDays==null?'—':assignedDays+' d'}</strong></span>
                <span>Sin programar: <strong>{pendingProgram==null?'—':pendingProgram+' d'}</strong></span>
              </div>
              <div className="mt-2 divide-y divide-slate-100">
                {group.shown.map(period=>{
                  const byYear=period.rows.reduce<Record<string,number>>((acc,day)=>{
                    const y=day.work_date.slice(0,4)
                    acc[y]=(acc[y]??0)+1
                    return acc
                  },{})
                  const splitYear=Object.keys(byYear).length>1
                  const splitLabel=Object.entries(byYear).map(([y,n])=>n+' d en '+y).join(' · ')
                  return <div key={period.start+'|'+period.state} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs font-semibold">
                        {asDisplayDate(period.start)} – {asDisplayDate(period.end)}
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {period.visibleDays.length} {period.visibleDays.length===1?'día mostrado':'días mostrados'}
                      </span>
                    </div>
                    {splitYear&&<p className="mt-1 rounded-md bg-sky-50 px-2 py-1 text-[10px] text-sky-900">
                      Período continuo · {period.rows.length} días · {splitLabel}
                    </p>}
                    {period.visibleDays.some(day=>vacationStage(day,vacationToday)==='UNVERIFIED')&&
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold">
                        <input type="checkbox" disabled={busy}
                          checked={period.visibleDays.filter(d=>vacationStage(d,vacationToday)==='UNVERIFIED')
                            .every(d=>checkedVacationIds.includes(d.id))}
                          onChange={()=>togglePeriodSelection(period.visibleDays.filter(
                            d=>vacationStage(d,vacationToday)==='UNVERIFIED'),'VACATION')}/>
                        Seleccionar días pendientes de este período
                      </label>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {period.visibleDays.map(day=>{
                        const eligible=vacationStage(day,vacationToday)==='UNVERIFIED'
                        return <div key={day.id} className={'inline-flex items-center gap-1 rounded-md border px-1.5 py-1 '+vacationTone(day,vacationToday)}>
                          <label className={'inline-flex items-center gap-1 '+(eligible?'cursor-pointer':'cursor-not-allowed')}
                            title={vacationStageLabel(vacationStage(day,vacationToday))}>
                            <input type="checkbox" checked={eligible&&checkedVacationIds.includes(day.id)}
                              disabled={busy||!eligible} aria-label={'Seleccionar vacaciones del '+asDisplayDate(day.work_date)}
                              onChange={e=>toggleChecked(day.id,e.target.checked,'VACATION')}/>
                            <span className="text-[11px] font-semibold">{asDisplayDate(day.work_date).slice(0,5)}</span>
                          </label>
                          <button type="button" title={'Editar '+asDisplayDate(day.work_date)}
                            aria-label={'Editar vacaciones del '+asDisplayDate(day.work_date)}
                            onClick={()=>openDay(day.operator_id,day.work_date)}
                            className="rounded border border-current/20 p-1 opacity-80 hover:opacity-100">
                            <Pencil size={11}/>
                          </button>
                        </div>
                      })}
                    </div>
                  </div>
                })}
              </div>
            </section>
          })}
          {vacationGroups.length===0&&<p className="rounded-xl bg-white p-4 text-center text-xs text-slate-500">
            No hay vacaciones que coincidan con el operario, año y estado seleccionados.
          </p>}
        </div>

        {vacationOperatorFilter!=='ALL'&&selected&&selected.id===vacationOperatorFilter&&
          <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
            <details>
              <summary className="cursor-pointer text-xs font-semibold">
                Configurar días asignados de {selected.display_name}
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                <label className="text-xs">Asignación anual (días)<input type="number" min="0" max="366"
                  className={baseInput+' mt-1'} value={entitled} onChange={e=>setEntitled(e.target.value)} placeholder="Sin asignar"/></label>
                <label className="text-xs">De años anteriores<input type="number" className={baseInput+' mt-1'}
                  value={carry} onChange={e=>setCarry(e.target.value)}/></label>
                <label className="text-xs">Ajuste (+ / −)<input type="number" className={baseInput+' mt-1'}
                  value={adjust} onChange={e=>setAdjust(e.target.value)}/></label>
                <button disabled={busy} className="min-h-9 self-end rounded-lg bg-slate-900 px-3 py-2 text-xs text-white"
                  onClick={()=>void saveVacation()}>Guardar</button>
              </div>
            </details>
          </div>}
      </section>}

      {tab==='AUSENCIAS'&&<section className="space-y-2 sm:space-y-3">
        <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <h2 className="mb-2 text-sm font-bold sm:text-base">Bajas · {year}</h2>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
            {summary.map(s=><button type="button" key={s.operator.id} onClick={()=>setSelectedId(s.operator.id)}
              className={'rounded-lg border p-2 text-left '+(selectedId===s.operator.id?'border-sky-400 bg-sky-50':'border-slate-200')}>
              <div className="truncate text-xs font-semibold">{s.operator.display_name}</div>
              <div className="mt-1 text-xl font-bold">{s.sick} <span className="text-xs font-normal">días</span></div>
              <div className="mt-0.5 text-[10px] text-slate-500">{s.sickDocumented} justif. · {s.sickUnjustified} no justif. · {s.sickUnknown} por revisar</div>
            </button>)}
          </div>
        </div>
        {selected&&<div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <h3 className="text-sm font-bold sm:text-base">Bajas de {selected.display_name}</h3>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[
              ['Total',selectedSummary?.sick??0],
              ['Justificados',selectedSummary?.sickDocumented??0],
              ['Sin justificar',selectedSummary?.sickUnjustified??0],
              ['Por revisar',selectedSummary?.sickUnknown??0],
            ].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 px-1.5 py-2 text-center">
              <div className="text-[10px] text-slate-500">{label}</div>
              <div className="mt-0.5 text-lg font-bold">{value}</div>
            </div>)}
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">{selectedAbsenceRows.length} días seleccionados</span>
              <div className="flex flex-wrap gap-1">
                <button type="button" disabled={busy||!absenceSelectableDays.some(d=>['UNKNOWN','PENDING'].includes(d.justification))}
                  onClick={()=>togglePeriodSelection(absenceSelectableDays.filter(d=>['UNKNOWN','PENDING'].includes(d.justification)),'ABSENCE')}
                  className="rounded-md border bg-white px-2 py-1.5 text-[11px] disabled:opacity-40">
                  {absenceSelectableDays.filter(d=>['UNKNOWN','PENDING'].includes(d.justification)).every(d=>checkedAbsenceIds.includes(d.id))?
                    'Deseleccionar sin verificar':'Seleccionar sin verificar'}
                </button>
                <button type="button" disabled={busy||absenceSelectableDays.length===0}
                  onClick={()=>togglePeriodSelection(absenceSelectableDays,'ABSENCE')}
                  className="rounded-md border bg-white px-2 py-1.5 text-[11px] disabled:opacity-40">
                  {absenceSelectableDays.length>0&&absenceSelectableDays.every(d=>checkedAbsenceIds.includes(d.id))?
                    'Deseleccionar todos':'Seleccionar todos'}
                </button>
                <button type="button" disabled={busy||checkedAbsenceIds.length===0}
                  onClick={()=>setCheckedAbsenceIds([])} className="rounded-md border bg-white px-2 py-1.5 text-[11px] disabled:opacity-40">
                  Limpiar
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-1.5">
              <label className="min-w-[160px] flex-1 text-[11px] font-semibold">Asignar estado
                <select className={baseInput+' mt-1'} value={bulkAbsenceStatus}
                  onChange={e=>setBulkAbsenceStatus(e.target.value as typeof bulkAbsenceStatus)}>
                  <option value="DOCUMENTED">Documentada</option>
                  <option value="PENDING">Pendiente de verificar</option>
                  <option value="UNKNOWN">Sin verificar</option>
                  <option value="UNJUSTIFIED">No justificada</option>
                </select>
              </label>
              <button type="button" disabled={busy||selectedAbsenceRows.length===0}
                onClick={()=>void applySelectedAbsences()}
                className="min-h-9 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                Aplicar a {selectedAbsenceRows.length} días
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Marca únicamente los días cuya documentación has comprobado. No modifica el tipo de ausencia ni el motivo.</p>
          </div>
          <h4 className="mt-3 text-xs font-bold">Períodos de baja</h4>
          <div className="mt-1 divide-y divide-slate-100">
            {selectedMedicalPeriods.map(p=><details key={p.start} className="py-2">
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                <span className="min-w-0">{asDisplayDate(p.start)}{p.start!==p.end?' – '+asDisplayDate(p.end):''}</span>
                <span className="shrink-0 font-semibold">{p.rows.length} d · {p.justification==='DOCUMENTED'?'Justificada':p.justification==='UNJUSTIFIED'?'No justificada':p.justification==='PENDING'?'Pendiente':'Sin verificar'}</span>
              </summary>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold">
                <input type="checkbox" disabled={busy}
                  checked={p.rows.every(d=>checkedAbsenceIds.includes(d.id))}
                  onChange={()=>togglePeriodSelection(p.rows,'ABSENCE')}/>
                Seleccionar período completo
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">{p.rows.map(d=>
                <div key={d.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1">
                  <label className="inline-flex cursor-pointer items-center gap-1">
                    <input type="checkbox" disabled={busy} checked={checkedAbsenceIds.includes(d.id)}
                      onChange={e=>toggleChecked(d.id,e.target.checked,'ABSENCE')}
                      aria-label={'Seleccionar baja del '+asDisplayDate(d.work_date)}/>
                    <span className="text-[11px]">{asDisplayDate(d.work_date).slice(0,5)}</span>
                  </label>
                  <button type="button" onClick={()=>openDay(d.operator_id,d.work_date)}
                    className="rounded border p-1" title={'Editar '+asDisplayDate(d.work_date)}
                    aria-label={'Editar baja del '+asDisplayDate(d.work_date)}>
                    <Pencil size={11}/>
                  </button>
                </div>)}</div>
            </details>)}
            {selectedMedicalPeriods.length===0&&<p className="py-2 text-xs text-slate-500">No hay bajas registradas.</p>}
          </div>
          {selectedOtherAbsencePeriods.length>0&&<div className="mt-3 border-t pt-2">
            <h4 className="text-xs font-bold">Otras ausencias</h4>
            {selectedOtherAbsencePeriods.map(p=><details key={p.start} className="border-b py-1.5">
              <summary className="cursor-pointer text-xs">{stateView(p.state).label} · {asDisplayDate(p.start)}{p.end!==p.start?' – '+asDisplayDate(p.end):''} · {p.rows.length} d</summary>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold">
                <input type="checkbox" disabled={busy}
                  checked={p.rows.every(d=>checkedAbsenceIds.includes(d.id))}
                  onChange={()=>togglePeriodSelection(p.rows,'ABSENCE')}/>
                Seleccionar período completo
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">{p.rows.map(d=>
                <div key={d.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1">
                  <label className="inline-flex cursor-pointer items-center gap-1">
                    <input type="checkbox" disabled={busy} checked={checkedAbsenceIds.includes(d.id)}
                      onChange={e=>toggleChecked(d.id,e.target.checked,'ABSENCE')}
                      aria-label={'Seleccionar ausencia del '+asDisplayDate(d.work_date)}/>
                    <span className="text-[11px]">{asDisplayDate(d.work_date).slice(0,5)}</span>
                  </label>
                  <button type="button" onClick={()=>openDay(d.operator_id,d.work_date)}
                    className="rounded border p-1" title={'Editar '+asDisplayDate(d.work_date)}
                    aria-label={'Editar ausencia del '+asDisplayDate(d.work_date)}>
                    <Pencil size={11}/>
                  </button>
                </div>)}</div>
            </details>)}
          </div>}
        </div>}
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
              <label className="text-xs font-medium">Entrada · HH:MM
                <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5}
                  placeholder="08:00" className={baseInput+' mt-1 font-mono text-lg tracking-wider'}
                  value={dayEditor.start_time}
                  onChange={e=>setDayEditor({...dayEditor,start_time:e.target.value})}
                  onBlur={()=>setDayEditor(prev=>prev?{...prev,start_time:normalizeDigitalTime(prev.start_time)}:prev)}/>
              </label>
              <label className="text-xs font-medium">Salida · HH:MM
                <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5}
                  placeholder="16:00" className={baseInput+' mt-1 font-mono text-lg tracking-wider'}
                  value={dayEditor.end_time}
                  onChange={e=>setDayEditor({...dayEditor,end_time:e.target.value})}
                  onBlur={()=>setDayEditor(prev=>prev?{...prev,end_time:normalizeDigitalTime(prev.end_time)}:prev)}/>
              </label>
            </div>}
            {isVacationState(dayEditor.state)&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={dayEditor.vacation_taken_confirmed}
                  disabled={dayEditor.work_date>dateISO(new Date())}
                  onChange={e=>setDayEditor({...dayEditor,vacation_taken_confirmed:e.target.checked})}/>
                Confirmar vacaciones disfrutadas
              </label>
              <p className="mt-1 text-[11px] text-emerald-900">Las fechas pasadas sin confirmar no cuentan como disfrutadas. Solo se pueden confirmar días de hoy o anteriores.</p>
            </div>}
            {dayEditor.state==='SHIFT'&&<>
              <label className="block text-xs">Horas efectivamente verificadas<input type="number" min="0" max="24" step="0.25" className={baseInput+' mt-1'} value={dayEditor.actual_hours} onChange={e=>setDayEditor({...dayEditor,actual_hours:e.target.value})} placeholder="No verificadas"/></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dayEditor.actual_confirmed} onChange={e=>setDayEditor({...dayEditor,actual_confirmed:e.target.checked})}/> Confirmar horas realmente trabajadas</label>
            </>}
            {['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERMISSION'].includes(dayEditor.state)&&
              <label className="block text-xs">Justificación<select className={baseInput+' mt-1'} value={dayEditor.justification} onChange={e=>setDayEditor({...dayEditor,justification:e.target.value})}>
                <option value="UNKNOWN">Sin verificar</option><option value="PENDING">Pendiente</option><option value="DOCUMENTED">Documentada</option><option value="UNJUSTIFIED">No justificada</option></select></label>}
          </div>
          {dayEditorError&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{dayEditorError}</p>}
          <div className="mt-3 flex justify-end gap-2 sm:mt-5"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setDayEditor(null)}>Cancelar</button><button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={()=>void saveDay()}>Guardar jornada</button></div>
        </section>
      </div>}
    </div>
  </main>
}
