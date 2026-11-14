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
        supabase.from('staff_schedule_entries').select('id,hotel_id,operator_id,work_date,state,start_time,end_time,planned_minutes,actual_minutes,actual_confirmed,justification,source_kind,source_code')
          .eq('operator_id',me.id).gte('work_date',String(year)+'-01-01').lte('work_date',String(year)+'-12-31').order('work_date'),
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
  return <main className="min-h-screen bg-slate-100 p-3 text-slate-900 sm:p-6">
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div><h1 className="flex items-center gap-2 text-xl font-bold"><CalendarDays size={23}/> Mi horario</h1><p className="mt-1 text-sm text-slate-500">Consulta personal de turnos, horas y vacaciones</p></div>
        <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" onClick={()=>void signOut()}><LogOut size={15}/> Salir</button>
      </header>
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!operator?<section className="rounded-2xl bg-white p-6"><h2 className="font-bold">No hay operario vinculado a esta cuenta</h2><p className="mt-2 text-sm text-slate-500">Pide al responsable que vincule tu cuenta de Arias Suite con tu ficha de operario. No podrás consultar datos de otros compañeros.</p></section>:
      <>
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 shadow-sm"><h2 className="font-bold">{operator.display_name}</h2>
          <label className="text-sm">Año <select className="ml-2 rounded-lg border px-3 py-2" value={year} onChange={e=>setYear(Number(e.target.value))}>{[2025,2026,2027,2028].map(y=><option key={y}>{y}</option>)}</select></label></section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Turnos previstos',hours(summary.planned)],['Horas verificadas',hours(summary.actual)],['Vacaciones previstas',summary.vacation+' días'],['Vacaciones pendientes',summary.balance==null?'Sin configurar':summary.balance+' días']].map(([name,value])=>
            <div key={name} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{name}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}
        </div>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Mi semana · {fromISO(week).toLocaleDateString('es-ES')}</h2>
            <div className="flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setWeek(addDays(week,-7))}>Anterior</button><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setWeek(addDays(week,7))}>Siguiente</button></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-7">{selectedDates.map(d=>{
            const entry=lookup.get(d)
            const state=entry?.state==='SHIFT'?((entry.start_time?.slice(0,5)??'—')+'–'+(entry.end_time?.slice(0,5)??'—')):
              entry?.state==='VACATION'||entry?.state==='VACATION_PREVIOUS'?'Vacaciones':
              entry?.state==='REST'?'Descanso':entry?'No disponible':'Sin asignar'
            return <div key={d} className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">{fromISO(d).toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'2-digit'})}</p><p className="mt-2 text-sm font-semibold">{state}</p>{entry?.actual_confirmed&&<p className="mt-1 text-xs text-emerald-700">Verificadas {hours(entry.actual_minutes)}</p>}</div>
          })}</div>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="font-bold">Mis vacaciones · {year}</h2><p className="mt-2 text-sm text-slate-500">Derecho anual: {entitlement?.entitlement_days??'Sin configurar'} días · Años anteriores: {entitlement?.carryover_days??0} días</p>
            <div className="mt-3 flex max-h-[280px] flex-wrap gap-2 overflow-y-auto">{days.filter(d=>['VACATION','VACATION_PREVIOUS'].includes(d.state)).map(d=><span key={d.id} className="rounded-lg bg-sky-100 px-2 py-1 text-xs text-sky-800">{fromISO(d.work_date).toLocaleDateString('es-ES')}{d.state==='VACATION_PREVIOUS'?' · anterior':''}</span>)}</div>
            <p className="mt-2 text-xs text-slate-500">Las fechas importadas del Excel no acreditan por sí solas disfrute efectivo.</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="font-bold">Mis horas adicionales</h2><p className="mt-2 text-2xl font-bold">{hours(summary.extra)} <span className="text-sm font-normal text-slate-500">saldo histórico registrado</span></p>
            <div className="mt-3 max-h-[280px] overflow-y-auto">{extras.map(e=><div key={e.id} className="border-t py-2 text-sm"><div className="flex justify-between"><span>{fromISO(e.entry_date).toLocaleDateString('es-ES')} · {e.entry_type==='EARNED'?'Generadas':e.entry_type==='REST_TAKEN'?'Disfrutadas':e.entry_type==='PAID'?'Abonadas':'Ajuste'}</span><strong>{hours(e.minutes)}</strong></div><p className="text-xs text-slate-500">{e.reason}</p></div>)}</div>
          </div>
        </section>
      </>}
    </div>
  </main>
}
