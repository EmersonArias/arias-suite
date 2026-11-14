import { supabase } from '../../lib/supabase'
import type { StaffDay } from './staffModel'

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
