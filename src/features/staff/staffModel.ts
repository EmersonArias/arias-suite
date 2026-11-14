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
};
export type StaffOvertime = {
  id: string; hotel_id: string; operator_id: string; entry_date: string;
  entry_type: string; minutes: number; reason: string; confirmed: boolean;
};
export type StaffVacation = {
  id: string; hotel_id: string; operator_id: string; year: number;
  entitlement_days: number | null; carryover_days: number;
  adjustment_days: number;
};
export type StaffNote = { operator_id: string; hotel_id: string; content: string; };
export const staffStateOptions = [
  { value: 'SHIFT', label: 'Turno', tone: 'bg-emerald-100 text-emerald-800' },
  { value: 'REST', label: 'Descanso', tone: 'bg-rose-100 text-rose-800' },
  { value: 'VACATION', label: 'Vacaciones', tone: 'bg-sky-100 text-sky-800' },
  { value: 'VACATION_PREVIOUS', label: 'Vac. año anterior', tone: 'bg-blue-100 text-blue-800' },
  { value: 'MEDICAL_LEAVE', label: 'Baja médica', tone: 'bg-slate-200 text-slate-800' },
  { value: 'PERSONAL_DAY', label: 'Asuntos propios', tone: 'bg-amber-100 text-amber-900' },
  { value: 'PERMISSION', label: 'Permiso', tone: 'bg-amber-100 text-amber-900' },
  { value: 'COMP_REST', label: 'Descanso compensatorio', tone: 'bg-fuchsia-100 text-fuchsia-800' },
  { value: 'PUBLIC_HOLIDAY', label: 'Festivo', tone: 'bg-violet-100 text-violet-800' },
  { value: 'TRAINING', label: 'Formación', tone: 'bg-teal-100 text-teal-800' },
  { value: 'UNJUSTIFIED_ABSENCE', label: 'Ausencia no justificada', tone: 'bg-red-200 text-red-900' },
  { value: 'OTHER', label: 'Otro / por revisar', tone: 'bg-orange-100 text-orange-800' },
  { value: 'UNASSIGNED', label: 'Sin asignar', tone: 'bg-slate-100 text-slate-500' },
] as const;
export function stateView(state: string) {
  return staffStateOptions.find((item) => item.value === state) ?? staffStateOptions[staffStateOptions.length - 1];
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
export function minutesInShift(start: string, end: string) {
  const parse = (s:string) => { const [h,m]=s.split(':').map(Number); return h*60+m; };
  const a=parse(start),b=parse(end);return (b-a+1440)%1440;
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
