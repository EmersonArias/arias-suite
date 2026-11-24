export type StaffOperator = {
  id: string; hotel_id: string; display_name: string; linked_user_id: string | null;
  active: boolean; rotation_type: 'NORMAL' | 'EXCEPTIONAL' | 'NONE';
  weekly_target_minutes: number | null; join_date: string | null;
};
export type StaffDay = {
  id: string; hotel_id: string; operator_id: string; work_date: string;
  state: string; start_time: string | null; end_time: string | null;
  planned_minutes: number | null; actual_minutes: number | null;
  actual_confirmed: boolean; justification: string;
  source_kind: string; source_code: string | null;
  vacation_origin_year: number | null;
  holiday_source_date: string | null;
  comp_source_entry_id: string | null;
  comp_rest_minutes: number | null;
  vacation_taken_confirmed: boolean;
  vacation_confirmed_at: string | null;
  vacation_confirmed_by: string | null;
};
/** Referencia histórica (ISO o 08-dic) de un festivo disfrutado. */
export function staffHolidayOrigin(day:StaffDay): string|null {
  if(day.state!=='PUBLIC_HOLIDAY')return null
  if(day.holiday_source_date)return day.holiday_source_date
  const source=day.source_code??''
  const iso=source.match(/\d{4}-\d{2}-\d{2}/)
  if(iso)return iso[0]
  const named=source.match(/^(\d{2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i)
  if(!named)return null
  const month:Record<string,string>={ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'}
  return day.work_date.slice(0,4)+'-'+month[named[2].toLowerCase()]+'-'+named[1]
}
export type StaffOvertime = {
  id: string; hotel_id: string; operator_id: string; entry_date: string;
  entry_type: string; minutes: number; reason: string; confirmed: boolean;
  compensates_entry_id: string | null; linked_schedule_entry_id: string | null;
};
export type StaffVacation = {
  id: string; hotel_id: string; operator_id: string; year: number;
  entitlement_days: number | null; carryover_days: number;
  adjustment_days: number;
};
export type StaffNote = { operator_id: string; hotel_id: string; content: string; };
export const staffStateOptions = [
  { value: 'SHIFT', label: 'Turno', tone: 'bg-white text-slate-800' },
  { value: 'REST', label: 'Descanso', tone: 'bg-red-200 text-red-900' },
  { value: 'VACATION', label: 'Vacaciones', tone: 'bg-emerald-200 text-emerald-950' },
  { value: 'VACATION_PREVIOUS', label: 'Vac. año anterior', tone: 'bg-emerald-200 text-emerald-950' },
  { value: 'MEDICAL_LEAVE', label: 'Baja', tone: 'bg-fuchsia-200 text-fuchsia-950' },
  { value: 'PERSONAL_DAY', label: 'Asuntos propios', tone: 'bg-amber-100 text-amber-900' },
  { value: 'PERMISSION', label: 'Permiso', tone: 'bg-amber-100 text-amber-900' },
  { value: 'COMP_REST', label: 'Recuperación de horas', tone: 'bg-sky-200 text-sky-950' },
  { value: 'PUBLIC_HOLIDAY', label: 'Festivo disfrutado', tone: 'bg-amber-300 text-amber-950' },
  { value: 'TRAINING', label: 'Formación', tone: 'bg-teal-100 text-teal-800' },
  { value: 'UNJUSTIFIED_ABSENCE', label: 'Ausencia no justificada', tone: 'bg-red-200 text-red-900' },
  { value: 'OTHER', label: 'Otro / por revisar', tone: 'bg-orange-100 text-orange-800' },
  { value: 'UNASSIGNED', label: 'Sin asignar', tone: 'bg-slate-100 text-slate-500' },
] as const;
export function stateView(state: string) {
  return staffStateOptions.find((item) => item.value === state) ?? staffStateOptions[staffStateOptions.length - 1];
}

export type VacationStage = 'TAKEN' | 'UPCOMING' | 'UNVERIFIED';
export function isVacationState(state: string) {
  return state === 'VACATION' || state === 'VACATION_PREVIOUS';
}
/** Nunca inferir disfrute por el paso del tiempo. */
export function vacationStage(day: StaffDay, today = dateISO(new Date())): VacationStage {
  if (day.vacation_taken_confirmed) return 'TAKEN';
  return day.work_date < today ? 'UNVERIFIED' : 'UPCOMING';
}
export function vacationStageLabel(stage: VacationStage) {
  return stage === 'TAKEN' ? 'Disfrutadas' : stage === 'UNVERIFIED' ? 'Pasadas por confirmar' : 'Pendientes de disfrutar';
}
export function vacationTone(day: StaffDay, today = dateISO(new Date())) {
  const stage = vacationStage(day,today);
  return stage === 'TAKEN' ? 'bg-emerald-600 text-white' :
    stage === 'UNVERIFIED' ? 'bg-emerald-100 text-emerald-950 ring-1 ring-inset ring-amber-500' :
    'bg-emerald-200 text-emerald-950';
}
/** NULL in a previous-vacation entry means the accounting origin is unknown; do not guess. */
export function vacationOriginYear(day: StaffDay): number | null {
  if(!isVacationState(day.state))return null
  if(day.vacation_origin_year !== null && day.vacation_origin_year !== undefined)
    return day.vacation_origin_year
  return day.state === 'VACATION_PREVIOUS' ? null : Number(day.work_date.slice(0,4))
}
export function vacationFromPriorYear(day: StaffDay) {
  const origin=vacationOriginYear(day)
  return day.state==='VACATION_PREVIOUS' ||
    (origin!==null && origin<Number(day.work_date.slice(0,4)))
}
export function vacationOriginLabel(day: StaffDay) {
  const origin=vacationOriginYear(day)
  if(origin===null)return 'Vacaciones anteriores · año de origen por confirmar'
  return origin < Number(day.work_date.slice(0,4))
    ? 'Vacaciones correspondientes a '+origin+' (año anterior)'
    : 'Vacaciones correspondientes a '+origin
}
export function vacationCode(day: StaffDay, today = dateISO(new Date())) {
  const origin=vacationOriginYear(day)
  const prefix=vacationFromPriorYear(day)
    ? 'A'+(origin===null?'':String(origin).slice(2))
    : 'V'
  return prefix+(vacationStage(day,today)==='UNVERIFIED'?'?':'')
}

export function dateISO(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function fromISO(value: string) { return new Date(value + 'T12:00:00'); }
export function addDays(value: string, delta: number) {
  const d = fromISO(value); d.setDate(d.getDate()+delta); return dateISO(d);
}
export function mondayOf(value: string) {
  const d=fromISO(value); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dateISO(d);
}
export function isWeekend(value: string) { return fromISO(value).getDay()===0 || fromISO(value).getDay()===6; }
export function isoWeek(value: string) {
  const d = fromISO(value); const day=(d.getDay()+6)%7; d.setDate(d.getDate()+3-day);
  const jan4=new Date(d.getFullYear(),0,4,12); const offset=(jan4.getDay()+6)%7;
  return 1+Math.round((d.getTime()-jan4.getTime()+offset*86400000)/(7*86400000));
}
/** El turno 09:00–19:00 es partido: pausa no trabajada de 13:00 a 15:00. */
export function isSplitShift(start?:string|null,end?:string|null) {
  return start?.slice(0,5)==='09:00' && end?.slice(0,5)==='19:00'
}
export function splitShiftLabel(start?:string|null,end?:string|null) {
  if(isSplitShift(start,end))return '09:00–13:00 / 15:00–19:00'
  return (start?.slice(0,5)??'—')+'–'+(end?.slice(0,5)??'—')
}
/** Minutos de trabajo planificado, sin la pausa de dos horas del turno partido. */
export function minutesInShift(start: string, end: string) {
  const parse = (s:string) => { const [h,m]=s.split(':').map(Number); return h*60+m; };
  const a=parse(start),b=parse(end);
  const elapsed=(b-a+1440)%1440
  return Math.max(0,elapsed-(isSplitShift(start,end)?120:0))
}
/** El cuadrante calcula automáticamente las horas previstas; nunca son horas de fichaje. */
export function plannedMinutes(day: StaffDay): number {
  if(day.state!=='SHIFT')return 0
  if(day.start_time && day.end_time) {
    const calculated=minutesInShift(day.start_time,day.end_time)
    if(Number.isFinite(calculated) && calculated>0)return calculated
  }
  return day.planned_minutes??0
}
export function hours(minutes: number | null | undefined) {
  return ((minutes ?? 0)/60).toLocaleString('es-ES',{maximumFractionDigits:2})+' h';
}
export function weekendHistory(days: StaffDay[], year: number) {
  const byPerson = new Map<string,Map<string,{ saturday:boolean; sunday:boolean; confirmed:boolean }>>();
  for(const day of days) {
    if (day.work_date.slice(0,4)!==String(year) || day.state!=='SHIFT' || !isWeekend(day.work_date))continue;
    let dates=byPerson.get(day.operator_id);if(!dates){dates=new Map();byPerson.set(day.operator_id,dates);}
    const saturday=fromISO(day.work_date).getDay()===6;
    const weekStart=mondayOf(day.work_date);
    const current=dates.get(weekStart)??{saturday:false,sunday:false,confirmed:true};
    if(saturday) current.saturday=true;else current.sunday=true;
    current.confirmed=current.confirmed&&day.actual_confirmed;
    dates.set(weekStart,current);
  }
  return byPerson;
}

/** Mismo filtro para las celdas y los contadores del informe. */
export function matchesStaffState(state: string, filter: string) {
  return filter === 'ALL' || (filter === 'VACATION' ? isVacationState(state) : state === filter)
}
export function staffReportDaysForOperator(days: StaffDay[], operatorId: string, filter: string) {
  return days.filter(day => day.operator_id === operatorId && matchesStaffState(day.state, filter))
}
