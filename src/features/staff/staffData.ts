import { supabase } from '../../lib/supabase'
import { vacationOriginYear, type StaffDay } from './staffModel'

type DayScope = {
  hotelId?: string
  operatorId?: string
  startDate: string
  endDate: string
}

// Fetch every page. PostgREST enforces a maximum row count per request;
// a single select silently truncates an annual multi-operator calendar.
export async function loadAllStaffDays(scope: DayScope) {
  const all: StaffDay[] = []
  const pageSize = 500
  for (let offset = 0; offset < 100000; offset += pageSize) {
    let request = supabase
      .from('staff_schedule_entries')
      .select('*')
      .gte('work_date', scope.startDate)
      .lte('work_date', scope.endDate)
    if (scope.hotelId) request = request.eq('hotel_id', scope.hotelId)
    if (scope.operatorId) request = request.eq('operator_id', scope.operatorId)
    const result = await request
      .order('work_date', { ascending: true })
      .order('operator_id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (result.error) return { data: [] as StaffDay[], error: result.error }
    const page = (result.data ?? []) as StaffDay[]
    all.push(...page)
    if (page.length < pageSize) return { data: all, error: null }
  }
  return { data: [] as StaffDay[], error: new Error('Demasiados registros. Acota el período.') }
}

export type StaffPeriod = {
  start: string
  end: string
  state: string
  justification: string
  rows: StaffDay[]
}

export function groupConsecutiveDays(entries: StaffDay[]): StaffPeriod[] {
  const sorted = [...entries].sort((a,b)=>a.work_date.localeCompare(b.work_date))
  const periods: StaffPeriod[] = []
  for (const day of sorted) {
    const last = periods[periods.length - 1]
    // Keep different absence types / justification levels separated.
    if (last && last.state === day.state && last.justification === day.justification &&
        toFollowingDate(last.end) === day.work_date) {
      last.end = day.work_date
      last.rows.push(day)
    } else {
      periods.push({start:day.work_date,end:day.work_date,state:day.state,
        justification:day.justification,rows:[day]})
    }
  }
  return periods
}
/** Agrupa por continuidad y por año de procedencia, aunque el estado pase de V a V anterior en enero. */
export function groupVacationPeriods(entries:StaffDay[]):StaffPeriod[] {
  const sorted=[...entries].sort((a,b)=>a.work_date.localeCompare(b.work_date))
  const periods:StaffPeriod[]=[]
  for(const day of sorted){
    const last=periods[periods.length-1]
    if(last && toFollowingDate(last.end)===day.work_date &&
      vacationOriginYear(last.rows[0])===vacationOriginYear(day)){
      last.end=day.work_date
      last.rows.push(day)
    } else {
      periods.push({start:day.work_date,end:day.work_date,state:day.state,
        justification:day.justification,rows:[day]})
    }
  }
  return periods
}

function toFollowingDate(value:string) {
  const date = new Date(value+'T12:00:00')
  date.setDate(date.getDate()+1)
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
