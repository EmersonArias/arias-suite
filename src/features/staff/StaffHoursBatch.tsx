import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { dateISO, fromISO, hours, type StaffDay, type StaffOperator } from './staffModel'

type PeriodMode = 'MONTH' | 'DATES' | 'YEAR'
type DisplayFilter = 'PENDING' | 'ALL' | 'CONFIRMED'
type Props = {
  hotelId: string
  year: number
  operatorId: string
  operators: StaffOperator[]
  days: StaffDay[]
  changedBy: string | null
  reload: () => Promise<void>
}
const field = 'min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-600 sm:text-sm'
function spanishDate(date: string) {
  return fromISO(date).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
}
function minutesFromHours(value: string): number | null {
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(value.trim())) return null
  const n = Number(value.trim().replace(',','.'))
  if (!Number.isFinite(n) || n<=0 || n>24) return null
  return Math.round(n*60)
}

export default function StaffHoursBatch({
  hotelId,year,operatorId,operators,days,changedBy,reload,
}:Props) {
  const today = dateISO(new Date())
  const defaultMonth = today.startsWith(String(year))
    ? today.slice(0,7)
    : year+'-01'
  const [period,setPeriod] = useState<PeriodMode>('MONTH')
  const [month,setMonth] = useState(defaultMonth)
  const [dateStart,setDateStart] = useState(year+'-01-01')
  const [dateEnd,setDateEnd] = useState(today.startsWith(String(year))?today:year+'-12-31')
  const [display,setDisplay] = useState<DisplayFilter>('PENDING')
  const [selectedIds,setSelectedIds] = useState<string[]>([])
  const [commonHours,setCommonHours] = useState('')
  const [usePlanned,setUsePlanned] = useState(false)
  const [overrides,setOverrides] = useState<Record<string,string>>({})
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const first = period==='MONTH'?month+'-01':period==='YEAR'?year+'-01-01':dateStart
  const last = period==='MONTH'?month+'-31':period==='YEAR'?year+'-12-31':dateEnd
  const invalidRange = first>last || (period==='MONTH'&&!month) ||
    (period==='DATES'&&(!dateStart||!dateEnd))
  const names=useMemo(()=>new Map(operators.map(op=>[op.id,op.display_name])),[operators])
  const all = useMemo(()=>{
    if(invalidRange)return [] as StaffDay[]
    return days.filter(d=>d.state==='SHIFT' && d.work_date.startsWith(String(year)) &&
      (operatorId==='ALL'||d.operator_id===operatorId) &&
      d.work_date>=first && d.work_date<=last)
      .sort((a,b)=>a.work_date.localeCompare(b.work_date)||
        (names.get(a.operator_id)??'').localeCompare(names.get(b.operator_id)??''))
  },[days,year,operatorId,first,last,invalidRange,names])
  const due = all.filter(d=>d.work_date<=today)
  const pending = due.filter(d=>!d.actual_confirmed)
  const done = due.filter(d=>d.actual_confirmed)
  const rows = display==='ALL'?due:display==='CONFIRMED'?done:pending
  const selected = pending.filter(d=>selectedIds.includes(d.id))
  useEffect(()=>{
    setSelectedIds([])
    setOverrides({})
    setError('')
    setSuccess('')
  },[year,operatorId,period,month,dateStart,dateEnd,display,hotelId])
  function toggle(id:string,checked:boolean){
    setSelectedIds(prev=>checked?[...new Set([...prev,id])]:prev.filter(v=>v!==id))
  }
  function toggleAll(){
    const ids=rows.filter(d=>!d.actual_confirmed).map(d=>d.id)
    setSelectedIds(prev=>ids.length>0&&ids.every(id=>prev.includes(id))?
      prev.filter(id=>!ids.includes(id)):[...new Set([...prev,...ids])])
  }
  function minutesFor(d:StaffDay){
    const override=overrides[d.id]?.trim()
    if(override)return minutesFromHours(override)
    if(commonHours.trim())return minutesFromHours(commonHours)
    if(usePlanned)return d.planned_minutes!=null && d.planned_minutes>0 ? d.planned_minutes : null
    return d.actual_minutes!=null && d.actual_minutes>0 ? d.actual_minutes : null
  }
  const invalidSelected=selected.filter(d=>minutesFor(d)===null)
  const totalMinutes=selected.reduce((sum,d)=>sum+(minutesFor(d)??0),0)

  async function confirmAllSelected(){
    if(saving||!selected.length||invalidSelected.length||invalidRange)return
    const count=selected.length
    const warning=usePlanned
      ? '\nHas activado «Usar horas previstas». Confirma únicamente si esos horarios se han contrastado con el trabajo realmente realizado.'
      : '\nComprueba que las horas introducidas corresponden al trabajo realmente realizado.'
    if(!window.confirm('¿Confirmar '+count+' jornadas y '+hours(totalMinutes)+
      ' como horas realmente trabajadas?'+warning+'\nNo se modificarán otras fechas ni vacaciones/bajas.'))return
    setSaving(true);setError('');setSuccess('')
    const byMinutes=new Map<number,string[]>()
    for(const row of selected){
      const minute=minutesFor(row)
      if(minute===null)continue
      const ids=byMinutes.get(minute)??[]
      ids.push(row.id)
      byMinutes.set(minute,ids)
    }
    let saved=0
    let failure=''
    const timestamp=new Date().toISOString()
    try {
      for(const [minutes,ids] of byMinutes){
        // Keep URL lengths bounded for year-long selections and preserve partial-result feedback.
        for(let offset=0;offset<ids.length;offset+=80){
          const subset=ids.slice(offset,offset+80)
          const result=await supabase.from('staff_schedule_entries')
            .update({actual_minutes:minutes,actual_confirmed:true,
              changed_by:changedBy,updated_at:timestamp})
            .eq('hotel_id',hotelId).eq('state','SHIFT').eq('actual_confirmed',false)
            .lte('work_date',dateISO(new Date())).in('id',subset).select('id')
          if(result.error){failure=result.error.message;break}
          saved+=result.data?.length??0
        }
        if(failure)break
      }
      await reload()
      setSelectedIds([])
      setOverrides({})
      if(failure||saved!==count)
        setError('Se confirmaron '+saved+' de '+count+' jornadas. '+(failure||'Algunas pudieron cambiar o no tener permisos. Revisa las restantes.'))
      else setSuccess('Confirmadas '+saved+' jornadas y '+hours(totalMinutes)+' realmente trabajadas.')
    } catch (e) {
      setError('No se completó la operación. Revisa el estado antes de repetirla. '+(e instanceof Error?e.message:''))
    } finally {
      setSaving(false)
    }
  }

  return <section className="space-y-2 sm:space-y-3">
    <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-2"><ClipboardCheck size={18}/>
        <h2 className="text-sm font-bold sm:text-lg">Verificación de horas en bloque</h2>
      </div>
      <p className="mt-1 text-[11px] text-slate-600">Elige un período y selecciona los turnos que hayas comprobado. No se marcan horas reales automáticamente.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] font-semibold text-slate-600">Período
          <select value={period} onChange={e=>setPeriod(e.target.value as PeriodMode)} className={field+' mt-1'}>
            <option value="MONTH">Mes</option><option value="DATES">Entre fechas</option><option value="YEAR">Año completo</option>
          </select>
        </label>
        {period==='MONTH'&&<label className="text-[11px] font-semibold text-slate-600">Mes
          <input type="month" value={month} min={year+'-01'} max={year+'-12'}
            onChange={e=>setMonth(e.target.value)} className={field+' mt-1'}/>
        </label>}
        {period==='DATES'&&<>
          <label className="text-[11px] font-semibold text-slate-600">Desde
            <input type="date" value={dateStart} min={year+'-01-01'} max={year+'-12-31'}
              onChange={e=>setDateStart(e.target.value)} className={field+' mt-1'}/>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">Hasta
            <input type="date" value={dateEnd} min={year+'-01-01'} max={year+'-12-31'}
              onChange={e=>setDateEnd(e.target.value)} className={field+' mt-1'}/>
          </label>
        </>}
        <label className="text-[11px] font-semibold text-slate-600">Mostrar
          <select value={display} onChange={e=>setDisplay(e.target.value as DisplayFilter)}
            className={field+' mt-1'}>
            <option value="PENDING">Sin verificar</option>
            <option value="CONFIRMED">Verificadas</option>
            <option value="ALL">Todas</option>
          </select>
        </label>
      </div>
      {invalidRange&&<p role="alert" className="mt-2 text-xs text-rose-700">Revisa las fechas: el período inicial no puede superar el final.</p>}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg bg-slate-50 p-2 text-center"><div className="text-[10px] text-slate-500">Turnos pasados</div><div className="text-lg font-bold">{due.length}</div></div>
        <div className="rounded-lg bg-amber-50 p-2 text-center"><div className="text-[10px] text-amber-900">Sin verificar</div><div className="text-lg font-bold">{pending.length}</div></div>
        <div className="rounded-lg bg-emerald-50 p-2 text-center"><div className="text-[10px] text-emerald-900">Verificados</div><div className="text-lg font-bold">{done.length}</div></div>
      </div>
    </div>

    <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold">{selected.length} turnos seleccionados</div>
        <div className="flex gap-1.5">
          <button type="button" disabled={!rows.some(d=>!d.actual_confirmed)||saving} onClick={toggleAll}
            className="min-h-9 rounded-lg border px-2 text-[11px] font-semibold disabled:opacity-40">
            {rows.some(d=>!d.actual_confirmed)&&rows.filter(d=>!d.actual_confirmed).every(d=>selectedIds.includes(d.id))
              ?'Deseleccionar pendientes':'Seleccionar sin verificar'}
          </button>
          <button type="button" disabled={!selectedIds.length||saving} onClick={()=>setSelectedIds([])}
            className="min-h-9 rounded-lg border px-2 text-[11px] disabled:opacity-40">Limpiar</button>
        </div>
      </div>
      <div className="mt-2 max-h-[370px] space-y-1 overflow-y-auto border-y border-slate-100 py-1">
        {rows.map(d=><div key={d.id}
          className="grid grid-cols-[20px_minmax(0,1fr)_70px_75px] items-center gap-1 rounded-md bg-slate-50 p-1.5 sm:grid-cols-[22px_minmax(0,1fr)_110px_90px] sm:gap-3">
          <input type="checkbox" disabled={saving||d.actual_confirmed} checked={selectedIds.includes(d.id)}
            onChange={e=>toggle(d.id,e.target.checked)}
            aria-label={'Seleccionar turno de '+(names.get(d.operator_id)??'operario')+' el '+spanishDate(d.work_date)}
            className="h-4 w-4"/>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold sm:text-xs">{names.get(d.operator_id)??'Operario'}</div>
            <div className="text-[10px] text-slate-600">{spanishDate(d.work_date)} · {d.start_time?.slice(0,5)}–{d.end_time?.slice(0,5)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-slate-500">Previstas</div>
            <div className="text-[11px] font-semibold">{hours(d.planned_minutes)}</div>
          </div>
          {d.actual_confirmed
            ? <div className="text-right text-[10px] font-semibold text-emerald-800">✓ {hours(d.actual_minutes)}</div>
            : <label className="text-[9px] text-slate-600">Horas reales
              <input type="text" inputMode="decimal" autoComplete="off"
                disabled={saving} value={overrides[d.id]??''} placeholder={d.actual_minutes!=null?
                  String(d.actual_minutes/60):'—'} onChange={e=>setOverrides(prev=>({...prev,[d.id]:e.target.value}))}
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs font-semibold"/>
              </label>}
        </div>)}
        {!rows.length&&<p className="p-3 text-center text-xs text-slate-500">No hay turnos que coincidan con el filtro.</p>}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-700">Horas reales iguales para los seleccionados
          <input type="text" inputMode="decimal" value={commonHours} placeholder="Ej.: 8 o 8,5"
            disabled={saving} onChange={e=>setCommonHours(e.target.value)} className={field+' mt-1'}/>
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">
          <input type="checkbox" checked={usePlanned} disabled={saving}
            onChange={e=>setUsePlanned(e.target.checked)} className="h-4 w-4"/>
          <span>Usar horas previstas como propuesta, <strong>solo si coinciden con las reales</strong>.</span>
        </label>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Las horas individuales tienen prioridad; después se aplican las horas comunes. Si no se han indicado, solo se usan las previstas cuando marcas expresamente esa opción. No se incluyen futuras jornadas, descansos, bajas ni vacaciones.
      </p>
      {selected.length>0&&invalidSelected.length>0&&<p className="mt-2 text-xs font-medium text-amber-800">
        Faltan horas reales válidas en {invalidSelected.length} jornadas seleccionadas. Introduce un valor mayor que 0 y hasta 24 horas.
      </p>}
      {error&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      {success&&<p role="status" className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{success}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">{selected.length?hours(totalMinutes)+' seleccionadas':'Selecciona jornadas para confirmar'}</p>
        <button type="button" disabled={saving||!selected.length||invalidSelected.length>0}
          onClick={()=>void confirmAllSelected()}
          className="flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          <CheckCheck size={16}/>{saving?'Guardando…':'Confirmar '+selected.length+' turnos'}
        </button>
      </div>
    </div>
  </section>
}
