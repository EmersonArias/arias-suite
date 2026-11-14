import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays, dateISO, fromISO, isoWeek, mondayOf, stateView,
  type StaffDay, type StaffOperator,
} from './staffModel'

type CalendarMode = 'DIA' | 'SEMANA' | 'MES' | 'ANO'

type Props = {
  year: number
  operators: StaffOperator[]
  days: StaffDay[]
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

function dayKind(entry?: StaffDay) {
  if (!entry) return 'UNASSIGNED'
  return entry.state
}

// Show the actual assigned hours for work shifts; other states retain one-letter codes.
function compactShiftHours(entry: StaffDay) {
  if (!entry.start_time || !entry.end_time) return '–'
  const format = (time: string) => {
    const [hour, minute] = time.slice(0, 5).split(':')
    if (!hour || !minute) return '–'
    return String(Number(hour)) + (minute === '00' ? '' : ':' + minute)
  }
  return format(entry.start_time) + '–' + format(entry.end_time)
}
function dayCode(entry?: StaffDay) {
  if (!entry) return '–'
  if (entry.state === 'SHIFT') return compactShiftHours(entry)
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
    if (compact) return start.slice(0, 2) + '–' + end.slice(0, 2)
    return start + '–' + end
  }
  if (entry.state === 'REST') return compact ? 'D' : 'Descanso'
  if (entry.state === 'VACATION') return compact ? 'V' : 'Vacaciones'
  if (entry.state === 'VACATION_PREVIOUS') return compact ? 'VA' : 'Vac. anteriores'
  if (entry.state === 'MEDICAL_LEAVE') return compact ? 'B' : 'Baja'
  if (entry.state === 'COMP_REST') return compact ? 'C' : 'Recuperación de horas'
  if (entry.state === 'PUBLIC_HOLIDAY') return compact ? 'F' : 'Festivo'
  if (entry.state === 'PERSONAL_DAY') return compact ? 'AP' : 'Asuntos propios'
  if (entry.state === 'PERMISSION') return compact ? 'P' : 'Permiso'
  if (entry.state === 'TRAINING') return compact ? 'Fo' : 'Formación'
  if (entry.state === 'UNJUSTIFIED_ABSENCE') return compact ? '!' : 'Ausencia'
  return compact ? '?' : stateView(entry.state).label
}

const legend: { state: string; code: string; text: string }[] = [
  { state: 'SHIFT', code: '9–19', text: 'Horario' },
  { state: 'REST', code: 'D', text: 'Descanso' },
  { state: 'VACATION', code: 'V', text: 'Vacaciones' },
  { state: 'VACATION_PREVIOUS', code: 'A', text: 'Vac. anteriores' },
  { state: 'MEDICAL_LEAVE', code: 'B', text: 'Baja' },
  { state: 'PUBLIC_HOLIDAY', code: 'F', text: 'Festivo' },
  { state: 'COMP_REST', code: 'C', text: 'Recuperación' },
]

