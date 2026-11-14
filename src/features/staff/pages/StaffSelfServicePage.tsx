import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, LogOut } from 'lucide-react'
import { useAuth } from '../../auth/context/AuthProvider'
import { ariasAuth } from '../../../core/auth/authService'
import { supabase } from '../../../lib/supabase'
import {
  addDays,dateISO,fromISO,hours,mondayOf, type StaffDay,type StaffOperator,
  type StaffOvertime,type StaffVacation,
} from '../staffModel'
import { loadAllStaffDays } from '../staffData'

export default function StaffSelfServicePage(){
  const navigate=useNavigate()
  const {session,loading:authLoading}=useAuth()
  const [year,setYear]=useState(new Date().getFullYear())
  const [operator,setOperator]=useState<StaffOperator|null>(null)
  const [days,setDays]=useState<StaffDay[]>([])
  const [extras,setExtras]=useState<StaffOvertime[]>([])
  const [entitlement,setEntitlement]=useState<StaffVacation|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [week,setWeek]=useState(mondayOf(dateISO(new Date())))
  useEffect(()=>{
    if(authLoading)return
    if(!session){navigate('/login?next=mi-horario',{replace:true});return}
    let current=true
    async function load(){
      setLoading(true);setError('')
      const staff=await supabase.from('staff_operators').select('*').eq('linked_user_id',session!.user.id).eq('active',true).limit(1).maybeSingle()
      if(!current)return
      if(staff.error){setError(staff.error.message);setLoading(false);return}
      const me=staff.data as StaffOperator|null
      setOperator(me)
      if(!me){setLoading(false);return}
      const [calendar,overtime,vacation]=await Promise.all([
        loadAllStaffDays({
          operatorId: me.id,
          startDate: String(year)+'-01-01',
          endDate: String(year)+'-12-31',
        }),
        supabase.from('staff_overtime_ledger').select('id,hotel_id,operator_id,entry_date,entry_type,minutes,reason,confirmed')
          .eq('operator_id',me.id).lte('entry_date',String(year)+'-12-31').order('entry_date',{ascending:false}),
        supabase.from('staff_vacation_years').select('id,hotel_id,operator_id,year,entitlement_days,carryover_days,adjustment_days')
          .eq('operator_id',me.id).eq('year',year).maybeSingle(),
      ])
      if(!current)return
      const failure=calendar.error||overtime.error||vacation.error
      if(failure)setError(failure.message)
      else{
        setDays((calendar.data??[]) as StaffDay[])
        setExtras((overtime.data??[]) as StaffOvertime[])
        setEntitlement((vacation.data??null) as StaffVacation|null)
      }
      setLoading(false)
    }
    void load()
    return()=>{current=false}
  },[authLoading,session?.user.id,year,navigate])
  const summary=useMemo(()=>{
    const planned=days.filter(d=>d.state==='SHIFT').reduce((t,d)=>t+(d.planned_minutes??0),0)
    const actual=days.filter(d=>d.actual_confirmed).reduce((t,d)=>t+(d.actual_minutes??0),0)
    const vacation=days.filter(d=>d.state==='VACATION').length
    const extra=extras.reduce((t,e)=>t+(e.entry_type==='EARNED'||e.entry_type==='ADJUSTMENT_PLUS'?e.minutes:-e.minutes),0)
    const balance=entitlement?.entitlement_days==null?null:entitlement.entitlement_days+entitlement.carryover_days+entitlement.adjustment_days-vacation
    return{planned,actual,vacation,extra,balance}
  },[days,extras,entitlement])
  const lookup=useMemo(()=>new Map(days.map(d=>[d.work_date,d])),[days])
  const selectedDates=Array.from({length:7},(_,i)=>addDays(week,i))
  async function signOut(){await ariasAuth.signOut();navigate('/login',{replace:true})}
  if(loading||authLoading)return <main className="min-h-screen bg-slate-100 p-8 text-slate-600">Cargando mi horario…</main>
  return <main className="min-h-screen bg-slate-100 p-1.5 text-slate-900 sm:p-6">
    <div className="mx-auto max-w-5xl space-y-2 sm:space-y-4">
      <header className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 shadow-sm sm:rounded-2xl sm:p-4">
        <h1 className="flex items-center gap-2 text-base font-bold sm:text-xl"><CalendarDays size={20}/> Mi horario</h1>
        <button className="flex min-h-9 items-center gap-1.5 rounded-lg border px-2 text-xs sm:px-3 sm:text-sm" onClick={()=>void signOut()}><LogOut size={15}/> Salir</button>
      </header>
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!operator?<section className="rounded-2xl bg-white p-6"><h2 className="font-bold">No hay operario vinculado a esta cuenta</h2><p className="mt-2 text-sm text-slate-500">Pide al responsable que vincule tu cuenta de Arias Suite con tu ficha de operario. No podrás consultar datos de otros compañeros.</p></section>:
      <>
        <section className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 shadow-sm sm:rounded-2xl sm:p-4"><h2 className="truncate text-sm font-bold sm:text-base">{operator.display_name}</h2>
          <label className="shrink-0 text-xs">Año <select className="ml-1 rounded-lg border px-2 py-1.5 text-sm" value={year} onChange={e=>setYear(Number(e.target.value))}>{[2025,2026,2027,2028].map(y=><option key={y}>{y}</option>)}</select></label></section>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {[['Turnos previstos',hours(summary.planned)],['Horas verificadas',hours(summary.actual)],['Vacaciones previstas',summary.vacation+' días'],['Sin programar',summary.balance==null?'—':summary.balance+' días']].map(([name,value])=>
            <div key={name} className="min-w-0 rounded-lg bg-white p-2 text-center shadow-sm sm:rounded-2xl sm:p-4 sm:text-left"><p className="text-[10px] leading-tight text-slate-500 sm:text-xs">{name}</p><p className="mt-1 break-words text-xs font-bold sm:mt-2 sm:text-xl">{value}</p></div>)}
        </div>
        <section className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold sm:text-base">Semana · {fromISO(week).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}</h2>
            <div className="flex gap-1 sm:gap-2"><button className="min-h-9 rounded-lg border px-2 text-xs sm:px-3" onClick={()=>setWeek(addDays(week,-7))}>‹ Anterior</button><button className="min-h-9 rounded-lg border px-2 text-xs sm:px-3" onClick={()=>setWeek(addDays(week,7))}>Siguiente ›</button></div></div>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-7 sm:gap-2">{selectedDates.map(d=>{
            const entry=lookup.get(d)
            const state=entry?.state==='SHIFT'?((entry.start_time?.slice(0,5)??'—')+'–'+(entry.end_time?.slice(0,5)??'—')):
              entry?.state==='VACATION'||entry?.state==='VACATION_PREVIOUS'?'Vacaciones':
              entry?.state==='REST'?'Descanso':entry?.source_code?.startsWith('Festivo/ref.')?'Festivo por revisar':entry?'No disponible':'Sin asignar'
            return <div key={d} className="flex min-h-10 items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-1.5 sm:block sm:rounded-xl sm:p-3"><p className="w-28 shrink-0 text-xs text-slate-500 sm:w-auto">{fromISO(d).toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'2-digit'})}</p><p className="flex-1 text-right text-sm font-semibold sm:mt-2 sm:text-left">{state}</p>{entry?.actual_confirmed&&<p className="text-right text-[10px] text-emerald-700 sm:mt-1 sm:text-left">✓ {hours(entry.actual_minutes)}</p>}</div>
          })}</div>
        </section>
        <section className="grid gap-2 lg:grid-cols-2 lg:gap-4">
          <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4"><h2 className="text-sm font-bold sm:text-base">Vacaciones · {year}</h2><p className="mt-1 text-xs text-slate-500">Asignados: {entitlement?.entitlement_days??'—'} d · Anteriores: {entitlement?.carryover_days??0} d</p>
            <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Ver fechas ({days.filter(d=>['VACATION','VACATION_PREVIOUS'].includes(d.state)).length})</summary><div className="mt-2 flex max-h-[180px] flex-wrap gap-1 overflow-y-auto">{days.filter(d=>['VACATION','VACATION_PREVIOUS'].includes(d.state)).map(d=><span key={d.id} className="rounded bg-sky-100 px-1.5 py-1 text-xs text-sky-800">{fromISO(d.work_date).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}{d.state==='VACATION_PREVIOUS'?' · ant.':''}</span>)}</div></details>
          </div>
          <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold sm:text-base">Horas adicionales</h2><strong className="text-sm">{hours(summary.extra)}</strong></div>
            <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Ver movimientos ({extras.length})</summary><div className="mt-2 max-h-[220px] divide-y overflow-y-auto">{extras.map(e=><div key={e.id} className="py-1.5 text-xs"><div className="flex justify-between gap-2"><span>{fromISO(e.entry_date).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})} · {e.entry_type==='EARNED'?'Generadas':e.entry_type==='REST_TAKEN'?'Disfrutadas':e.entry_type==='PAID'?'Abonadas':'Ajuste'}</span><strong>{hours(e.minutes)}</strong></div><p className="truncate text-[11px] text-slate-500" title={e.reason}>{e.reason}</p></div>)}</div></details>
          </div>
        </section>
      </>}
    </div>
  </main>
}
