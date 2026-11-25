import { overtimeDetails, overtimeLabels, overtimeTimeRange, recoveryStatus, type OvertimeDetailKind } from '../staffOvertimeDetails'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { Plus, Printer, RefreshCw, UserRoundCog, Pencil, X, Settings2 } from 'lucide-react'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useAuth } from '../../auth/context/AuthProvider'
import { supabase } from '../../../lib/supabase'
import {
  dateISO, fromISO, hours, isoWeek, minutesInShift, plannedMinutes, staffStateOptions, isSplitShift, splitShiftLabel,
  stateView, weekendHistory, isVacationState, vacationStage, vacationStageLabel, vacationTone,
  vacationOriginYear, vacationOriginLabel, vacationFromPriorYear, staffHolidayOrigin, type VacationStage,
  type StaffDay, type StaffNote, type StaffOperator,
  type StaffOvertime, type StaffVacation,
} from '../staffModel'
import { groupConsecutiveDays, groupVacationPeriods, loadAllStaffDays } from '../staffData'
import StaffCalendar from '../StaffCalendar'
import type { CalendarMode } from '../staffCalendarLayout'
import StaffReport from '../StaffReport'
import { staffSectionPdf } from '../staffSectionPdf'
import { accruedVacationDays } from '../staffVacationAccrual'
import StaffHolidays from '../StaffHolidays'
import StaffToggleButton from '../StaffToggleButton'
import { auditCompensatoryRest } from '../staffOvertimeAudit'
import StaffPeriodEditor from '../StaffPeriodEditor'
import { exportAnnualStaffPdf } from '../staffAnnualPdf'
import { isDemoUser } from '../../../core/access/demoReadOnly'
import { exportStaffHistoryPdf,exportHolidayAuditPdf,staffHistoryHeadings } from '../staffHolidayHistoryPdf'
import { exportPlannerSchedulePdf } from '../staffPlannerPdf'