export default function StaffCalendar({ year, operators, days, operatorId, onYearChange, onEditDay }: Props) {
  const [mode, setMode] = useState<CalendarMode>('MES')
  const [focusDate, setFocusDate] = useState(dateISO(new Date()))
  const today = dateISO(new Date())
  const month = Number(focusDate.slice(5, 7)) - 1
  const visiblePeople = useMemo(
    () => operatorId === 'ALL' ? operators.filter(o => o.active) : operators.filter(o => o.id === operatorId),
    [operators, operatorId],
  )
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

  function chooseDay(day: string) {
    if (visiblePeople.length === 1) {
      onEditDay(visiblePeople[0].id, day)
    } else {
      setFocusDate(day)
      if (Number(day.slice(0, 4)) !== year) onYearChange(Number(day.slice(0, 4)))
      setMode('DIA')
    }
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

  function monthPanel(calendarYear: number, calendarMonthIndex: number, mini: boolean) {
    const dates = calendarMonth(calendarYear, calendarMonthIndex)
    return <section key={calendarYear + '-' + calendarMonthIndex} className={mini ? 'rounded-xl border border-slate-200 p-2' : ''}>
      {mini && <button type="button" className="mb-1 w-full rounded-md px-1 py-1 text-left text-sm font-bold hover:bg-slate-100"
        onClick={() => { setFocusDate(calendarYear + '-' + pad(calendarMonthIndex + 1) + '-15'); setMode('MES') }}>
        {monthNames[calendarMonthIndex]}
      </button>}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {weekdays.map((wd, i) => <div key={wd} className={'py-1 text-center text-[10px] font-semibold ' + (i > 4 ? 'text-rose-600' : 'text-slate-500')}>{wd}</div>)}
        {dates.map(day => {
          const inMonth = Number(day.slice(5, 7)) === calendarMonthIndex + 1 && Number(day.slice(0, 4)) === calendarYear
          if (!inMonth) return <div key={day} className="rounded bg-slate-50/50" aria-hidden="true" />
          const entry = visiblePeople.length === 1 ? entryFor(visiblePeople[0], day) : undefined
          const tone = visiblePeople.length === 1 ? stateView(dayKind(entry)).tone : 'bg-slate-50 text-slate-700'
          const persons = visiblePeople.length === 1 ? [] : visiblePeople
          return <button key={day} type="button" onClick={() => chooseDay(day)}
            aria-label={day + (visiblePeople.length === 1 ? ' · ' + visiblePeople[0].display_name + ' · ' + dayShort(entry) : ' · Ver operarios')}
            title={day + (visiblePeople.length === 1 ? ' · ' + dayShort(entry) : '')}
            className={'flex min-w-0 flex-col overflow-hidden rounded-md border px-0.5 text-left transition hover:ring-2 hover:ring-sky-500 ' +
              (mini ? 'min-h-10 py-0.5 sm:min-h-11' : 'min-h-[74px] py-1 sm:min-h-[100px] sm:px-1') + ' ' +
              (day === today ? 'border-sky-500 ring-1 ring-sky-400 ' : 'border-transparent ') + tone}>
            <span className={'text-[10px] font-bold ' + (mini ? 'leading-3' : 'sm:text-xs')}>{Number(day.slice(8))}</span>
            {visiblePeople.length === 1 ?
              <span className={'mt-auto w-full truncate text-center font-semibold ' + (mini ? 'text-[7px] leading-3 tracking-tighter' : 'text-[9px] tracking-tight sm:text-xs')}>
                {dayCode(entry)}
              </span> :
              <span className={'mt-0.5 flex w-full flex-col gap-px ' + (mini ? 'gap-px' : 'gap-0.5')}>
                {persons.map(person => {
                  const item = entryFor(person, day)
                  return <span key={person.id}
                    title={person.display_name + ': ' + dayShort(item)}
                    className={'block w-full truncate rounded-[3px] px-px text-center font-semibold ' +
                      (mini ? 'text-[6px] leading-[8px] tracking-tighter' : 'text-[8px] leading-[13px] tracking-tight sm:text-[10px] sm:leading-4') +
                      ' ' + stateView(dayKind(item)).tone}>
                    {dayCode(item)}
                  </span>
                })}
              </span>}
          </button>
        })}
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
          <span className={'min-w-[112px] max-w-[60%] rounded-md px-2 py-2 text-center text-xs font-semibold ' + stateView(dayKind(entry)).tone}>
            {dayShort(entry)}{entry?.actual_confirmed ? ' ✓' : ''}
          </span>
        </button>
      })}
    </div>}

    {!noPeople && mode === 'SEMANA' && <div className="mt-2 grid gap-1.5 lg:grid-cols-7">
      {weekDays.map(day => <div key={day} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 p-1.5 lg:block lg:p-2">
        <div className="w-14 shrink-0 text-center lg:mb-2 lg:w-full">
          <div className="text-[10px] font-semibold text-slate-500">{fromISO(day).toLocaleDateString('es-ES', { weekday: 'short' })}</div>
          <div className="text-sm font-bold">{Number(day.slice(8))}</div>
        </div>
        <div className={'grid min-w-0 flex-1 gap-1 ' + (visiblePeople.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-1')}>
          {visiblePeople.map(person => {
            const entry = entryFor(person, day)
            return <button type="button" key={person.id} onClick={() => onEditDay(person.id, day)}
              aria-label={person.display_name + ', ' + day + ': ' + dayShort(entry)}
              className={'min-w-0 truncate rounded-md px-1 py-1.5 text-center text-[10px] font-semibold lg:text-xs ' + stateView(dayKind(entry)).tone}>
              <span className="block truncate text-[11px] font-bold tracking-tight sm:text-xs">{dayCode(entry)}</span>
            </button>
          })}
        </div>
      </div>)}
    </div>}

    {!noPeople && mode === 'MES' && <div className="mt-2">{monthPanel(year, month, false)}</div>}

    {!noPeople && mode === 'ANO' && <div className={'mt-2 grid gap-2 ' + (visiblePeople.length === 1 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
      {monthNames.map((_, index) => monthPanel(year, index, true))}
    </div>}
    <div className="mt-2 border-t border-slate-100 pt-1.5">
      {visiblePeople.length > 1 && <p className="mb-1 text-[9px] leading-3 text-slate-500">
        Orden de las casillas: {visiblePeople.map((person, index) => (index + 1) + ' ' + person.display_name).join(' · ')}
      </p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5" aria-label="Leyenda de estados del calendario">
        {legend.map(item => <span key={item.state} className="inline-flex items-center gap-0.5 whitespace-nowrap text-[9px] leading-3 text-slate-600">
          <span className={'inline-flex h-3 min-w-3 items-center justify-center rounded-[2px] px-0.5 text-[8px] font-bold ' + stateView(item.state).tone}>{item.code}</span>{item.text}
        </span>)}
      </div>
    </div>
  </section>
}
