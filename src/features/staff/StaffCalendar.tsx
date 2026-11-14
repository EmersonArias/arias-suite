import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays, dateISO, fromISO, isoWeek, mondayOf, stateView,
  isVacationState, vacationCode, vacationStageLabel, vacationStage, vacationTone,
  vacationOriginLabel, isSplitShift, splitShiftLabel,
  type StaffDay, type StaffOperator,
} from './staffModel'

type CalendarMode = 'DIA' | 'SEMANA' | 'MES' | 'ANO'

type Props = {
  year: number
  operators: StaffOperator[]
  days: StaffDay[]
  holidays: string[]
  operatorId: string
  onYearChange: (value: number) => void
  onEditDay: (operatorId: string, date: string) => void
}

const views: { id: CalendarMode; title: string }[] = [
  { id: 'DIA', title: 'Día' },
  { id: 'SEMANA', title: 'Semana' },
  { id: 'MES', title: 'Mes' },
  { id: 'ANO', title: 'Año' },
]

const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pad = (v: number) => String(v).padStart(2, '0')

function calendarMonth(year: number, month: number) {
  const first = year + '-' + pad(month + 1) + '-01'
  const start = mondayOf(first)
  const last = new Date(year, month + 1, 0, 12).getDate()
  const count = Math.ceil((last + (fromISO(first).getDay() + 6) % 7) / 7) * 7
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

function entryTone(entry?:StaffDay) {
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
function holidayRef(entry: StaffDay) {
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
function dayCode(entry?: StaffDay) {
  if (!entry) return '–'
  if (entry.state === 'SHIFT') return compactShiftHours(entry)
  if (isVacationState(entry.state)) return vacationCode(entry)
  if (entry.state === 'PUBLIC_HOLIDAY') return holidayRef(entry) ?? 'F'
  if (entry.state === 'COMP_REST') return recoveryRef(entry) ?? 'R'
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
    OTHER: 'R',
    UNASSIGNED: '–',
  }
  return codes[entry.state] ?? 'R'
}

function dayShort(entry?: StaffDay, compact = false) {
  if (!entry) return '—'
  if (entry.state === 'SHIFT') {
    const start = entry.start_time?.slice(0, 5) ?? '—'
    const end = entry.end_time?.slice(0, 5) ?? '—'
    if (compact) return isSplitShift(start,end) ? '9–13 / 15–19' : start.slice(0, 2) + '–' + end.slice(0, 2)
    return isSplitShift(start,end) ? splitShiftLabel(start,end) + ' · 8 h' : start + '–' + end
  }
  if (entry.state === 'REST') return compact ? 'D' : 'Descanso'
  if (isVacationState(entry.state)) {
    if (compact) return vacationCode(entry)
    return vacationOriginLabel(entry) + ' · ' + vacationStageLabel(vacationStage(entry))
  }
  if (entry.state === 'MEDICAL_LEAVE') return compact ? 'B' : 'Baja'
  if (entry.state === 'COMP_REST') return compact ? dayCode(entry) : 'Recuperación de horas' + (entry.source_code ? ' (' + entry.source_code + ')' : '')
  if (entry.state === 'PUBLIC_HOLIDAY') return compact ? dayCode(entry) : 'Festivo disfrutado' + (holidayRef(entry) ? ' (' + holidayRef(entry) + ')' : '')
  if (entry.state === 'PERSONAL_DAY') return compact ? 'AP' : 'Asuntos propios'
  if (entry.state === 'PERMISSION') return compact ? 'P' : 'Permiso'
  if (entry.state === 'TRAINING') return compact ? 'Fo' : 'Formación'
  if (entry.state === 'UNJUSTIFIED_ABSENCE') return compact ? '!' : 'Ausencia'
  return compact ? '?' : stateView(entry.state).label
}

const legend: { state: string; code: string; text: string }[] = [
  { state: 'SHIFT', code: '9–13/15–19', text: 'Turno partido (8 h)' },
  { state: 'REST', code: 'D', text: 'Descanso' },
  { state: 'VACATION', code: 'V', text: 'Programadas' },
  { state: 'VACATION_PREVIOUS', code: 'A25', text: 'Vac. de 2025 (A26: 2026)' },
  { state: 'MEDICAL_LEAVE', code: 'B', text: 'Baja' },
  { state: 'PUBLIC_HOLIDAY', code: '15/08', text: 'Festivo disfrutado' },
  { state: 'COMP_REST', code: 'R', text: 'Recuperable' },
]

export default function StaffCalendar({ year, operators, days, holidays, operatorId, onYearChange, onEditDay }: Props) {
  const [mode, setMode] = useState<CalendarMode>('MES')
  const [focusDate, setFocusDate] = useState(dateISO(new Date()))
  const today = dateISO(new Date())
  const month = Number(focusDate.slice(5, 7)) - 1
  const visiblePeople = useMemo(
    () => operatorId === 'ALL' ? operators.filter(o => o.active) : operators.filter(o => o.id === operatorId),
    [operators, operatorId],
  )
  const officialHolidaySet = useMemo(() => new Set(holidays), [holidays])
  const entries = useMemo(() => new Map(days.map(d => [d.operator_id + '|' + d.work_date, d])), [days])
  const entryFor = (person: StaffOperator, day: string) => entries.get(person.id + '|' + day)

  useEffect(() => {
    setFocusDate(prev => prev.slice(0, 4) === String(year) ? prev : year + '-01-15')
  }, [year])

  function navigateBy(amount: number) {
    if (mode === 'ANO') {
      onYearChange(year + amount)
      setFocusDate((year + amount) + '-01-15')
      return
    }
    const target = fromISO(focusDate)
    if (mode === 'DIA') target.setDate(target.getDate() + amount)
    else if (mode === 'SEMANA') target.setDate(target.getDate() + amount * 7)
    else target.setMonth(target.getMonth() + amount, 15)
    const next = dateISO(target)
    setFocusDate(next)
    if (target.getFullYear() !== year) onYearChange(target.getFullYear())
  }


  function goToToday() {
    setFocusDate(today)
    if (Number(today.slice(0, 4)) !== year) onYearChange(Number(today.slice(0, 4)))
  }

  const visibleDay = fromISO(focusDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const weekStart = mondayOf(focusDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekLabel = 'Semana ' + isoWeek(focusDate) + ' · ' +
    fromISO(weekStart).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' – ' +
    fromISO(weekDays[6]).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  const periodLabel = mode === 'DIA' ? visibleDay :
    mode === 'SEMANA' ? weekLabel : mode === 'MES' ? monthNames[month] + ' ' + year : String(year)

  // One fixed, readable operator-name column in every weekly row.
  // This keeps identities visible in weekly, monthly and yearly views.
  function weekMatrix(week: string[], mini: boolean, inMonth?: number) {
    const gridStyle = {gridTemplateColumns:'minmax(58px, 1.2fr) repeat(7, minmax(0, 1fr))'}
    return <div key={week[0]} className="min-w-0 overflow-hidden rounded-lg border border-slate-200">
      <div className="grid items-center gap-px bg-slate-100 p-px" style={gridStyle}>
        <div className="truncate bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
          S{isoWeek(week[0])}
        </div>
        {week.map((day,i)=>{
          const outside = inMonth !== undefined && Number(day.slice(5,7)) !== inMonth+1
          const officialHoliday = officialHolidaySet.has(day) && !outside
          return <div key={day}
            title={officialHoliday ? 'Festivo del calendario · ' + day : undefined}
            className={'min-w-0 py-0.5 text-center text-[9px] font-semibold ' +
              (outside?'bg-slate-100 text-slate-300':officialHoliday?'bg-blue-700 text-white':i>4?'text-rose-600':'text-slate-600')}>
            {weekdays[i]} {Number(day.slice(8))}
          </div>
        })}
      </div>
      <div className="divide-y divide-slate-100">
        {visiblePeople.map(person=><div key={person.id} className="grid items-stretch gap-px bg-white p-px" style={gridStyle}>
          <div className={'flex min-w-0 items-center truncate bg-slate-50 px-1 font-semibold text-slate-800 '+
            (mini?'text-[9px]':'text-[10px] sm:text-xs')} title={person.display_name}>{person.display_name}</div>
          {week.map(day=>{
            const outside = inMonth !== undefined && Number(day.slice(5,7)) !== inMonth+1
            const entry=entryFor(person,day)
            return outside ? <span key={day} className="bg-slate-50" /> :
              <button type="button" key={day} onClick={()=>onEditDay(person.id,day)}
                title={person.display_name+' · '+day+' · '+dayShort(entry)}
                aria-label={person.display_name+', '+day+': '+dayShort(entry)}
                className={'flex min-h-6 min-w-0 items-center justify-center overflow-hidden rounded-sm px-px text-center font-bold tracking-tighter hover:ring-1 hover:ring-sky-500 '+
                  (mini?'text-[8px] leading-[10px]':'text-[9px] leading-[10px] sm:min-h-8 sm:text-[11px]')+
                  (entry?.state==='SHIFT' && isSplitShift(entry.start_time,entry.end_time) ? ' min-h-8 ' : ' ')+entryTone(entry)}>
                <span className={'block max-w-full '+(entry?.state==='SHIFT' && isSplitShift(entry.start_time,entry.end_time)
                  ? 'whitespace-pre-line leading-[10px]' : 'truncate')}>{dayCode(entry)}</span>
              </button>
          })}
        </div>)}
      </div>
    </div>
  }

  function monthPanel(calendarYear: number, calendarMonthIndex: number, mini: boolean) {
    const dates=calendarMonth(calendarYear,calendarMonthIndex)
    const weeks=Array.from({length:dates.length/7},(_,i)=>dates.slice(i*7,i*7+7))
    return <section key={calendarYear+'-'+calendarMonthIndex}
      className={'min-w-0 '+(mini?'rounded-xl border border-slate-200 p-1.5 sm:p-2':'')}>
      {mini&&<button type="button" className="mb-1 w-full rounded-md px-1 py-1 text-left text-xs font-bold hover:bg-slate-100 sm:text-sm"
        onClick={()=>{setFocusDate(calendarYear+'-'+pad(calendarMonthIndex+1)+'-15');setMode('MES')}}>{monthNames[calendarMonthIndex]}</button>}
      <div className={'space-y-1 '+(mini?'':'sm:space-y-1.5')}>
        {weeks.map(week=>weekMatrix(week,mini,calendarMonthIndex))}
      </div>
    </section>
  }

  const noPeople = visiblePeople.length === 0
  return <section className="rounded-xl bg-white p-2 shadow-sm sm:rounded-2xl sm:p-4">
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Vista del calendario">
        {views.map(v => <button key={v.id} type="button" onClick={() => setMode(v.id)}
          aria-pressed={mode === v.id}
          className={'min-h-9 rounded-md px-1 text-xs font-semibold sm:text-sm ' +
            (mode === v.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white')}>{v.title}</button>)}
      </div>
      <div className="flex items-center justify-between gap-1">
        <button type="button" className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border"
          onClick={() => navigateBy(-1)} aria-label="Período anterior"><ChevronLeft size={18}/></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-xs font-bold sm:text-base">{periodLabel}</div>
          {mode === 'DIA' && officialHolidaySet.has(focusDate) &&
            <span className="inline-block rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">Festivo del calendario</span>}
          {mode === 'MES' && <select aria-label="Elegir mes" className="mt-0.5 max-w-[150px] bg-transparent text-center text-[11px] text-slate-500"
            value={month} onChange={event => setFocusDate(year + '-' + pad(Number(event.target.value) + 1) + '-15')}>
            {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>}
          {(mode === 'DIA' || mode === 'SEMANA') && <input aria-label="Ir a fecha" type="date"
            className="mt-0.5 max-w-[150px] bg-transparent text-center text-[11px] text-slate-500"
            value={focusDate} onChange={event => {
              if (!event.target.value) return
              setFocusDate(event.target.value)
              if (Number(event.target.value.slice(0, 4)) !== year) onYearChange(Number(event.target.value.slice(0, 4)))
            }} />}
        </div>
        <button type="button" className="min-h-9 shrink-0 rounded-lg border px-2 text-xs"
          onClick={goToToday} title="Volver a la fecha actual">Hoy</button>
        <button type="button" className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border"
          onClick={() => navigateBy(1)} aria-label="Período siguiente"><ChevronRight size={18}/></button>
      </div>
    </div>

    {noPeople && <p className="p-4 text-center text-sm text-slate-500">Selecciona un operario para ver el calendario.</p>}

    {!noPeople && mode === 'DIA' && <div className="mt-2 space-y-1">
      {visiblePeople.map(person => {
        const entry = entryFor(person, focusDate)
        return <button key={person.id} type="button" onClick={() => onEditDay(person.id, focusDate)}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-left hover:bg-slate-50">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.display_name}</span>
          <span className={'min-w-[112px] max-w-[60%] rounded-md px-2 py-2 text-center text-xs font-semibold ' + entryTone(entry)}>
            {dayShort(entry)}{entry?.state==='SHIFT' && entry.actual_confirmed ? ' ✓' : ''}
          </span>
        </button>
      })}
    </div>}

    {!noPeople && mode === 'SEMANA' && <div className="mt-2">{weekMatrix(weekDays,false)}</div>}

    {!noPeople && mode === 'MES' && <div className="mt-2">{monthPanel(year, month, false)}</div>}

    {!noPeople && mode === 'ANO' && <div className="mt-2 grid gap-2 lg:grid-cols-2">
      {monthNames.map((_, index) => monthPanel(year, index, true))}
    </div>}
    <div className="mt-2 border-t border-slate-100 pt-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5" aria-label="Leyenda de estados del calendario">
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[9px] text-slate-600">
          <span className="rounded-sm bg-emerald-600 px-0.5 font-bold text-white">V</span> Disfrutadas
        </span>
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[9px] text-slate-600">
          <span className="rounded-sm bg-emerald-100 px-0.5 font-bold text-emerald-950 ring-1 ring-inset ring-amber-500">V?</span> Pasadas por confirmar
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] text-slate-600">
          <span className="h-3 w-3 rounded-sm bg-blue-700" aria-hidden="true"/>Cabecera azul: festivo del calendario
        </span>
        {legend.map(item => <span key={item.state} className="inline-flex items-center gap-0.5 whitespace-nowrap text-[9px] leading-3 text-slate-600">
          <span className={'inline-flex h-3 min-w-3 items-center justify-center rounded-[2px] px-0.5 text-[8px] font-bold ' + stateView(item.state).tone}>{item.code}</span>{item.text}
        </span>)}
      </div>
    </div>
  </section>
}