type PageTab = 'CUADRANTE' | 'FESTIVOS' | 'ANUAL' | 'FINES' | 'EXTRAS' | 'VACACIONES' | 'AUSENCIAS' | 'NOTAS' | 'HISTORIAL' | 'REPORTES'
type VacationFilter = 'ALL' | VacationStage
type DayEditor = {
  operator_id:string; work_date:string; state:string; start_time:string; end_time:string;
  justification:string;
  vacation_taken_confirmed:boolean; vacation_origin_year:string;
  holiday_source_date:string; comp_source_entry_id:string; comp_rest_hours:string;
  comp_allocations: Record<string,number>; target_minutes:number;
}
const tabs: Array<{id:PageTab;label:string;mobile:string}> = [
  {id:'CUADRANTE',label:'Cuadrante',mobile:'Turnos'}, {id:'ANUAL',label:'Resumen anual',mobile:'Resumen'},
  {id:'FESTIVOS',label:'Festivos',mobile:'Festivos'}, {id:'FINES',label:'Fines de semana',mobile:'F. semana'}, {id:'EXTRAS',label:'Horas extra',mobile:'Horas'},
  {id:'VACACIONES',label:'Vacaciones',mobile:'Vacac.'}, {id:'AUSENCIAS',label:'Bajas y ausencias',mobile:'Bajas'},
  {id:'NOTAS',label:'Observaciones privadas',mobile:'Notas'},
  {id:'HISTORIAL',label:'Historial de cambios',mobile:'Historial'},
  {id:'REPORTES',label:'Reportes y PDF',mobile:'PDF'},
]
const shiftPresets = [
  { label:'08:00–16:00', start:'08:00', end:'16:00' },
  { label:'10:00–18:00', start:'10:00', end:'18:00' },
  { label:'13:00–21:00', start:'13:00', end:'21:00' },
  { label:'09–13 / 15–19', start:'09:00', end:'19:00' },
] as const
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
  const extra=overtime.filter(d=>d.operator_id===operatorId)
  const money=(kind:string)=>extra.filter(e=>e.entry_type===kind).reduce((t,e)=>t+e.minutes,0)
  return {
    planned:own.filter(d=>d.state==='SHIFT').reduce((t,d)=>t+plannedMinutes(d),0),
    shifts:own.filter(d=>d.state==='SHIFT').length,
    vacation:days.filter(d=>d.operator_id===operatorId && isVacationState(d.state)
      && vacationOriginYear(d)===year).length,
    vacationPrevious:own.filter(d=>isVacationState(d.state) &&
      (vacationOriginYear(d)===null || vacationOriginYear(d)!<year)).length,
    unjustifiedAbsences:own.filter(d=>d.state==='UNJUSTIFIED_ABSENCE').length,
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
const historyActions: Record<string,string> = {INSERT:'Alta',UPDATE:'Modificación',DELETE:'Eliminación'}
function historySummary(values:Record<string,unknown>|null):string {
  if(!values)return '—'
  if(typeof values.state==='string'){
    const label=staffStateOptions.find(option=>option.value===values.state)?.label??'Estado sin catalogar'
    if(values.state==='SHIFT'&&typeof values.start_time==='string'&&typeof values.end_time==='string'){
      return label+' '+values.start_time.slice(0,5)+'–'+values.end_time.slice(0,5)
    }
    return label
  }
  if(typeof values.display_name==='string'){
    return values.display_name+(values.active===false?' · Inactivo':' · Activo')
  }
  if(typeof values.minutes==='number')return hours(values.minutes)
  if(typeof values.entitlement_days==='number')return values.entitlement_days+' días de vacaciones'
  return 'Registro guardado'
}
export default function StaffSchedulePage() {
  const navigate=useNavigate()
  const {hotel,isPlatformAdmin}=useHotelScope()
  const {session}=useAuth()
  const sessionUserId=session?.user.id
  const demo=isDemoUser(session?.user.id)
  const [year,setYear]=useState(new Date().getFullYear())
  const [calendarMode,setCalendarMode]=useState<CalendarMode>('MES')
  const [calendarDate,setCalendarDate]=useState(()=>dateISO(new Date()))
  const calendarFocusDate=calendarDate.startsWith(year+'-')?calendarDate:year+'-01-15'
  const [operatorFilter,setOperatorFilter]=useState('ALL')
  const [reportPdfRequest,setReportPdfRequest]=useState(0)
  const [vacationStatusFilter,setVacationStatusFilter]=useState<VacationFilter>('ALL')
  const [showVacationSettings,setShowVacationSettings]=useState(false)
  const [agreementOperatorIds,setAgreementOperatorIds]=useState<string[]|null>(null)
  const [checkedVacationIds,setCheckedVacationIds]=useState<string[]>([])
  const [absenceDetail,setAbsenceDetail]=useState<{operatorId:string;kind:'sick'|'other'|'documented'|'unjustified'|'unknown'|'absence'}|null>(null)
  const absenceDialog=useRef<HTMLDialogElement>(null)
  const [overtimeDetail,setOvertimeDetail]=useState<{operatorId:string;kind:OvertimeDetailKind}|null>(null)
  const overtimeDialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const dialog=overtimeDialog.current
    if(overtimeDetail && dialog && !dialog.open)dialog.showModal()
    if(!overtimeDetail && dialog?.open)dialog.close()
  },[overtimeDetail])

  const [checkedAbsenceIds,setCheckedAbsenceIds]=useState<string[]>([])
  const [bulkAbsenceStatus,setBulkAbsenceStatus]=useState<'DOCUMENTED'|'PENDING'|'UNJUSTIFIED'|'UNKNOWN'>('DOCUMENTED')
  const [tab,setTab]=useState<PageTab>(()=>new URLSearchParams(window.location.search).get('tab')==='reportes'?'REPORTES':'CUADRANTE')
  useEffect(()=>{setAbsenceDetail(null)},[year,operatorFilter,tab,hotel?.id])
  useEffect(()=>{const el=absenceDialog.current;if(absenceDetail&&el&&!el.open)el.showModal();else if(!absenceDetail&&el?.open)el.close()},[absenceDetail])
  const [showOvertimeForm,setShowOvertimeForm]=useState(false)
  const [allowed,setAllowed]=useState(false)
  const [checking,setChecking]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [operators,setOperators]=useState<StaffOperator[]>([])
  const [days,setDays]=useState<StaffDay[]>([])
  const [holidays,setHolidays]=useState<string[]>([])
  const [holidayLabels,setHolidayLabels]=useState<Record<string,string>>({})
  const [overtime,setOvertime]=useState<StaffOvertime[]>([])
  const [vacations,setVacations]=useState<StaffVacation[]>([])
  const [notes,setNotes]=useState<StaffNote[]>([])
  const [firstScheduledDates,setFirstShiftDates]=useState<Record<string,string>>({})
  const [history,setHistory]=useState<Array<{id:string;operator_id:string;work_date:string;action:string;entity_kind:string;changed_at:string;actor_user_id:string|null;administrative_label:string|null;previous_values:Record<string,unknown>|null;new_values:Record<string,unknown>|null}>>([])
  const [historyUsers,setHistoryUsers]=useState<Record<string,string>>({})
  useEffect(()=>{
    if(tab!=='HISTORIAL')return
    const ids=[...new Set(history.flatMap(row=>row.actor_user_id?[row.actor_user_id]:[]))]
    setHistoryUsers({})
    if(!ids.length)return
    let active=true
    void supabase.from('profiles').select('id,full_name,email,login_identifier').in('id',ids).then(({data})=>{
      if(active)setHistoryUsers(Object.fromEntries((data??[]).map(user=>[
        user.id,user.full_name?.trim()||user.login_identifier?.trim()||user.email?.trim()||'',
      ])))
    })
    return ()=>{active=false}
  },[history,tab])
  const [periodStart,setPeriodStart]=useState(dateISO(new Date()))
  const [periodEnd,setPeriodEnd]=useState(dateISO(new Date()))
  const [selectedId,setSelectedId]=useState('')
  const [hoursDetailOperatorId,setHoursDetailOperatorId]=useState<string|null>(null)
  const [shiftDetailMonth,setShiftDetailMonth]=useState<number|null>(null)
  const shiftDetailsPanel=useRef<HTMLElement>(null)
  function openHoursDetail(operatorId:string){
    setShiftDetailMonth(null)
    setHoursDetailOperatorId(operatorId)
  }
  useEffect(()=>{
    if(shiftDetailMonth!==null&&window.matchMedia('(max-width: 639px)').matches){
      shiftDetailsPanel.current?.scrollIntoView({block:'nearest'})
    }
  },[shiftDetailMonth])
  const [dayEditor,setDayEditor]=useState<DayEditor|null>(null)
  const [customShiftTime,setCustomShiftTime]=useState(false)
  const [dayEditorError,setDayEditorError]=useState('')
  const [showOperatorForm,setShowOperatorForm]=useState(false)
  const [editingOperatorId,setEditingOperatorId]=useState<string|null>(null)
  const [name,setName]=useState('')
  const [weeklyHours,setWeeklyHours]=useState('40')
  const [rotation,setRotation]=useState<'NORMAL'|'EXCEPTIONAL'|'NONE'>('NORMAL')
  const [userId,setUserId]=useState('')
  const [joinDate,setJoinDate]=useState('')
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
    if(!hotel?.id||!sessionUserId){setAllowed(false);setChecking(false);return}
    setChecking(true)
    void supabase.rpc('has_hotel_permission',{target_hotel_id:hotel.id,permission_code:'maintenance.configure'})
      .then(({data,error:checkError})=>{
        if(!mounted)return
        setAllowed(demo || isPlatformAdmin || (!checkError && data===true))
        setChecking(false)
      })
    return ()=>{mounted=false}
  },[hotel?.id,isPlatformAdmin,demo,sessionUserId])

  async function reload(){
    if(!hotel?.id||!allowed)return
    setBusy(true);setError('')
    const [people,entries,extras,years,privateNotes,holidayRows,firstScheduled,historyRows]=await Promise.all([
      supabase.from('staff_operators').select('*').eq('hotel_id',hotel.id).order('display_name'),
      loadAllStaffDays({
        hotelId:hotel.id,
        startDate:String(year-1)+'-12-01',
        endDate:String(year+1)+'-01-31',
      }),
      supabase.from('staff_overtime_ledger').select('*').eq('hotel_id',hotel.id)
        .lte('entry_date',String(year)+'-12-31').order('entry_date',{ascending:false}),
      supabase.from('staff_vacation_years').select('*').eq('hotel_id',hotel.id).eq('year',year),
      demo?Promise.resolve({data:[],error:null}):supabase.from('staff_private_notes').select('*').eq('hotel_id',hotel.id),
      supabase.from('staff_calendar_holidays').select('holiday_date,label').eq('hotel_id',hotel.id)
        .gte('holiday_date',String(year-1)+'-12-25').lte('holiday_date',String(year+1)+'-01-10'),
      supabase.from('staff_operator_first_day').select('operator_id,first_scheduled_date').eq('hotel_id',hotel.id),
      demo?Promise.resolve({data:[],error:null}):supabase.from('staff_schedule_history').select('id,operator_id,work_date,action,entity_kind,changed_at,actor_user_id,administrative_label,previous_values,new_values')
        .eq('hotel_id',hotel.id).gte('work_date',year+'-01-01').lte('work_date',year+'-12-31')
        .order('changed_at',{ascending:false}).limit(200),
    ])
    const failure=people.error||entries.error||extras.error||years.error||privateNotes.error||holidayRows.error||firstScheduled.error||historyRows.error
    if(failure){setError(failure.message);setBusy(false);return}
    const loaded=people.data as StaffOperator[]
    setOperators(loaded);setDays(entries.data as StaffDay[]);setOvertime(extras.data as StaffOvertime[])
    setHolidays((holidayRows.data??[]).map(row=>row.holiday_date))
    setHolidayLabels(Object.fromEntries((holidayRows.data??[]).map(row=>[row.holiday_date,row.label])))
    setVacations(years.data as StaffVacation[]);setNotes(privateNotes.data as StaffNote[])
    setFirstShiftDates(Object.fromEntries((firstScheduled.data??[]).map(row=>[row.operator_id,row.first_scheduled_date])))
    setHistory((historyRows.data??[]) as typeof history)
    setSelectedId(prev=>loaded.some(p=>p.id===prev)?prev:(loaded[0]?.id??''))
    setBusy(false)
  }
  useEffect(()=>{void reload()},[hotel?.id,allowed,year])
  const selected=operators.find(p=>p.id===selectedId)??null
  const restAudit=selectedId?auditCompensatoryRest(days,overtime,selectedId,year):null
  const filteredOperators=operatorFilter==='ALL'?operators:operators.filter(o=>o.id===operatorFilter)
  const summary=useMemo(()=>operators.map(o=>({
    operator:o,...operatorTotals(days,overtime,o.id,year),...getWeekendSummary(days,o.id,year)
  })),[operators,days,overtime,year])
  const filteredSummary=summary.filter(s=>operatorFilter==='ALL'||s.operator.id===operatorFilter)
  const selectedSummary=summary.find(s=>s.operator.id===selectedId)??null
  const hoursDetailOperator=operators.find(o=>o.id===hoursDetailOperatorId)??null
  const hoursMonthly=useMemo(()=>Array.from({length:12},(_,i)=>{
    const month=String(i+1).padStart(2,'0')
    const entries=days.filter(d=>d.operator_id===hoursDetailOperatorId &&
      d.work_date.slice(0,7)===year+'-'+month && d.state==='SHIFT')
    return {
      month:new Date(year,i,1).toLocaleDateString('es-ES',{month:'long'}),
      entries:entries.sort((a,b)=>a.work_date.localeCompare(b.work_date)),
      minutes:entries.reduce((sum,d)=>sum+plannedMinutes(d),0),
    }
  }),[days,hoursDetailOperatorId,year])
  const selectedShiftMonth=shiftDetailMonth===null?null:hoursMonthly[shiftDetailMonth]
  const hoursMonthlyTotal=hoursMonthly.reduce((sum,row)=>sum+row.minutes,0)
  const hoursMonthlyShifts=hoursMonthly.reduce((sum,row)=>sum+row.entries.length,0)
  useEffect(()=>{
    if(!hoursDetailOperatorId)return
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setHoursDetailOperatorId(null)
    }
    window.addEventListener('keydown',onKeyDown)
    return ()=>window.removeEventListener('keydown',onKeyDown)
  },[hoursDetailOperatorId])
  const byDay=useMemo(()=>new Map(days.map(d=>[d.operator_id+'|'+d.work_date,d])),[days])
  const usedHolidays=useMemo(()=>new Set(days.filter(d=>d.state==='PUBLIC_HOLIDAY')
    .map(d=>d.operator_id+'|'+(staffHolidayOrigin(d)??''))),[days])
  const holidayUsageForDay=dayEditor&&dayEditor.state==='PUBLIC_HOLIDAY'
    ?days.filter(d=>d.operator_id===dayEditor.operator_id&&d.state==='PUBLIC_HOLIDAY'
       &&staffHolidayOrigin(d)===dayEditor.holiday_source_date):[]
  const holidayPendingCount=dayEditor?holidays.filter(date=>
    date.startsWith(dayEditor.work_date.slice(0,4))&&
    !usedHolidays.has(dayEditor.operator_id+'|'+date)).length:0
  const selectableHolidays=dayEditor?holidays.filter(date=>
    date.startsWith(dayEditor.work_date.slice(0,4))||date===dayEditor.holiday_source_date):[]
  const availableHolidays=selectableHolidays.filter(date=>!usedHolidays.has(dayEditor?.operator_id+"|"+date)||date===dayEditor?.holiday_source_date)
  const earnedEntries=dayEditor?overtime.filter(e=>e.operator_id===dayEditor.operator_id&&
    ['EARNED','ADJUSTMENT_PLUS'].includes(e.entry_type)).map(e=>{
       const taken=overtime.filter(t=>t.compensates_entry_id===e.id&&
         (!byDay.get(dayEditor.operator_id+'|'+dayEditor.work_date)?.id || t.linked_schedule_entry_id!==byDay.get(dayEditor.operator_id+'|'+dayEditor.work_date)?.id))
         .reduce((sum,t)=>sum+t.minutes,0)
       return {...e,remaining:e.minutes-taken}
    }).filter(e=>e.remaining>0||dayEditor.comp_allocations[e.id]>0):[]
  const restGlobalAvailable=dayEditor?overtime.filter(e=>e.operator_id===dayEditor.operator_id).reduce((sum,e)=>sum+(['EARNED','ADJUSTMENT_PLUS'].includes(e.entry_type)?e.minutes:e.linked_schedule_entry_id&&e.linked_schedule_entry_id===byDay.get(dayEditor.operator_id+'|'+dayEditor.work_date)?.id&&e.entry_type==='REST_TAKEN'?0:-e.minutes),0):0
  const restAllocated=dayEditor?Object.values(dayEditor.comp_allocations).reduce((a,b)=>a+b,0):0
  const restRemaining=dayEditor?dayEditor.target_minutes-restAllocated:0

  const vacationToday=dateISO(new Date())
  // Each calendar year starts on that worker's first registered day in that year's
  // schedule, including REST, PUBLIC_HOLIDAY, VACATION or any other state.
  const firstDayOfSelectedYear=useMemo(()=>{
    const first:Record<string,string>={}
    const prefix=String(year)+'-'
    for(const d of days){
      if(!d.work_date.startsWith(prefix))continue
      if(!first[d.operator_id]||d.work_date<first[d.operator_id])
        first[d.operator_id]=d.work_date
    }
    return first
  },[days,year])
  const agreementOperators=agreementOperatorIds===null?operators:
    operators.filter(p=>agreementOperatorIds.includes(p.id))
  const formatVacationDays=(value:number|null)=>value===null?'—':
    value.toLocaleString('es-ES',{maximumFractionDigits:2})+' d'
  const vacationYearDays=days.filter(d=>d.work_date.startsWith(String(year)) && isVacationState(d.state))
  const vacationPeople=operators.filter(person=>
    (operatorFilter==='ALL'||operatorFilter===person.id) &&
    (operatorFilter!=='ALL'||vacationYearDays.some(d=>d.operator_id===person.id)))
  const vacationScopedDays=vacationYearDays.filter(d=>
    operatorFilter==='ALL'||d.operator_id===operatorFilter)
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
    const periods=groupVacationPeriods(days.filter(d=>d.operator_id===person.id &&
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
  const otherAbsenceDays=(id:string)=>days.filter(d=>d.operator_id===id&&d.work_date.startsWith(String(year))&&['PERSONAL_DAY','PERMISSION'].includes(d.state))
  const absenceDetailRows=absenceDetail?days.filter(d=>d.operator_id===absenceDetail.operatorId&&d.work_date.startsWith(String(year))&&(absenceDetail.kind==='absence'?d.state==='UNJUSTIFIED_ABSENCE':absenceDetail.kind==='other'?['PERSONAL_DAY','PERMISSION'].includes(d.state):d.state==='MEDICAL_LEAVE'&&(absenceDetail.kind==='sick'||(absenceDetail.kind==='documented'&&d.justification==='DOCUMENTED')||(absenceDetail.kind==='unjustified'&&d.justification==='UNJUSTIFIED')||(absenceDetail.kind==='unknown'&&['UNKNOWN','PENDING'].includes(d.justification))))).sort((a,b)=>a.work_date.localeCompare(b.work_date)):[]
  const overtimeDetailRows=overtimeDetail?overtimeDetails(overtime,overtimeDetail.operatorId,overtimeDetail.kind):[]
  const overtimeCount=(operatorId:string,kind:OvertimeDetailKind,minutes:number)=>minutes>0
    ? <button type="button" className="rounded px-1 underline hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-600"
        aria-label={overtimeLabels[kind]+': '+hours(minutes)} onClick={()=>setOvertimeDetail({operatorId,kind})}>{hours(minutes)}</button>
    : hours(minutes)
  const absenceCount=(id:string,kind:NonNullable<typeof absenceDetail>['kind'],count:number)=>count>0?<button type="button" className="rounded px-1 underline hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-600" onClick={()=>setAbsenceDetail({operatorId:id,kind})}>{count}</button>:<span>0</span>
  const selectedOtherAbsences=days.filter(d=>d.operator_id===selectedId && d.work_date.startsWith(String(year))
    && ['UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state))
  const selectedOtherAbsencePeriods=groupConsecutiveDays(selectedOtherAbsences)
  const absenceSelectableDays=[...selectedMedicalDays,...selectedOtherAbsences.filter(d=>d.state!=='UNJUSTIFIED_ABSENCE')]
  const selectedAbsenceRows=absenceSelectableDays.filter(day=>checkedAbsenceIds.includes(day.id))
  const selectableVacationRows=vacationGroups.flatMap(group=>group.shown.flatMap(period=>period.visibleDays))
    .filter(day=>vacationStage(day,vacationToday)==='UNVERIFIED')
  const selectedVacationRows=selectableVacationRows.filter(day=>checkedVacationIds.includes(day.id))

  useEffect(()=>{
    setCheckedVacationIds([])
  },[year,operatorFilter,vacationStatusFilter,hotel?.id])
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
    const start=row?.start_time?.slice(0,5)??'08:00'
    const end=row?.end_time?.slice(0,5)??'16:00'
    setCustomShiftTime(!shiftPresets.some(p=>p.start===start&&p.end===end))
    setDayEditor({
      operator_id:operatorId,work_date:workDate,state:row?.state??'SHIFT',
      start_time:start,end_time:end,
      justification:row?.state==='UNJUSTIFIED_ABSENCE'?'UNJUSTIFIED':row?.justification??'UNKNOWN',
      vacation_taken_confirmed:row?.vacation_taken_confirmed??false,
      holiday_source_date:row?staffHolidayOrigin(row)??'':'',
       comp_source_entry_id:row?.comp_source_entry_id??'',
       comp_allocations:Object.fromEntries(overtime.filter(e=>e.linked_schedule_entry_id===row?.id
         &&e.compensates_entry_id&&e.entry_type==='REST_TAKEN').map(e=>[e.compensates_entry_id!,e.minutes])),
       target_minutes:row?.state==='COMP_REST'?(row.comp_rest_minutes??480):
         row?.state==='SHIFT'?(row.planned_minutes??480):480,
       comp_rest_hours:row?.comp_rest_minutes?String(row.comp_rest_minutes/60):'8',
       vacation_origin_year:row?.vacation_origin_year==null
        ? (row?.state==='VACATION_PREVIOUS'?'':workDate.slice(0,4))
        : String(row.vacation_origin_year)
    })
  }
  async function saveDay(){
    if(!dayEditor||!hotel?.id)return
    if(!sessionUserId){setDayEditorError('Inicia sesión de nuevo para guardar la jornada.');return}
    const isShift=dayEditor.state==='SHIFT'
    const start=normalizeDigitalTime(dayEditor.start_time)
    const end=normalizeDigitalTime(dayEditor.end_time)
    if(isShift && (!validDigitalTime(start)||!validDigitalTime(end))) {
      setDayEditorError('Indica las horas con formato digital HH:MM (por ejemplo, 08:00).')
      return
    }
    const calendarYear=Number(dayEditor.work_date.slice(0,4))
    const originText=dayEditor.vacation_origin_year.trim()
    const vacationOrigin=isVacationState(dayEditor.state)&&originText!==''?Number(originText):null
    if(isVacationState(dayEditor.state) && vacationOrigin!==null &&
      (!Number.isInteger(vacationOrigin)||vacationOrigin<2000||vacationOrigin>calendarYear)){
      setDayEditorError('El año de origen debe ser válido y no posterior al año del día.')
      return
    }
    if(dayEditor.state==='VACATION_PREVIOUS'&&vacationOrigin!==null&&vacationOrigin>=calendarYear){
      setDayEditorError('En vacaciones anteriores, el año de origen debe ser anterior al año de disfrute.')
      return
    }
    const vacationState=dayEditor.state==='VACATION' && vacationOrigin!==null &&
      vacationOrigin<calendarYear ? 'VACATION_PREVIOUS' : dayEditor.state
    if(dayEditor.state==='PUBLIC_HOLIDAY' &&
      (!dayEditor.holiday_source_date||!availableHolidays.includes(dayEditor.holiday_source_date))){
      setDayEditorError('Selecciona uno de los festivos pendientes de este trabajador.');return
    }
    if(dayEditor.state==='COMP_REST'){
      if(restRemaining!==0||restAllocated<=0||restAllocated>restGlobalAvailable||
        Object.entries(dayEditor.comp_allocations).some(([id,n])=>n<=0||
          !earnedEntries.some(e=>e.id===id&&e.remaining>=n))){
        setDayEditorError('Debes cubrir '+hours(dayEditor.target_minutes)+
          ' con los saldos pendientes. Quedan '+hours(Math.max(0,restRemaining))+' por escoger.');return
      }
      setBusy(true);setError('');setDayEditorError('')
      const result=await supabase.rpc('staff_schedule_compensatory_day',{
        p_hotel_id:hotel.id,p_operator_id:dayEditor.operator_id,
        p_work_date:dayEditor.work_date,
        p_allocations:Object.entries(dayEditor.comp_allocations).filter(([,n])=>n>0)
          .map(([sourceId,minutes])=>({sourceId,minutes})),
      })
      if(result.error)setDayEditorError(result.error.message)
      else {setDayEditor(null);setSuccess('Descanso registrado: '+hours(restAllocated)+' compensadas.');await reload()}
      setBusy(false);return
    }
    const minutes=isShift?minutesInShift(start,end):null
    if(isShift && !minutes){
      setDayEditorError('Revisa las horas de entrada y salida del turno.');return
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
      state:vacationState,start_time:isShift?start:null,end_time:isShift?end:null,
      planned_minutes:minutes,
      // No generar ni confirmar horas reales desde el cuadrante; conservarlas solo si ya existen.
      actual_minutes:existing?.actual_minutes??null,
      actual_confirmed:existing?.actual_confirmed??false,
      justification:dayEditor.state==='UNJUSTIFIED_ABSENCE'?'UNJUSTIFIED':dayEditor.justification,
      source_kind:'MANUAL',
      source_code:dayEditor.state==='PUBLIC_HOLIDAY'
        ?'Festivo disfrutado · '+dayEditor.holiday_source_date
        :existing?.state===dayEditor.state?existing?.source_code??null:null,
      holiday_source_date:dayEditor.state==='PUBLIC_HOLIDAY'?dayEditor.holiday_source_date:null,
      comp_source_entry_id:null,
      comp_rest_minutes:null,
      vacation_origin_year:isVacationState(dayEditor.state)?vacationOrigin:null,
      vacation_taken_confirmed:confirmedVacation,
      vacation_confirmed_at:confirmedVacation
        ? (existing?.vacation_taken_confirmed ? existing?.vacation_confirmed_at ?? timeNow : timeNow) : null,
      vacation_confirmed_by:confirmedVacation ? session?.user.id??null : null,
      changed_by:sessionUserId??null,updated_at:timeNow,
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
    setJoinDate(operator?.join_date??'')
    setShowOperatorForm(true)
  }
  async function saveOperator(){
    if(!hotel?.id||!name.trim())return
    if(userId.trim()&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId.trim())){
      setError('El identificador de cuenta debe tener formato UUID.');return
    }
    const minutes=weeklyHours.trim()===''?null:Math.round(Number(weeklyHours)*60)
    if(minutes!==null&&(!Number.isFinite(minutes)||minutes<0||minutes>6000)){setError('Jornada semanal no válida.');return}
    if(joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)){setError('Fecha de alta no válida.');return}
    setBusy(true);setError('')
    const payload={hotel_id:hotel.id,display_name:name.trim(),
      weekly_target_minutes:minutes,rotation_type:rotation,
      linked_user_id:userId.trim()||null,join_date:joinDate||null,
      updated_at:new Date().toISOString()}
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
        vacation_confirmed_by:session?.user.id??null,changed_by:sessionUserId??null,updated_at:now})
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
      .update({justification:bulkAbsenceStatus,changed_by:sessionUserId??null,updated_at:now})
      .eq('hotel_id',hotel.id).eq('operator_id',selectedId)
      .in('id',selected.map(d=>d.id))
      .in('state',['MEDICAL_LEAVE','PERSONAL_DAY','PERMISSION'])
      .select('id')
    if(result.error)setError(result.error.message)
    else if((result.data?.length??0)!==selected.length)
      setError('Se actualizaron '+(result.data?.length??0)+' de '+selected.length+
        ' días. Actualiza y revisa las fechas.')
    else {setCheckedAbsenceIds([]);setSuccess(selected.length+' días de ausencia actualizados a «'+statusLabel+'».');await reload()}
    setBusy(false)
  }

  async function savePeriod(kind:'VACATION'|'MEDICAL_LEAVE'){
    if(!hotel?.id||!selectedId)return
    if(!periodStart||!periodEnd||periodStart>periodEnd){
      setError('Comprueba las fechas del período.');return
    }
    if(!window.confirm('¿Registrar '+(kind==='VACATION'?'vacaciones':'baja')+
      ' de '+(operators.find(o=>o.id===selectedId)?.display_name??'este trabajador')+
      ' desde '+asDisplayDate(periodStart)+' hasta '+asDisplayDate(periodEnd)+
      '? Se reflejará en cuadrante y en el historial.'))return
    setBusy(true);setError('');setSuccess('')
    const {data,error:saveError}=await supabase.rpc('staff_set_period',{
      p_hotel_id:hotel.id,p_operator_id:selectedId,p_start:periodStart,p_end:periodEnd,p_state:kind,
    })
    if(saveError)setError(saveError.message)
    else {setSuccess(data+' fechas actualizadas en cuadrante, '+(kind==='VACATION'?'Vacaciones':'Bajas')+
      ' e historial.');await reload()}
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
      changed_by:sessionUserId??null,updated_at:new Date().toISOString(),
    },{onConflict:'operator_id,year'})
    if(result.error)setError(result.error.message);else{setSuccess('Saldo anual guardado.');await reload()}
    setBusy(false)
  }
  async function saveNote(){
    if(!hotel?.id||!selectedId)return
    setBusy(true);setError('')
    const result=await supabase.from('staff_private_notes').upsert({
      hotel_id:hotel.id,operator_id:selectedId,content:privateNote,
      changed_by:sessionUserId??null,updated_at:new Date().toISOString(),
    },{onConflict:'operator_id'})
    if(result.error)setError(result.error.message);else{setSuccess('Observación privada guardada.');await reload()}
    setBusy(false)
  }
  async function exportAnnualPdf(){
    if(!hotel)return
    try{
      setError('')
      await exportAnnualStaffPdf({hotelName:hotel.name,year,rows:filteredSummary})
    }catch(e){setError('No se pudo generar el PDF anual: '+
      (e instanceof Error?e.message:'Error desconocido'))}
  }
  async function exportSectionPdf(section:'EXTRAS'|'VACACIONES'|'BAJAS'){
    if(!hotel)return
    try{
      setError('')
      await staffSectionPdf({
        section,hotelName:hotel.name,year,operators,days,overtime,
        operatorId:operatorFilter,
        statusFilter:section==='VACACIONES'?vacationStatusFilter:undefined,
      })
    }catch(e){setError('No se pudo generar el PDF: '+(e instanceof Error?e.message:'Error'))}
  }
  const historyRows=history.filter(row=>operatorFilter==='ALL'||row.operator_id===operatorFilter).map(row=>{
    const actorId=row.actor_user_id
    const user=row.administrative_label??(actorId
      ? actorId===sessionUserId&&isPlatformAdmin?'Administrador':
        historyUsers[actorId]||
        (actorId===sessionUserId?session?.user.email||'Usuario actual':null)||
        operators.find(operator=>operator.linked_user_id===actorId)?.display_name||'Usuario registrado'
      : 'Sin sesión registrada')
    return {id:row.id,cells:[
      new Date(row.changed_at).toLocaleString('es-ES'),
      operators.find(operator=>operator.id===row.operator_id)?.display_name??'—',
      asDisplayDate(row.work_date),
      ({SCHEDULE:'Cuadrante',OPERATOR:'Ficha personal',VACATION_BALANCE:'Saldo vacaciones',OVERTIME:'Horas extras'} as Record<string,string>)[row.entity_kind]??'Otro registro',
      historyActions[row.action]??'Cambio',
      historySummary(row.previous_values),
      historySummary(row.new_values),
      user,
    ]}
  })

  async function exportCurrentPdf(forSharing=false){
    if(!hotel?.id)return
    setError('')
    try{
      switch(tab){
        case 'ANUAL':await exportAnnualPdf();break
        case 'FESTIVOS':
          await exportHolidayAuditPdf({
            hotelName:hotel.name??'Hotel',year,operators,days,
            holidays:holidays.filter(date=>date.startsWith(String(year))).map(date=>({
              holiday_date:date,label:holidayLabels[date]??'Festivo',
            })),operatorIds:filteredOperators.map(o=>o.id),firstScheduledDates,
          })
          break
        case 'EXTRAS':await exportSectionPdf('EXTRAS');break
        case 'VACACIONES':await exportSectionPdf('VACACIONES');break
        case 'AUSENCIAS':await exportSectionPdf('BAJAS');break
        case 'HISTORIAL':
          await exportStaffHistoryPdf({hotelName:hotel.name??'Hotel',year,rows:historyRows.map(row=>row.cells)})
          break
        case 'CUADRANTE':
        case 'FINES':
          await exportPlannerSchedulePdf({hotelName:hotel.name??'Hotel',year,operators,days,
            mode:tab,operatorId:operatorFilter,holidays,calendarMode,focusDate:calendarFocusDate,forSharing})
          break
        case 'REPORTES':setReportPdfRequest(value=>value+1);break
        case 'NOTAS':setError('Las observaciones privadas no tienen exportación PDF habilitada por motivos de confidencialidad.');break
      }
    }catch(e){
      setError('No se pudo generar el PDF: '+(e instanceof Error?e.message:'Error desconocido'))
    }
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
      confirmed:true,changed_by:sessionUserId??null,
    })
    if(result.error)setError(result.error.message)
    else{setOvertimeHours('');setOvertimeReason('');setSuccess('Movimiento de horas registrado.');await reload()}
    setBusy(false)
  }
  if(checking)return <main className="p-8 text-slate-600">Comprobando permisos del planificador…</main>
  if(!allowed||!sessionUserId)return <main className="mx-auto max-w-xl p-8"><h1 className="text-xl font-bold">Planificador horario</h1><p className="mt-3 text-slate-600">La gestión de horarios y las observaciones del personal están reservadas a responsables autorizados.</p><button onClick={()=>navigate('/')} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white">Volver</button></main>
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
          {!demo&&<button type="button" title="Registro de jornada" className="flex min-h-9 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold sm:px-3 sm:text-sm" onClick={()=>navigate('/registro-jornada')}>Fichajes</button>}
        </div>
      </header>
      {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {success&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" onClick={()=>setSuccess('')}>{success}</div>}
      <section className="flex items-end gap-1.5 rounded-xl bg-white p-2 shadow-sm sm:flex-wrap sm:gap-3 sm:rounded-2xl sm:p-4">
        <label className="w-[76px] shrink-0 text-[10px] font-semibold text-slate-600 sm:w-24 sm:text-xs">Año
          <select value={year} onChange={e=>{
            const nextYear=Number(e.target.value)
            setYear(nextYear)
            setCalendarDate(nextYear+'-01-15')
          }} className={baseInput+' mt-0.5 sm:mt-1'}>
            {Array.from({length:9},(_,i)=>year-4+i).map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-1 text-[10px] font-semibold text-slate-600 sm:max-w-xs sm:text-xs">Operario
          <select value={operatorFilter} onChange={e=>{
              const value=e.target.value
              setOperatorFilter(value)
              setVacationStatusFilter('ALL')
              if(value!=='ALL')setSelectedId(value)
            }}
            className={baseInput+' mt-0.5 sm:mt-1'}>
            <option value="ALL">Todos los operarios</option>
            {operators.map(o=><option key={o.id} value={o.id}>{o.display_name}{o.active?'':' · inactivo'}</option>)}
          </select>
        </label>
        <div className="flex shrink-0 gap-1 print:hidden sm:ml-auto sm:gap-2">
          <button type="button" aria-label="Descargar PDF de la sección para el operario seleccionado"
            title="Descargar PDF con el operario elegido arriba"
            onClick={()=>void exportCurrentPdf()} disabled={busy}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
            <Printer size={15}/>PDF
          </button>
          {tab==='CUADRANTE'&&<button type="button" aria-label="PDF para compartir"
            onClick={()=>void exportCurrentPdf(true)} disabled={busy}
            className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
            <span className="sm:hidden">Compartir</span><span className="hidden sm:inline">PDF para compartir</span>
          </button>}
          {!demo&&<button aria-label="Añadir operario" title="Añadir operario" className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-sm font-semibold text-white sm:px-3" onClick={()=>{setSelectedId('');editOperator(null)}}><Plus size={17}/><span className="hidden sm:inline">Operario</span></button>}
          {!demo&&selected&&operatorFilter!=='ALL'&&<button aria-label="Editar ficha" title="Editar ficha" className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm sm:px-3" onClick={()=>editOperator(selected)}><UserRoundCog size={17}/><span className="hidden sm:inline">Editar ficha</span></button>}
        </div>
      </section>
      <nav className="flex gap-0.5 overflow-x-auto rounded-xl bg-white p-1 shadow-sm print:hidden" aria-label="Secciones del planificador">
        {tabs.filter(t=>!demo||!['NOTAS','HISTORIAL'].includes(t.id)).map(t=><button key={t.id} onClick={()=>setTab(t.id)} title={t.label} aria-current={tab===t.id?'page':undefined} className={'min-h-9 shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm '+(tab===t.id?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100')}><span className="sm:hidden">{t.mobile}</span><span className="hidden sm:inline">{t.label}</span></button>)}
      </nav>

      {tab==='REPORTES'&&hotel?.id&&<StaffReport
        hotelId={hotel.id}
        hotelName={hotel.name??'Hotel'}
        operators={operators}
        initialYear={year}
        selectedOperatorId={operatorFilter}
        pdfRequest={reportPdfRequest}
      />}

      {tab==='CUADRANTE'&&<StaffCalendar
        year={year}
        mode={calendarMode}
        focusDate={calendarFocusDate}
        setMode={setCalendarMode}
        setFocusDate={setCalendarDate}
        operators={operators}
        days={days}
        holidays={holidays}
        operatorId={operatorFilter}
        onYearChange={setYear}
        onEditDay={(operatorId,day)=>{if(!demo)openDay(operatorId,day)}}
      />}

      {tab==='FESTIVOS'&&hotel?.id&&<StaffHolidays
        hotelId={hotel.id}
        operatorId={operatorFilter}
        firstScheduledDates={firstScheduledDates}
        year={year}
        operators={operators}
        days={days}
        holidays={holidays.filter(date=>date.startsWith(String(year))).map(date=>({
          holiday_date:date,label:holidayLabels[date]??'Festivo',
        }))}
        onReload={reload}
        readOnly={demo}
        onEditDay={(operatorId,day)=>{if(!demo){setTab('CUADRANTE');openDay(operatorId,day)}}}
      />}

      {tab==='ANUAL'&&<section className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
          <div><h2 className="text-sm font-bold">Resumen anual · {year}</h2>
            <p className="text-xs text-slate-500">Horas programadas, vacaciones previstas y saldos pendientes.</p></div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {[
            ['Operarios activos',String(filteredOperators.filter(o=>o.active).length)],
            ['Turnos previstos',String(filteredSummary.reduce((v,s)=>v+s.shifts,0))],
            ['Fines de semana previstos',String(filteredSummary.reduce((v,s)=>v+s.total,0))],
          ].map(([label,value])=><div key={label} className="rounded-xl bg-white p-2 shadow-sm sm:rounded-2xl sm:p-4"><p className="text-[10px] leading-tight text-slate-500 sm:text-xs">{label}</p><p className="mt-0.5 text-lg font-bold sm:mt-1 sm:text-2xl">{value}</p></div>)}
        </div>
        <div className="space-y-1.5 md:hidden">
          {filteredSummary.map(s=><div key={s.operator.id} className="rounded-xl bg-white px-3 py-2 shadow-sm">
            <div className="mb-1 text-sm font-bold">{s.operator.display_name}</div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[['Previstas',hours(s.planned)],['Turnos',String(s.shifts)],['F. semana',String(s.total)],
              ['Vacaciones previstas',s.vacation+' d'],['Baja',s.sick+' d'],
               ['H. extra pendientes',hours(Math.max(0,s.cumulativeBalance))]].map(([label,value])=>
                label==='Previstas'
                ? <button type="button" key={label} onClick={()=>openHoursDetail(s.operator.id)}
                    title={'Ver horas previstas por mes de '+s.operator.display_name}
                    aria-label={'Ver desglose mensual de horas previstas de '+s.operator.display_name}
                    className="rounded-md bg-sky-50 px-1 py-1 ring-1 ring-inset ring-sky-200 transition hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
                    <div className="text-[10px] text-sky-700">Previstas <span aria-hidden="true">⌄</span></div>
                    <div className="text-xs font-bold text-sky-900 underline decoration-dotted underline-offset-2">{value}</div>
                  </button>
                : <div key={label} className="rounded-md bg-slate-50 px-1 py-1"><div className="text-[10px] text-slate-500">{label}</div><div className="text-xs font-semibold">{value}</div></div>)}
              <div className="rounded-md bg-slate-50 px-1 py-1">
                <div className="text-[10px] text-slate-500">Bajas médicas sin justificar</div>
                <div className="text-xs">{absenceCount(s.operator.id,'unjustified',s.sickUnjustified)}</div>
              </div>
              <div className="rounded-md bg-slate-50 px-1 py-1">
                <div className="text-[10px] text-slate-500">Faltas no justificadas</div>
                <div className={s.unjustifiedAbsences?'text-xs font-bold text-red-700':'text-xs'}>{absenceCount(s.operator.id,'absence',s.unjustifiedAbsences)}</div>
              </div>
            </div>
          </div>)}
        </div>
        <div className="hidden overflow-x-auto rounded-2xl bg-white p-3 shadow-sm md:block">
          <table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs"><th className="p-3">Operario</th><th>Horas previstas</th><th>Turnos programados</th><th>Fines de semana programados</th><th>Vacaciones previstas</th><th>Días de baja registrados</th><th>Bajas médicas sin justificar</th><th>Faltas no justificadas</th><th>Horas extras pendientes de compensar o abonar</th></tr></thead><tbody>
            {filteredSummary.map(s=><tr key={s.operator.id} className="border-b"><td className="p-3 font-semibold">{s.operator.display_name}</td>
              <td><button type="button" onClick={()=>openHoursDetail(s.operator.id)}
                title={'Ver horas previstas por mes de '+s.operator.display_name}
                aria-label={'Ver desglose mensual de horas previstas de '+s.operator.display_name}
                className="rounded-md px-2 py-1 font-semibold text-sky-800 underline decoration-dotted underline-offset-4 transition hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
                {hours(s.planned)}
              </button></td><td>{s.shifts}</td><td>{s.total}</td><td>{s.vacation} d</td><td>{s.sick} d</td><td>{absenceCount(s.operator.id,'unjustified',s.sickUnjustified)}</td><td className={s.unjustifiedAbsences?'font-bold text-red-700':''}>{absenceCount(s.operator.id,'absence',s.unjustifiedAbsences)}</td><td>{hours(Math.max(0,s.cumulativeBalance))}</td></tr>)}
          </tbody></table>
        </div>
      </section>}

      {tab==='FINES'&&<section className="rounded-xl bg-white p-2 shadow-sm sm:rounded-2xl sm:p-4">
        <h2 className="mb-2 text-sm font-bold sm:text-lg">Fines de semana · {year}</h2>
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">{filteredSummary.map(s=><div key={s.operator.id} className="rounded-lg border px-3 py-2 sm:rounded-xl sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{s.operator.display_name}</span>
            <span className="shrink-0 text-sm font-bold">{num(s.total)} <span className="text-xs font-normal text-slate-500">sem.</span></span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{s.full} fines de semana completos</div>
          <div className="mt-1 max-h-56 divide-y overflow-y-auto">{s.weeks.map(([m,w])=><p key={m} className="py-1 text-xs">S{isoWeek(m)} · {asDisplayDate(m)} · {w.saturday?'Sáb':''}{w.saturday&&w.sunday?' + ':''}{w.sunday?'Dom':''}</p>)}</div>
        </div>)}</div>
      </section>}

      {tab==='EXTRAS'&&<section className="space-y-2 sm:space-y-4">
        {operatorFilter==='ALL'&&<div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
          <h2 className="text-sm font-bold">Horas extras · Todos los operarios</h2>
          <p className="mt-1 text-xs text-slate-600">
            Movimientos del libro de horas. Para añadir o corregir un movimiento, elige un operario arriba.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[550px] text-left text-xs">
              <thead><tr className="border-b bg-slate-50">
                <th className="p-2">Operario</th><th>Generadas</th><th>Recuperadas o programadas</th>
                <th>Abonadas</th><th>Saldo acumulado</th>
              </tr></thead>
              <tbody>{filteredSummary.map(item=><tr key={item.operator.id} className="border-b">
                <td className="p-2 font-semibold">{item.operator.display_name}</td>
                <td>{overtimeCount(item.operator.id,'earned',item.earned)}</td><td>{overtimeCount(item.operator.id,'recovered',item.compensated)}</td>
                <td>{overtimeCount(item.operator.id,'paid',item.paid)}</td><td>{overtimeCount(item.operator.id,'pending',item.cumulativeBalance)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <h3 className="mt-4 text-xs font-bold">Movimientos y fechas</h3>
          <div className="mt-2 max-h-96 overflow-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead><tr className="border-b bg-slate-50">
                <th className="p-2">Operario</th><th>Fecha</th>
                <th>Horas</th><th>Origen</th><th>Fecha de recuperación</th>
              </tr></thead>
              <tbody>{overtime.slice()
                .sort((a,b)=>a.entry_date.localeCompare(b.entry_date)).map(entry=>{
                  const origin=entry.compensates_entry_id
                    ?overtime.find(row=>row.id===entry.compensates_entry_id):null
                  return <tr key={entry.id} className="border-b">
                    <td className="p-2">{operators.find(p=>p.id===entry.operator_id)?.display_name??'—'}</td>
                    <td>{asDisplayDate(entry.entry_date)}</td>
                    <td>{hours(entry.minutes)}</td>
                    <td>{origin?asDisplayDate(origin.entry_date):'—'}</td>
                    <td>{entry.entry_type==='REST_TAKEN'?asDisplayDate(entry.entry_date):'—'}</td>
                  </tr>
                })}</tbody>
            </table>
          </div>
        </div>}
        {operatorFilter!=='ALL'&&selected&&<div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold sm:text-base">Horas extra · {selected.display_name}</h2>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-3 sm:gap-2">
            {([['earned',selectedSummary?.earned??0],['recovered',selectedSummary?.compensated??0],['paid',selectedSummary?.paid??0],['pending',selectedSummary?.cumulativeBalance??0]] as const).map(([n,v])=><div key={n} className="rounded-lg bg-slate-50 px-1 py-2 text-center sm:rounded-xl sm:p-3"><p className="text-[10px] leading-tight text-slate-500 sm:text-xs">{overtimeLabels[n]}</p><p className="mt-0.5 text-xs font-bold sm:mt-1 sm:text-lg">{overtimeCount(selected.id,n,v)}</p></div>)}
          </div>
          <button className="mt-2 w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold md:hidden" onClick={()=>setShowOvertimeForm(v=>!v)} aria-expanded={showOvertimeForm}>{showOvertimeForm?'Cerrar registro':'＋ Nuevo movimiento'}</button>
          <div className={'mt-2 grid grid-cols-2 gap-2 md:mt-4 md:grid-cols-[180px_170px_120px_1fr_auto] md:gap-3 '+(showOvertimeForm?'':'hidden md:grid')}>
            <label className="text-xs">Fecha<input type="date" className={baseInput+' mt-1'} value={overtimeDate} onChange={e=>setOvertimeDate(e.target.value)}/></label>
            <label className="text-xs">Movimiento<select className={baseInput+' mt-1'} value={overtimeType} onChange={e=>setOvertimeType(e.target.value)}>
              <option value="EARNED">Horas generadas</option>{/* El descanso se registra desde el cuadrante y se vincula a horas generadas. */}<option value="PAID">Abonadas</option><option value="ADJUSTMENT_PLUS">Ajuste positivo</option><option value="ADJUSTMENT_MINUS">Ajuste negativo</option>
            </select></label>
            <label className="text-xs">Horas<input type="number" min="0.01" step="0.25" className={baseInput+' mt-1'} value={overtimeHours} onChange={e=>setOvertimeHours(e.target.value)} placeholder="2,5"/></label>
            <label className="col-span-2 text-xs md:col-span-1">Motivo obligatorio<input className={baseInput+' mt-1'} value={overtimeReason} onChange={e=>setOvertimeReason(e.target.value)} placeholder="Urgencia, sustitución, descanso de horas del día…"/></label>
            <button disabled={busy} onClick={()=>void saveOvertime()} className="col-span-2 min-h-9 self-end rounded-lg bg-slate-900 px-4 py-2 text-sm text-white md:col-span-1">Registrar</button>
          </div>
          <div className="mt-2 max-h-[48vh] overflow-auto sm:mt-4"><table className="w-full text-left text-xs"><thead><tr className="border-b bg-slate-50"><th className="p-1.5 text-left">Fecha</th><th className="text-left">Tipo</th><th>Horas</th><th className="text-left">Motivo</th><th className="text-left">Estado</th><th className="text-left">Origen de las horas</th><th className="text-left">Fecha de recuperación</th></tr></thead><tbody>
            {overtime.filter(e=>e.operator_id===selectedId).map(e=><tr key={e.id} className="border-b"><td className="whitespace-nowrap p-1.5">{asDisplayDate(e.entry_date).slice(0,5)}</td><td>{({EARNED:'Generadas',REST_TAKEN:recoveryStatus(e.entry_date),PAID:'Abonadas',ADJUSTMENT_PLUS:'Ajuste +',ADJUSTMENT_MINUS:'Ajuste −'} as Record<string,string>)[e.entry_type]}</td><td>{hours(e.minutes)}</td><td className="max-w-[190px] truncate px-1 text-[11px]" title={e.reason}>{e.reason}</td>
              <td className="px-1">{(()=>{
                if(e.entry_type==='REST_TAKEN')return recoveryStatus(e.entry_date)
                if(!['EARNED','ADJUSTMENT_PLUS'].includes(e.entry_type))return e.entry_type==='PAID'?'Abonado':'Ajuste'
                const taken=overtime.filter(t=>t.compensates_entry_id===e.id&&t.entry_type==='REST_TAKEN')
                  .reduce((sum,t)=>sum+t.minutes,0)
                return taken===0?'Disponible':taken>=e.minutes?'Asignado':'Parcial · '+hours(taken)
              })()}</td>
              <td className="px-1">{(()=>{
                if(e.entry_type!=='REST_TAKEN')return '—'
                const origin=overtime.find(item=>item.id===e.compensates_entry_id)
                return origin?asDisplayDate(origin.entry_date)+' · '+hours(e.minutes):
                  'Sin origen vinculado (histórico)'
              })()}</td>
              <td className="px-1">{(()=>{
                if(e.entry_type==='REST_TAKEN')return asDisplayDate(e.entry_date)
                const dates=overtime.filter(t=>t.compensates_entry_id===e.id&&t.entry_type==='REST_TAKEN')
                  .map(t=>asDisplayDate(t.entry_date))
                return dates.length?dates.join(', '):'—'
              })()}</td></tr>)}
          </tbody></table></div>
          {restAudit&&<div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
            <h3 className="text-sm font-bold text-sky-950">Recuperaciones registradas en el cuadrante · {year}</h3>
            <p className="mt-1 text-xs text-sky-900">
              La fecha del descanso y las horas de origen se obtienen del mismo movimiento
              que descuentan Horas extras, Resumen anual y PDF. Los registros históricos
              no vinculados no se descuentan otra vez.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-xs">
                <thead><tr className="border-b border-sky-200">
                  <th className="p-2">Descanso</th><th className="p-2">Horas recuperadas</th>
                  <th className="p-2">Horas generadas el</th><th className="p-2">Vinculación</th>
                </tr></thead>
                <tbody>{restAudit.restDays.map(day=>{
                  const applied=restAudit.movementsByDay.get(day.id)??[]
                  const past=restAudit.unlinked.find(item=>item.day.id===day.id)
                  return <tr key={day.id} className="border-b border-sky-100">
                    <td className="p-2">{asDisplayDate(day.work_date)}</td>
                    <td className="p-2">{applied.length?hours(applied.reduce((n,e)=>n+e.minutes,0)):'Por comprobar'}</td>
                    <td className="p-2">{applied.length?applied.map(e=>{
                      const origin=e.compensates_entry_id?restAudit.earnedById.get(e.compensates_entry_id):null
                      return origin?asDisplayDate(origin.entry_date)+' ('+hours(e.minutes)+')':'Origen sin localizar'
                    }).join(' + '):'Sin origen identificado'}</td>
                    <td className={'p-2 '+(past?'font-semibold text-amber-900':'text-emerald-800')}>
                      {past?past.historicalMovements.length?'Movimiento antiguo sin enlace':'Pendiente de vincular':'Vinculado'}
                    </td>
                  </tr>
                })}
                </tbody>
              </table>
              {restAudit.restDays.length===0&&<p className="p-2 text-xs text-slate-600">Sin descansos de recuperación en el cuadrante de este año.</p>}
            </div>
            {restAudit.unlinked.length>0&&<p role="status" className="mt-2 text-xs font-semibold text-amber-900">
              {restAudit.unlinked.length} días históricos sin origen vinculado; no se descuentan nuevamente.
              Deben conciliarse con los movimientos anteriores antes de asignarles una fecha de origen.
            </p>}
            {restAudit.issues.length>0&&<p role="alert" className="mt-1 text-xs text-rose-800">
              Hay {restAudit.issues.length} movimientos vinculados con discrepancias por revisar.</p>}
          </div>}
        </div>}
      </section>}

      {tab==='VACACIONES'&&<section className="space-y-2 sm:space-y-3">
        {!demo&&operatorFilter!=='ALL'&&<StaffPeriodEditor kind="VACATION" operators={filteredOperators} operatorId={selectedId}
          start={periodStart} end={periodEnd} busy={busy}
          onOperatorChange={setSelectedId} onStartChange={setPeriodStart}
          onEndChange={setPeriodEnd} onSubmit={()=>void savePeriod('VACATION')}/>}

        <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold sm:text-base">
              Vacaciones · {year}{operatorFilter==='ALL'?' · Todos los operarios':''}
            </h2>
            <button type="button" onClick={()=>setShowVacationSettings(true)} aria-haspopup="dialog"
              className="shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold">
              <Settings2 size={14} className="mr-1 inline"/>Configuración
            </button>
          </div>
          {operatorFilter!=='ALL'&&<>
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
          </>}
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <h3 className="text-sm font-bold">Vacaciones correspondientes · {year}</h3>
          <p className="mt-1 text-xs text-slate-600">
            Vacaciones hasta el 31 de diciembre, calculadas sobre 30 días naturales anuales
            desde el primer día registrado en el cuadrante de {year}, sea turno, descanso o festivo.
            Solo se descuentan las vacaciones de {year} confirmadas como disfrutadas hasta {asDisplayDate(vacationToday)}.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[670px] text-left text-xs">
              <thead><tr className="border-b bg-slate-50">
                <th className="p-2">Trabajador</th>
                <th className="p-2">Primer día del cuadrante</th>
                <th className="p-2">Vacaciones hasta 31 de diciembre</th>
                <th className="p-2">Vacaciones disfrutadas hasta hoy</th>
                <th className="p-2">Vacaciones pendientes de disfrutar</th>
              </tr></thead>
              <tbody>{operators.filter(person=>
                operatorFilter==='ALL'||person.id===operatorFilter)
                .map(person=>{
                  const first=firstDayOfSelectedYear[person.id]??null
                  const entitlement=accruedVacationDays(30,year,year+'-12-31',first)
                  // Do not mix previously carried-over vacations with this year's entitlement.
                  // A past vacation is considered taken only when explicitly confirmed.
                  const confirmed=days.filter(day=>day.operator_id===person.id &&
                    day.work_date.startsWith(String(year)) && day.work_date<=vacationToday &&
                    day.state==='VACATION' && day.vacation_taken_confirmed &&
                    (day.vacation_origin_year===null||day.vacation_origin_year===year)).length
                  const remaining=entitlement===null?null:Math.max(0,Math.round((entitlement-confirmed)*100)/100)
                  return <tr key={person.id} className="border-b align-top">
                    <td className="p-2 font-semibold">{person.display_name}</td>
                    <td className="p-2">{first?asDisplayDate(first):
                      <span className="font-semibold text-amber-800">Sin días en el cuadrante de {year}</span>}</td>
                    <td className="p-2 font-semibold">{formatVacationDays(entitlement)}</td>
                    <td className="p-2">{confirmed} d</td>
                    <td className="p-2 font-bold">{formatVacationDays(remaining)}</td>
                  </tr>
                })}</tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Los días de vacaciones aún programados o pendientes de confirmar no se contabilizan
            como disfrutados. Las vacaciones arrastradas de años anteriores tampoco se descuentan
            del derecho anual mostrado. Los decimales se mantienen sin redondear a días completos.
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
            const scheduledForYear=days.filter(d=>d.operator_id===group.person.id &&
              isVacationState(d.state) && vacationOriginYear(d)===year).length
            const pendingProgram=assignedDays==null?null:assignedDays+assigned!.adjustment_days-scheduledForYear
            const previousYears=[...new Set(group.annual.map(d=>vacationOriginYear(d))
              .filter((v):v is number=>v!==null && v<year))].sort()
            const unknownPrev=group.annual.filter(d=>vacationFromPriorYear(d) && vacationOriginYear(d)===null).length
            return <section key={group.person.id} className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{group.person.display_name}</h3>
                <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold"
                  onClick={()=>{setSelectedId(group.person.id);setOperatorFilter(group.person.id)}}>
                  Ver solo este operario
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
                <span>Disfrute en {year}: <strong>{group.annual.length} d</strong></span>
                <span>Imputados a {year}: <strong>{scheduledForYear} d</strong></span>
                <span>Asignados: <strong>{assignedDays==null?'—':assignedDays+' d'}</strong></span>
                <span>Sin programar de {year}: <strong>{pendingProgram==null?'—':pendingProgram+' d'}</strong></span>
              </div>
              {(previousYears.length>0||unknownPrev>0)&&<div className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">
                {previousYears.map(origin=>{
                  const sourced=group.annual.filter(d=>vacationOriginYear(d)===origin)
                  return <div key={origin}>Vacaciones de <strong>{origin}</strong> disfrutadas/programadas en {year}:
                    <strong> {sourced.length} días</strong> · confirmados: {sourced.filter(d=>d.vacation_taken_confirmed).length}</div>
                })}
                {unknownPrev>0&&<div>{unknownPrev} día(s) de año anterior con origen pendiente de confirmar</div>}
              </div>}

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
                    <p className="mt-1 text-[10px] font-semibold text-emerald-900">
                      {vacationOriginLabel(period.rows[0])} · {period.rows.length} días
                    </p>
                    {splitYear&&<p className="mt-1 rounded-md bg-sky-50 px-2 py-1 text-[10px] text-sky-900">
                      Período continuo · {period.rows.length} días · {splitLabel}
                    </p>}
                    {period.visibleDays.some(day=>vacationStage(day,vacationToday)==='UNVERIFIED')&&
                      <StaffToggleButton disabled={busy}
                        selected={period.visibleDays.filter(d=>vacationStage(d,vacationToday)==='UNVERIFIED')
                          .every(d=>checkedVacationIds.includes(d.id))}
                        onClick={()=>togglePeriodSelection(period.visibleDays.filter(
                          d=>vacationStage(d,vacationToday)==='UNVERIFIED'),'VACATION')}
                        className="mt-2">Seleccionar días pendientes de este período</StaffToggleButton>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {period.visibleDays.map(day=>{
                        const eligible=vacationStage(day,vacationToday)==='UNVERIFIED'
                        return <div key={day.id} className={'inline-flex items-center gap-1 rounded-md border px-1.5 py-1 '+vacationTone(day,vacationToday)}>
                          <StaffToggleButton
                            title={vacationStageLabel(vacationStage(day,vacationToday))}
                            selected={eligible&&checkedVacationIds.includes(day.id)}
                            disabled={busy||!eligible}
                            onClick={()=>toggleChecked(day.id,!checkedVacationIds.includes(day.id),'VACATION')}
                            className="!min-h-6 !px-1 !py-0.5">
                            {asDisplayDate(day.work_date).slice(0,5)}
                            {vacationFromPriorYear(day)&&<span className="ml-1 text-[9px] font-bold">
                              {vacationOriginYear(day)??'año ?'}</span>}
                          </StaffToggleButton>
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

        {operatorFilter!=='ALL'&&selected&&selected.id===operatorFilter&&
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
        {!demo&&operatorFilter!=='ALL'&&<StaffPeriodEditor kind="MEDICAL_LEAVE" operators={filteredOperators} operatorId={selectedId}
          start={periodStart} end={periodEnd} busy={busy}
          onOperatorChange={setSelectedId} onStartChange={setPeriodStart}
          onEndChange={setPeriodEnd} onSubmit={()=>void savePeriod('MEDICAL_LEAVE')}/>}

        <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold sm:text-base">Bajas · {year}</h2>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
            {filteredSummary.map(s=><div key={s.operator.id}
              className="rounded-lg border border-slate-200 p-2 text-left">
              <div className="truncate text-xs font-semibold">{s.operator.display_name}</div>
              <div className="mt-1 text-xl font-bold">{absenceCount(s.operator.id,'sick',s.sick)} <span className="text-xs font-normal">días de baja médica</span></div>
              <div className="mt-1 text-xs font-semibold text-red-700">{absenceCount(s.operator.id,'absence',s.unjustifiedAbsences)} {s.unjustifiedAbsences===1?'falta no justificada':'faltas no justificadas'}</div>
              <div className="mt-1 text-sm font-semibold">{absenceCount(s.operator.id,'other',otherAbsenceDays(s.operator.id).length)} <span className="text-xs font-normal">otras ausencias</span></div>
              <div className="mt-0.5 text-[10px] text-slate-500">{absenceCount(s.operator.id,'documented',s.sickDocumented)} bajas justificadas · {absenceCount(s.operator.id,'unjustified',s.sickUnjustified)} bajas sin justificar · {absenceCount(s.operator.id,'unknown',s.sickUnknown)} bajas por revisar</div>
            </div>)}
          </div>
        </div>
        {operatorFilter!=='ALL'&&selected&&<div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <h3 className="text-sm font-bold sm:text-base">Bajas y ausencias de {selected.display_name}</h3>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ['Bajas médicas','sick',selectedSummary?.sick??0],
              ['Bajas justificadas','documented',selectedSummary?.sickDocumented??0],
              ['Bajas sin justificar','unjustified',selectedSummary?.sickUnjustified??0],
              ['Bajas por revisar','unknown',selectedSummary?.sickUnknown??0],
              ['Otras ausencias','other',otherAbsenceDays(selected.id).length],
              ['Faltas no justificadas','absence',selectedSummary?.unjustifiedAbsences??0],
            ] as const).map(([label,kind,value])=><div key={label} className="rounded-lg bg-slate-50 px-1.5 py-2 text-center">
              <div className="text-[10px] text-slate-500">{label}</div>
              <div className="mt-0.5 text-lg font-bold">{absenceCount(selected.id,kind,value)}</div>
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
              <StaffToggleButton disabled={busy}
                selected={p.rows.every(d=>checkedAbsenceIds.includes(d.id))}
                onClick={()=>togglePeriodSelection(p.rows,'ABSENCE')}
                className="mt-2">Seleccionar período completo</StaffToggleButton>
              <div className="mt-2 flex flex-wrap gap-1.5">{p.rows.map(d=>
                <div key={d.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1">
                  <StaffToggleButton disabled={busy}
                    selected={checkedAbsenceIds.includes(d.id)}
                    onClick={()=>toggleChecked(d.id,!checkedAbsenceIds.includes(d.id),'ABSENCE')}
                    title={'Seleccionar baja del '+asDisplayDate(d.work_date)}
                    className="!min-h-6 !px-2 !py-0.5">
                    {asDisplayDate(d.work_date).slice(0,5)}
                  </StaffToggleButton>
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
            <h4 className="text-xs font-bold">Permisos y faltas</h4>
            {selectedOtherAbsencePeriods.map(p=><details key={p.start} className="border-b py-1.5">
              <summary className="cursor-pointer text-xs">{p.state==='PERMISSION'?(p.rows[0].source_code||stateView(p.state).label):stateView(p.state).label} · {asDisplayDate(p.start)}{p.end!==p.start?' – '+asDisplayDate(p.end):''} · {p.rows.length} d</summary>
              <StaffToggleButton disabled={busy||p.state==='UNJUSTIFIED_ABSENCE'}
                selected={p.rows.every(d=>checkedAbsenceIds.includes(d.id))}
                onClick={()=>togglePeriodSelection(p.rows,'ABSENCE')}
                className="mt-2">Seleccionar período completo</StaffToggleButton>
              <div className="mt-2 flex flex-wrap gap-1.5">{p.rows.map(d=>
                <div key={d.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1">
                  <StaffToggleButton disabled={busy||p.state==='UNJUSTIFIED_ABSENCE'}
                    selected={checkedAbsenceIds.includes(d.id)}
                    onClick={()=>toggleChecked(d.id,!checkedAbsenceIds.includes(d.id),'ABSENCE')}
                    title={'Seleccionar ausencia del '+asDisplayDate(d.work_date)}
                    className="!min-h-6 !px-2 !py-0.5">
                    {asDisplayDate(d.work_date).slice(0,5)}
                  </StaffToggleButton>
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

      <dialog ref={overtimeDialog} onClose={()=>setOvertimeDetail(null)} aria-labelledby="overtime-detail-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-white p-4 shadow-xl backdrop:bg-black/40">
        {overtimeDetail&&<>
          <div className="flex items-start justify-between gap-2">
            <div><h3 id="overtime-detail-title" className="text-sm font-bold">{overtimeLabels[overtimeDetail.kind]}</h3>
              <p className="text-xs text-slate-600">{operators.find(o=>o.id===overtimeDetail.operatorId)?.display_name}</p></div>
            <button type="button" onClick={()=>setOvertimeDetail(null)} className="rounded border px-3 py-1 text-xs">Cerrar</button>
          </div>
          <div className="mt-3 max-h-[60vh] overflow-y-auto">
            {overtimeDetailRows.map(({entry,origin,minutes},index)=><div key={entry.id}>
              {overtimeDetailRows[index-1]?.entry.entry_date!==entry.entry_date&&
                <h4 className="mt-2 border-b pb-1 text-xs font-bold">{asDisplayDate(entry.entry_date)}
                  {overtimeDetail.kind==='recovered'?' · '+recoveryStatus(entry.entry_date):''}</h4>}
              <div className="py-1.5 text-xs">
                <strong>{hours(minutes)}</strong>
                {overtimeDetail.kind==='recovered'||overtimeDetail.kind==='paid'
                  ? <span> · {origin?'Origen '+asDisplayDate(origin.entry_date):'Origen sin vincular'}</span>
                  : minutes<0?<span> · Descuento histórico sin origen vinculado</span>:null}
                {overtimeDetail.kind==='earned'&&overtimeTimeRange(entry.reason)&&<span> · {overtimeTimeRange(entry.reason)}</span>}
                <p className="text-slate-600">{(origin?.reason??entry.reason).replace(/^\d{2}:\d{2}[–-]\d{2}:\d{2}\s*[;·]\s*/, '')}</p>
              </div>
            </div>)}
          </div>
          <p className="mt-3 border-t pt-2 text-sm font-bold">Total · {hours(overtimeDetailRows.reduce((sum,row)=>sum+row.minutes,0))}</p>
        </>}
      </dialog>
      <dialog ref={absenceDialog} onClose={()=>setAbsenceDetail(null)} aria-labelledby="absence-detail-title" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-white p-4 shadow-xl backdrop:bg-black/40">
        {absenceDetail&&<><div className="flex items-start justify-between gap-2"><div><h3 id="absence-detail-title" className="text-sm font-bold">{({sick:'Bajas',other:'Otras ausencias',absence:'Faltas no justificadas',documented:'Bajas justificadas',unjustified:'Bajas sin justificar',unknown:'Bajas por revisar'})[absenceDetail.kind]} · {absenceDetailRows.length} días</h3><p className="text-xs text-slate-600">{operators.find(o=>o.id===absenceDetail.operatorId)?.display_name} · {year}</p></div><button type="button" onClick={()=>setAbsenceDetail(null)} className="rounded border px-3 py-1 text-xs">Cerrar</button></div>
        <div className="mt-3 max-h-[60vh] divide-y overflow-y-auto">{groupConsecutiveDays(absenceDetail.kind==='absence'?absenceDetailRows.map(d=>({...d,justification:'UNJUSTIFIED'})):absenceDetailRows).map(p=><div key={p.start+'-'+p.state+'-'+p.justification} className="py-2 text-xs"><div className="font-semibold">{asDisplayDate(p.start)}{p.end!==p.start?' – '+asDisplayDate(p.end):''} · {p.rows.length} d</div><div className="text-slate-600">{p.state==='PERMISSION'?(p.rows[0].source_code||stateView(p.state).label):stateView(p.state).label} · {p.justification==='DOCUMENTED'?'Justificada':p.justification==='UNJUSTIFIED'?'No justificada':p.justification==='PENDING'?'Pendiente':'Sin verificar'}</div></div>)}</div></>}
      </dialog>
      {tab==='HISTORIAL'&&<section className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Trazabilidad del cuadrante · {year}</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Últimos 200 cambios del año. Incluye altas, cambios y supresiones realizados
          desde el cuadrante, las fichas de vacaciones y las bajas. No se pueden editar aquí.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead><tr className="border-b bg-slate-50">
              {staffHistoryHeadings.map(heading=><th key={heading} scope="col" className="p-2">{heading}</th>)}
            </tr></thead>
            <tbody>{historyRows.map(row=><tr key={row.id} className="border-b">
              {row.cells.map((value,index)=><td key={staffHistoryHeadings[index]} className="p-2">{value}</td>)}
            </tr>)}</tbody>
          </table>
          {historyRows.length===0&&<p className="p-3 text-xs text-slate-500">
            Aún no hay cambios nuevos auditados. El histórico anterior no se ha reconstruido artificialmente.
          </p>}
        </div>
      </section>}

      {tab==='NOTAS'&&operatorFilter==='ALL'&&<section className="max-w-3xl rounded-xl bg-white p-3 shadow-sm">
        <p className="text-sm font-semibold">Observaciones privadas</p>
        <p className="mt-2 text-xs text-slate-600">Selecciona un operario en el filtro superior para consultar o modificar sus observaciones.</p>
      </section>}
      {tab==='NOTAS'&&operatorFilter!=='ALL'&&<section className="max-w-3xl rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
        <h2 className="text-sm font-bold sm:text-base">Observaciones · {selected?.display_name??'operario'}</h2>
        <textarea value={privateNote} onChange={e=>setPrivateNote(e.target.value)} rows={4} className={baseInput+' mt-2'} placeholder="Observaciones administrativas y organizativas, sin diagnósticos ni información médica innecesaria."/>
        <button disabled={busy||!selected} onClick={()=>void saveNote()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Guardar observaciones</button>
      </section>}


      {hoursDetailOperator&&<div role="presentation"
        className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-3 print:hidden"
        onMouseDown={e=>{if(e.target===e.currentTarget)setHoursDetailOperatorId(null)}}>
        <section role="dialog" aria-modal="true"
          aria-label={'Desglose mensual de horas previstas de '+hoursDetailOperator.display_name}
          className={'grid max-h-[88dvh] w-full items-start gap-3 overflow-y-auto sm:overflow-visible '+
            (selectedShiftMonth?'max-w-4xl sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]':'max-w-sm')}>
          <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[88dvh]">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Horas previstas · {year}</h2>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-600">{hoursDetailOperator.display_name}</p>
            </div>
            <button type="button" onClick={()=>setHoursDetailOperatorId(null)}
              aria-label="Cerrar desglose de horas" title="Cerrar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100">
              <X size={18}/>
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 py-3">
            <table className="w-full border-collapse text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2 font-semibold">Mes</th>
                <th className="pb-2 text-right font-semibold">Turnos</th>
                <th className="pb-2 text-right font-semibold">Horas</th>
              </tr></thead>
              <tbody>
                {hoursMonthly.map((row,i)=><tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5 capitalize text-slate-700">{row.month}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">
                    {row.entries.length>0?<button type="button" onClick={()=>setShiftDetailMonth(i)}
                      aria-label={'Ver los '+row.entries.length+' turnos de '+row.month}
                      aria-pressed={shiftDetailMonth===i} aria-controls={selectedShiftMonth?'monthly-shift-details':undefined}
                      className={'min-h-7 min-w-8 rounded px-2 font-semibold underline focus-visible:ring-2 focus-visible:ring-sky-600 '+
                        (shiftDetailMonth===i?'bg-sky-100 text-sky-950':'text-sky-800 hover:bg-sky-50')}>
                      {row.entries.length}
                    </button>:0}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{hours(row.minutes)}</td>
                </tr>)}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-bold">
                <td className="rounded-l-lg px-2 py-2">TOTAL {year}</td>
                <td className="py-2 text-right tabular-nums">{hoursMonthlyShifts}</td>
                <td className="rounded-r-lg py-2 pr-2 text-right tabular-nums text-sky-900">{hours(hoursMonthlyTotal)}</td>
              </tr></tfoot>
            </table>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Horas previstas según el cuadrante del año seleccionado. No equivalen a horas realmente trabajadas o verificadas.
            </p>
          </div>
          <div className="shrink-0 border-t border-slate-200 p-3 text-right">
            <button type="button" onClick={()=>setHoursDetailOperatorId(null)}
              className="min-h-9 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
              Cerrar
            </button>
          </div>
          </div>
          {selectedShiftMonth&&<section ref={shiftDetailsPanel} id="monthly-shift-details"
            aria-labelledby="monthly-shift-title"
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[88dvh]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="monthly-shift-title" className="text-base font-bold text-slate-900">
                  Turnos de {selectedShiftMonth.month} · {year}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {hoursDetailOperator.display_name} · {selectedShiftMonth.entries.length} turnos · {hours(selectedShiftMonth.minutes)}
                </p>
              </div>
              <button type="button" onClick={()=>setShiftDetailMonth(null)} aria-label="Cerrar turnos del mes"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100">
                <X size={18}/>
              </button>
            </div>
            <div key={shiftDetailMonth} className="min-h-0 overflow-y-auto px-4 py-3">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500">
                  <th scope="col" className="pb-2">Fecha</th>
                  <th scope="col" className="pb-2">Turno</th>
                  <th scope="col" className="pb-2 text-right">Horas</th>
                </tr></thead>
                <tbody>{selectedShiftMonth.entries.map(entry=><tr key={entry.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2 tabular-nums">{asDisplayDate(entry.work_date)}</td>
                  <td className="py-2 pr-2">{splitShiftLabel(entry.start_time,entry.end_time)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{hours(plannedMinutes(entry))}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>}
        </section>
      </div>}
      {showOperatorForm&&<div role="presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-2 sm:p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setShowOperatorForm(false)}}>
        <section role="dialog" aria-modal="true" aria-label="Editar operario" className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-3 shadow-xl sm:rounded-2xl sm:p-5">
          <h2 className="text-lg font-bold">Ficha del operario</h2>
          <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-3">
            <label className="block text-xs font-medium">Nombre del operario<input className={baseInput+' mt-1'} value={name} onChange={e=>setName(e.target.value)}/></label>
            <label className="block text-xs font-medium">Jornada objetivo semanal (horas)<input type="number" min="0" max="100" step="0.25" className={baseInput+' mt-1'} value={weeklyHours} onChange={e=>setWeeklyHours(e.target.value)}/></label>
            <label className="block text-xs font-medium">Participación en fines de semana<select className={baseInput+' mt-1'} value={rotation} onChange={e=>setRotation(e.target.value as typeof rotation)}>
              <option value="NORMAL">Rotación habitual</option><option value="EXCEPTIONAL">Cobertura excepcional</option><option value="NONE">Fuera de rotación</option></select></label>
            <label className="block text-xs font-medium">Fecha de alta contractual
              <input type="date" className={baseInput+' mt-1'} value={joinDate}
                onChange={e=>setJoinDate(e.target.value)}/>
              <span className="mt-1 block text-[11px] text-slate-500">
                Necesaria para calcular vacaciones devengadas. No se deduce del primer turno.
              </span>
            </label>
            <label className="block text-xs font-medium">ID de cuenta Arias Suite (opcional)<input className={baseInput+' mt-1'} value={userId} onChange={e=>setUserId(e.target.value)} placeholder="UUID · para acceso personal"/></label>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            {selected&&<button disabled={busy} onClick={()=>void changeActive(selected)} className="rounded-lg border border-orange-300 px-3 py-2 text-xs text-orange-800">{selected.active?'Desactivar (conservar historial)':'Reactivar'}</button>}
            <div className="ml-auto flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setShowOperatorForm(false)}>Cancelar</button><button disabled={busy||!name.trim()} onClick={()=>void saveOperator()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Guardar</button></div>
          </div>
        </section>
      </div>}
      {showVacationSettings&&<div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-3"
        onMouseDown={e=>{if(e.target===e.currentTarget)setShowVacationSettings(false)}}>
        <section role="dialog" aria-modal="true" aria-labelledby="agreement-title"
          className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><h2 id="agreement-title" className="text-base font-bold">Vacaciones según convenio</h2>
              <p className="mt-1 text-xs text-slate-600">Comparación informativa hasta el 31/12/{year}. Los 30 días aprobados por dirección no cambian.</p>
            </div>
            <button type="button" onClick={()=>setShowVacationSettings(false)}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">Cerrar</button>
          </div>
          <div className="mt-4 rounded-xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs">Elegir operarios ({agreementOperators.length})</strong>
              <div className="flex gap-2">
                <button type="button" onClick={()=>setAgreementOperatorIds(null)}
                  className="rounded border bg-white px-2 py-1 text-xs">Todos</button>
                <button type="button" onClick={()=>setAgreementOperatorIds([])}
                  className="rounded border bg-white px-2 py-1 text-xs">Limpiar</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{operators.map(person=>
              <StaffToggleButton key={person.id}
                selected={agreementOperatorIds===null||agreementOperatorIds.includes(person.id)}
                onClick={()=>setAgreementOperatorIds(previous=>{
                  const current=previous??operators.map(p=>p.id)
                  return current.includes(person.id)?current.filter(id=>id!==person.id):
                    [...current,person.id]
                })}>{person.display_name}</StaffToggleButton>)}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs">
            <thead><tr className="border-b bg-slate-100">
              <th className="p-2">Operario</th><th className="p-2">Primer día del cuadrante</th>
              <th className="p-2">Devengadas · 30 días</th>
              <th className="p-2">Devengadas · 31 días convenio</th>
            </tr></thead>
            <tbody>{agreementOperators.map(person=>{
              const origin=firstDayOfSelectedYear[person.id]??null
              return <tr key={person.id} className="border-b">
                <td className="p-2 font-semibold">{person.display_name}</td>
                <td className="p-2">{origin?asDisplayDate(origin):'Sin días en el año'}</td>
                <td className="p-2">{formatVacationDays(accruedVacationDays(30,year,year+'-12-31',origin))}</td>
                <td className="p-2 font-semibold text-sky-900">{formatVacationDays(accruedVacationDays(31,year,year+'-12-31',origin))}</td>
              </tr>
            })}</tbody>
          </table>
          {agreementOperators.length===0&&<p className="p-3 text-xs text-slate-500">Selecciona los operarios que quieras consultar.</p>}
          </div>
          <p className="mt-3 text-xs text-slate-500">Comparativa de devengo, no saldo disponible.
            Se toma el primer día registrado en el cuadrante del año mostrado, aunque sea descanso o festivo.
            Activar la comparación no aprueba 31 días ni modifica registros.</p>
        </section>
      </div>}
      {dayEditor&&<div role="presentation" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-2 sm:p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setDayEditor(null)}}>
        <section role="dialog" aria-modal="true" aria-label="Editar jornada" className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-3 shadow-xl sm:rounded-2xl sm:p-5">
          <h2 className="font-bold">Editar jornada · {asDisplayDate(dayEditor.work_date)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{operators.find(o=>o.id===dayEditor.operator_id)?.display_name}</p>
          <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-3">
            <label className="block text-xs font-medium">Estado<select className={baseInput+' mt-1'} value={dayEditor.state} onChange={e=>setDayEditor({...dayEditor,state:e.target.value,justification:dayEditor.state==='UNJUSTIFIED_ABSENCE'?'UNKNOWN':dayEditor.justification})}>{staffStateOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            {dayEditor.state==='SHIFT'&&<div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Horario previsto</p>
              <div role="group" aria-label="Elegir turno previsto" className="grid grid-cols-2 gap-1.5">
                {shiftPresets.map(preset=>{
                  const active=!customShiftTime&&
                    normalizeDigitalTime(dayEditor.start_time)===preset.start&&
                    normalizeDigitalTime(dayEditor.end_time)===preset.end
                  return <button type="button" key={preset.label} aria-pressed={active}
                    onClick={()=>{setCustomShiftTime(false);setDayEditor({...dayEditor,
                      start_time:preset.start,end_time:preset.end})}}
                    className={'min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition '+
                      (active?'border-sky-600 bg-sky-100 text-sky-900 ring-1 ring-sky-500':
                        'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                    {preset.label}
                  </button>
                })}
                <button type="button" aria-pressed={customShiftTime}
                  onClick={()=>setCustomShiftTime(true)}
                  className={'min-h-10 rounded-lg border px-2 text-xs font-semibold '+
                    (customShiftTime?'border-sky-600 bg-sky-100 text-sky-900':
                      'border-slate-200 text-slate-700')}>Otro horario</button>
              </div>
              {customShiftTime&&<div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-2">
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
              <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                Horas previstas calculadas: <strong>{
                  validDigitalTime(normalizeDigitalTime(dayEditor.start_time))&&
                  validDigitalTime(normalizeDigitalTime(dayEditor.end_time))
                    ? hours(minutesInShift(normalizeDigitalTime(dayEditor.start_time),
                        normalizeDigitalTime(dayEditor.end_time)))
                    : 'Revisa el horario'
                }</strong>
              </p>
            </div>}
            {dayEditor.state==='SHIFT'&&isSplitShift(normalizeDigitalTime(dayEditor.start_time),
              normalizeDigitalTime(dayEditor.end_time))&&<p className="rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
              Turno partido: <strong>09:00–13:00 y 15:00–19:00</strong>.
              Pausa de 13:00 a 15:00 no trabajada. <strong>8 h previstas</strong>.
            </p>}
            {dayEditor.state==='PUBLIC_HOLIDAY'&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-2">
              <label className="block text-xs font-semibold">Festivo pendiente del trabajador
                <select className={baseInput+' mt-1'} value={dayEditor.holiday_source_date}
                  onChange={e=>setDayEditor({...dayEditor,holiday_source_date:e.target.value})}>
                  <option value="">Escoger festivo…</option>
                  {selectableHolidays.sort().map(date=>{
                    const assigned=usedHolidays.has(dayEditor.operator_id+'|'+date)
                    return <option key={date} value={date} disabled={assigned&&date!==dayEditor.holiday_source_date}>
                      {asDisplayDate(date)} · {holidayLabels[date]??'Festivo'} · {assigned?'Asignado':'Disponible'}
                    </option>
                  })}
                </select>
              </label>
              <p className="mt-1 text-xs text-amber-900">
                <strong>{holidayPendingCount} festivos sin asignar</strong> de este trabajador.
                {dayEditor.holiday_source_date&&
                  ' El festivo de este día también figura en el selector para poder editarlo; no es un festivo pendiente adicional.'}
                {' '}El cuadrante mostrará F y la fecha elegida.
              </p>
              {holidayUsageForDay.length>1&&<p role="alert" className="mt-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs font-bold text-rose-900">
                Este festivo aparece {holidayUsageForDay.length} veces para este trabajador:
                {' '}{holidayUsageForDay.map(d=>asDisplayDate(d.work_date)).join(', ')}.
                Revisa cuál corresponde antes de guardar.
              </p>}
            </div>}
            {dayEditor.state==='COMP_REST'&&<div className="rounded-lg border border-sky-300 bg-sky-50 p-3">
              <h3 className="text-sm font-semibold text-sky-950">Repartir horas para descansar la jornada completa</h3>
              <p className="mt-1 text-xs text-sky-900">Jornada a compensar: <strong>{hours(dayEditor.target_minutes)}</strong>.
                Selecciona uno o varios registros pendientes. Solo se descontará la parte necesaria de cada uno.</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div>Saldo disponible: <strong>{hours(restGlobalAvailable)}</strong></div><div>Saldo tras selección: <strong>{hours(restGlobalAvailable-restAllocated)}</strong></div></div>
              <div className="mt-3 space-y-2">
                {earnedEntries.map(entry=>{
                  const chosen=dayEditor.comp_allocations[entry.id]??0
                  const available=Math.max(0,Math.min(entry.remaining-chosen,restGlobalAvailable-restAllocated))
                  return <div key={entry.id} className="rounded-lg border border-sky-200 bg-white p-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span><strong>{asDisplayDate(entry.entry_date)}</strong> · {entry.reason}</span>
                      <span className="shrink-0 font-semibold">{hours(entry.remaining)} disponibles</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" disabled={restRemaining<=0||available<=0}
                        onClick={()=>{
                          const use=Math.min(restRemaining,available)
                          if(use<=0)return
                          setDayEditor(prev=>prev?{...prev,comp_allocations:{
                            ...prev.comp_allocations,[entry.id]:(prev.comp_allocations[entry.id]??0)+use,
                          }}:prev)
                        }}
                        className="rounded-md bg-sky-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                        Añadir {hours(Math.min(Math.max(restRemaining,0),available))}
                      </button>
                      {chosen>0&&<span className="text-xs font-semibold text-sky-950">Seleccionadas: {hours(chosen)}</span>}
                      {chosen>0&&<button type="button" className="ml-auto rounded-md border px-2 py-1 text-xs"
                        onClick={()=>setDayEditor(prev=>{
                          if(!prev)return prev
                          const next={...prev.comp_allocations};delete next[entry.id]
                          return {...prev,comp_allocations:next}
                        })}>Quitar</button>}
                    </div>
                  </div>
                })}
                {earnedEntries.length===0&&<p className="text-xs text-amber-800">
                  No hay horas generadas identificadas disponibles para elegir.</p>}
              </div>
              <div role="status" aria-live="polite" className={'mt-3 rounded-lg p-3 text-xs font-semibold '+
                (restRemaining===0?'bg-emerald-100 text-emerald-950':'bg-amber-100 text-amber-950')}>
                Has seleccionado {hours(restAllocated)} de {hours(dayEditor.target_minutes)}.
                {restRemaining>0?' Faltan '+hours(restRemaining)+'; escoge horas de otro día.':
                  restRemaining===0?' Jornada cubierta. Puedes guardar.':' Has excedido la jornada.'}
              </div>
              <p className="mt-2 text-xs text-sky-950">Ejemplo: si hay 10 h disponibles y necesitas 8 h,
                se descuentan 8 h y quedan 2 h para otro día.</p>
            </div>}
            {isVacationState(dayEditor.state)&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
              <label className="mb-2 block text-xs font-medium">Año al que corresponden las vacaciones
                <input type="number" inputMode="numeric" min="2000"
                  max={Number(dayEditor.work_date.slice(0,4))}
                  value={dayEditor.vacation_origin_year}
                  onChange={e=>setDayEditor({...dayEditor,vacation_origin_year:e.target.value})}
                  className={baseInput+' mt-1'} placeholder="Año de origen por confirmar"/>
              </label>
              <p className="mb-2 text-[11px] text-emerald-900">
                Ejemplo: disfrutadas en enero de 2027 pero correspondientes a 2026.
              </p>
              <StaffToggleButton selected={dayEditor.vacation_taken_confirmed}
                disabled={dayEditor.work_date>dateISO(new Date())}
                onClick={()=>setDayEditor({...dayEditor,vacation_taken_confirmed:!dayEditor.vacation_taken_confirmed})}>
                Confirmar vacaciones disfrutadas
              </StaffToggleButton>
              <p className="mt-1 text-[11px] text-emerald-900">Las fechas pasadas sin confirmar no cuentan como disfrutadas. Solo se pueden confirmar días de hoy o anteriores.</p>
            </div>}
            {dayEditor.state==='UNJUSTIFIED_ABSENCE'&&<p className="text-xs font-medium text-red-800">Justificación: No justificada</p>}
            {['MEDICAL_LEAVE','PERMISSION'].includes(dayEditor.state)&&
              <label className="block text-xs">Justificación<select className={baseInput+' mt-1'} value={dayEditor.justification} onChange={e=>setDayEditor({...dayEditor,justification:e.target.value})}>
                <option value="UNKNOWN">Sin verificar</option><option value="PENDING">Pendiente</option><option value="DOCUMENTED">Documentada</option><option value="UNJUSTIFIED">No justificada</option></select></label>}
          </div>
          {dayEditorError&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{dayEditorError}</p>}
          <div className="mt-3 flex justify-end gap-2 sm:mt-5"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setDayEditor(null)}>Cancelar</button><button disabled={busy||(dayEditor.state==='COMP_REST'&&restRemaining!==0)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={()=>void saveDay()}>Guardar jornada</button></div>
        </section>
      </div>}
    </div>
  </main>
}
