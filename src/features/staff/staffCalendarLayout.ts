import { addDays, fromISO, mondayOf, stateView, isVacationState, vacationCode, vacationTone, isSplitShift, type StaffDay, type StaffOperator } from './staffModel'

export function calendarPeople(operators:StaffOperator[],operatorId:string) {
  return operatorId==='ALL'?operators.filter(operator=>operator.active):operators.filter(operator=>operator.id===operatorId)
}

export const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const pad = (v: number) => String(v).padStart(2, '0')

export function calendarMonth(year: number, month: number) {
  const first = year + '-' + pad(month + 1) + '-01'
  const start = mondayOf(first)
  const last = new Date(year, month + 1, 0, 12).getDate()
  const count = Math.ceil((last + (fromISO(first).getDay() + 6) % 7) / 7) * 7
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export function entryTone(entry?:StaffDay) {
  if (!entry) return stateView('UNASSIGNED').tone
  return isVacationState(entry.state) ? vacationTone(entry) : stateView(entry.state).tone
}

// Show the actual assigned hours for work shifts; other states retain one-letter codes.
function compactShiftHours(entry: StaffDay) {
  if (!entry.start_time || !entry.end_time) return '–'
  if (isSplitShift(entry.start_time,entry.end_time))return '9–13\n15–19'
  const format = (time: string) => {
    const [hour, minute] = time.slice(0, 5).split(':')
    if (!hour || !minute) return '–'
    return String(Number(hour)) + (minute === '00' ? '' : ':' + minute)
  }
  return format(entry.start_time) + '–' + format(entry.end_time)
}
export function holidayRef(entry: StaffDay) {
  const source = entry.source_code ?? ''
  const match = source.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) return match[3] + '/' + match[2]
  const direct = source.match(/^(\d{2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i)
  if (direct) {
    const months: Record<string,string> = {ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',
      jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'}
    return direct[1] + '/' + months[direct[2].toLowerCase()]
  }
  return null
}
function recoveryRef(entry: StaffDay) {
  const match = entry.source_code?.match(/^R\s*(\d{2}[-/]\d{2})/i)
  return match ? 'R' + match[1].replace('-', '/') : null
}
export function dayCode(entry?: StaffDay) {
  if (!entry) return '–'
  if (entry.state === 'SHIFT') return compactShiftHours(entry)
  if (isVacationState(entry.state)) return vacationCode(entry)
  if (entry.state === 'PUBLIC_HOLIDAY') return holidayRef(entry) ? 'F\n' + holidayRef(entry) : 'F'
  if (entry.state === 'COMP_REST') return recoveryRef(entry) ? 'R\n' + recoveryRef(entry)!.slice(1) : 'R'
  const codes: Record<string, string> = {
    REST: 'D',
    VACATION: 'V',
    VACATION_PREVIOUS: 'A',
    MEDICAL_LEAVE: 'B',
    PUBLIC_HOLIDAY: 'F',
    PERMISSION: 'P',
    PERSONAL_DAY: 'L',
    COMP_REST: 'C',
    TRAINING: 'E',
    UNJUSTIFIED_ABSENCE: 'I',
    OTHER: 'O',
    UNASSIGNED: '–',
  }
  return codes[entry.state] ?? 'R'
}

export const legend: { state: string; code: string; text: string }[] = [
  { state: 'SHIFT', code: '9–13/15–19', text: 'Turno partido (8 h)' },
  { state: 'REST', code: 'D', text: 'Descanso' },
  { state: 'VACATION', code: 'V', text: 'Programadas' },
  { state: 'VACATION_PREVIOUS', code: 'A25', text: 'Vac. de 2025 (A26: 2026)' },
  { state: 'MEDICAL_LEAVE', code: 'B', text: 'Baja' },
  { state: 'PUBLIC_HOLIDAY', code: 'F', text: 'Festivo disfrutado (con fecha)' },
  { state: 'COMP_REST', code: 'R', text: 'Recuperable' },
]

