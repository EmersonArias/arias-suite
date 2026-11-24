import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'

type Candidate = {
  hotel_id: string
  source_version: string
  source_sheet: string
  source_row: number
  maintenance_name: string | null
  source_apparatus_id: number
  apparatus_registry_id: string | null
  apparatus_code: string | null
  apparatus_name: string | null
  plant: string | null
  location: string | null
  plan_year: number
  mark_code: string
  action_name: string | null
  definition_status: 'CONFIRMED' | 'REVIEW' | 'UNKNOWN'
  mark_count: number
  month_count: number
  months: number[] | null
  week_slots: number[] | null
  derived_periodicity_unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'VARIABLE' | null
  derived_periodicity_value: number | null
}

type Task = {
  key: string
  apparatusId: string
  code: string
  name: string
  plant: string | null
  location: string | null
  mark: string
  action: string
  unit: Candidate['derived_periodicity_unit']
  value: number | null
  byMonth: Record<number, number[]>
  sources: string[]
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const ACTIONS: Record<string,string> = {
  F:'Ficha de revisión',
  L:'Limpieza',
  LF:'Limpieza de filtros',
  RG:'Revisión general',
  EXT:'Mantenimiento externo',
  E:'Engrase',
  DE:'Dosificar encimas',
  CP:'Control de presiones',
}

function actionLabel(mark: string, name: string | null) {
  return name || ACTIONS[mark] || 'Acción PAM ' + mark
}

function periodicityLabel(unit: Task['unit'], value: number | null) {
  if (unit === 'WEEK') return 'Semanal'
  if (unit === 'MONTH') {
    if (value === 1) return 'Mensual'
    if (value === 2) return 'Bimestral'
    if (value === 3) return 'Trimestral'
    if (value === 4) return 'Cuatrimestral'
    if (value === 6) return 'Semestral'
    return value ? 'Cada ' + value + ' meses' : 'Mensual'
  }
  if (unit === 'YEAR') return 'Anual'
  if (unit === 'DAY') return value ? 'Cada ' + value + ' días' : 'Diaria'
  return 'Según PAM'
}

function mergeCandidates(rows: Candidate[]) {
  const map = new Map<string, Task>()
  for (const row of rows) {
    if (!row.apparatus_registry_id || !row.apparatus_code) continue
    const key = row.apparatus_registry_id + '|' + row.mark_code
    const task = map.get(key) ?? {
      key,
      apparatusId: row.apparatus_registry_id,
      code: row.apparatus_code,
      name: row.apparatus_name || 'Activo',
      plant: row.plant,
      location: row.location,
      mark: row.mark_code,
      action: actionLabel(row.mark_code, row.action_name),
      unit: row.derived_periodicity_unit,
      value: row.derived_periodicity_value,
      byMonth: {},
      sources: [],
    }
    for (const month of row.months ?? []) {
      const weeks = task.byMonth[month] ?? []
      for (const week of row.week_slots ?? []) if (!weeks.includes(week)) weeks.push(week)
      weeks.sort((a,b) => a-b)
      task.byMonth[month] = weeks
    }
    if (row.maintenance_name && !task.sources.includes(row.maintenance_name)) task.sources.push(row.maintenance_name)
    map.set(key, task)
  }
  return Array.from(map.values()).sort((a,b) =>
    a.code.localeCompare(b.code,'es') || a.action.localeCompare(b.action,'es'),
  )
}

export default function PlanningPage() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [hotelId, setHotelId] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function hotel() {
    if (hotelId) return hotelId
    const { data, error: assignmentError } = await supabase
      .from('user_hotel_roles')
      .select('hotel_id')
      .eq('active', true)
      .order('hotel_id')
      .limit(1)
      .maybeSingle()
    if (assignmentError || !data?.hotel_id) throw new Error(assignmentError?.message || 'No se ha podido determinar el hotel activo.')
    setHotelId(data.hotel_id)
    return data.hotel_id
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const id = await hotel()
      const [a,b] = await Promise.all([
        supabase.from('pam_plan_candidates')
          .select('hotel_id,source_version,source_sheet,source_row,maintenance_name,source_apparatus_id,apparatus_registry_id,apparatus_code,apparatus_name,plant,location,plan_year,mark_code,action_name,definition_status,mark_count,month_count,months,week_slots,derived_periodicity_unit,derived_periodicity_value')
          .eq('hotel_id', id).eq('plan_year', year),
        supabase.from('pam_source_unresolved')
          .select('source_apparatus_id')
          .eq('hotel_id', id).eq('plan_year', year),
      ])
      if (a.error) throw new Error(a.error.message)
      if (b.error) throw new Error(b.error.message)
      setCandidates((a.data ?? []) as Candidate[])
      setUnresolvedCount((b.data ?? []).length)
    } catch (e) {
      setCandidates([])
      setUnresolvedCount(0)
      setError(e instanceof Error ? e.message : 'No se ha podido cargar la planificación.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [year])

  const tasks = useMemo(() => mergeCandidates(candidates), [candidates])
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es')
    if (!q) return tasks
    return tasks.filter(t => [t.code,t.name,t.action,t.mark,t.plant,t.location,...t.sources].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(q))
  }, [tasks, search])

  const assets = useMemo(() => {
    const map = new Map<string,{id:string;code:string;name:string;plant:string|null;location:string|null;tasks:Task[]}>()
    for (const task of filtered) {
      const g = map.get(task.apparatusId) ?? {id:task.apparatusId,code:task.code,name:task.name,plant:task.plant,location:task.location,tasks:[]}
      g.tasks.push(task)
      map.set(task.apparatusId,g)
    }
    return Array.from(map.values())
  }, [filtered])

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-[1650px]">
        <div className="mb-3 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 sm:h-11" />
              <div>
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Planificación anual</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Activos y tareas preventivas · fuente PAM</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <BackButton onBack={() => navigate('/')} />
              <HomeButton onHome={() => navigate('/')} />
              <label className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs sm:col-span-1">
                <CalendarDays size={15} className="text-slate-500" />
                <span className="font-semibold text-slate-600">Año</span>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent font-semibold text-slate-800 outline-none">
                  {[currentYear-1,currentYear,currentYear+1,currentYear+2].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <IconButton icon={RefreshCw} label="Actualizar" title="Actualizar" onClick={() => void load()} disabled={loading} />
            </div>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          {[
            ['Activos', assets.length],
            ['Preventivos', tasks.length],
            ['Marcas PAM', candidates.reduce((n,r) => n + r.mark_count, 0)],
            ['Pendientes de definir', unresolvedCount],
          ].map(([label,value]) => (
            <div key={String(label)} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-3 rounded-2xl bg-white p-2 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar activo, ubicación o preventivo…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">Planificación {year}</div>
            <div className="mt-0.5 text-xs text-slate-500">Cada fila es un activo y cada preventivo aparece debajo. El texto antiguo del PAM se conserva solo como origen.</div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-400">Cargando planificación…</div>
          ) : assets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-sm font-semibold text-slate-600">No hay planificación cargada para {year}.</div>
              <div className="mt-1 text-xs text-slate-400">El selector cambia el año de la fuente PAM, no muestra otro año automáticamente.</div>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-auto">
                <table className="w-full min-w-[1220px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="sticky left-0 z-20 w-[240px] border-r border-slate-200 bg-slate-50 px-3 py-3 text-left">Activo</th>
                      <th className="sticky left-[240px] z-20 w-[230px] border-r border-slate-200 bg-slate-50 px-3 py-3 text-left">Qué toca</th>
                      {MONTHS.map(m => <th key={m} className="w-[62px] px-1 py-3 text-center">{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(asset => asset.tasks.map((task,index) => {
                      const isOpen = expanded === task.key
                      return (
                        <tr key={task.key} className="border-b border-slate-100 align-top">
                          <td className="sticky left-0 z-10 bg-white px-3 py-3">
                            {index === 0 && <button type="button" onClick={() => setExpanded(isOpen ? null : task.key)} className="w-full text-left">
                              <div className="font-semibold text-slate-800">{asset.code}</div>
                              <div className="text-[10px] text-slate-500">{asset.name}</div>
                              <div className="mt-1 text-[9px] text-slate-400">{asset.plant || '—'} · {asset.location || '—'}</div>
                            </button>}
                          </td>
                          <td className="sticky left-[240px] z-10 border-r border-slate-100 bg-white px-3 py-3">
                            <button type="button" onClick={() => setExpanded(isOpen ? null : task.key)} className="w-full text-left">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-600">{task.mark}</span>
                                <span className="truncate text-xs font-semibold text-slate-800">{task.action}</span>
                              </div>
                              <div className="mt-1 text-[9px] text-slate-400">{periodicityLabel(task.unit,task.value)}</div>
                            </button>
                          </td>
                          {MONTHS.map((m,i) => {
                            const weeks = task.byMonth[i+1] ?? []
                            const weekly = task.unit === 'WEEK' && weeks.length >= 4
                            return <td key={m} className="border-r border-slate-100 px-1 py-3 text-center" title={weeks.length ? weeks.map(w => 'Semana '+w).join(' · ') : 'Sin programación'}>
                              {weeks.length ? <><div className="font-bold text-slate-700">{weekly ? '4–5' : weeks.length}</div><div className="text-[8px] text-slate-400">{weekly ? 'sem.' : 'vez'}</div></> : <span className="text-slate-300">—</span>}
                            </td>
                          })}
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
                {expanded && (
                  <div className="border-t bg-slate-50 px-4 py-3">
                    {tasks.filter(t => t.key === expanded).map(task => (
                      <div key={task.key}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{task.code} · {task.action}</div>
                        <div className="mt-1 text-xs text-slate-600">{periodicityLabel(task.unit,task.value)} · {task.sources.join(' · ')}</div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {MONTHS.map((m,i) => task.byMonth[i+1]?.length ? <span key={m} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-600">{m}: {task.byMonth[i+1].map(w => 'S'+w).join(', ')}</span> : null)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:hidden divide-y divide-slate-100">
                {assets.map(asset => (
                  <div key={asset.id} className="p-2">
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 px-3 py-3">
                        <div className="font-semibold text-slate-800">{asset.code}</div>
                        <div className="text-[10px] text-slate-500">{asset.name}</div>
                        <div className="mt-1 text-[9px] text-slate-400">{asset.plant || '—'} · {asset.location || '—'}</div>
                      </div>
                      {asset.tasks.map(task => (
                        <div key={task.key}>
                          <button type="button" onClick={() => setExpanded(expanded === task.key ? null : task.key)} className="w-full px-3 py-3 text-left">
                            <div className="flex items-center gap-1.5"><span className="rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-600">{task.mark}</span><span className="text-xs font-semibold text-slate-800">{task.action}</span><ChevronDown size={14} className={'ml-auto text-slate-400 '+(expanded===task.key?'rotate-180':'')} /></div>
                            <div className="mt-1 text-[9px] text-slate-400">{periodicityLabel(task.unit,task.value)}</div>
                          </button>
                          {expanded===task.key && <div className="border-t bg-slate-50 px-3 py-3 text-[10px] text-slate-600">Origen: {task.sources.join(' · ') || 'PAM'}<div className="mt-2 flex flex-wrap gap-1.5">{MONTHS.map((m,i) => task.byMonth[i+1]?.length ? <span key={m} className="rounded-full bg-white px-2 py-1">{m}: {task.byMonth[i+1].map(w=>'S'+w).join(', ')}</span> : null)}</div></div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
