import { useMemo, useState } from 'react'
import { CalendarPlus, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { StaffDay,StaffOperator } from './staffModel'
import { holidayAudit } from './staffHolidayAudit'
import { exportHolidayAuditPdf } from './staffHolidayHistoryPdf'
import { Printer } from 'lucide-react'

type Props={
 hotelId:string
 hotelName:string
 pdfOperatorIds:string[]
 year:number
 operators:StaffOperator[]
 days:StaffDay[]
 holidays:Array<{holiday_date:string;label:string}>
 onReload:()=>Promise<void>
 onEditDay:(operatorId:string,date:string)=>void
 readOnly?:boolean
}
const dayLabel=(date:string)=>date.split('-').reverse().join('/')
const kind=(day:StaffDay|null)=> {
 if(!day)return 'Sin registrar'
 if(day.state==='SHIFT')return day.actual_confirmed && (day.actual_minutes??0)>0?'Trabajado confirmado':'Turno previsto'
 if(day.state==='REST')return 'Descanso'
 if(day.state==='PUBLIC_HOLIDAY')return 'Festivo disfrutado'
 return ({VACATION:'Vacaciones',VACATION_PREVIOUS:'Vacaciones anteriores',MEDICAL_LEAVE:'Baja',
   COMP_REST:'Recuperación de horas',PERSONAL_DAY:'Asuntos propios'} as Record<string,string>)[day.state]??day.state
}
export default function StaffHolidays({
 hotelId,hotelName,pdfOperatorIds,year,operators,days,holidays,onReload,onEditDay,readOnly=false,
}:Props){
 const [date,setDate]=useState(String(year)+'-01-01')
 const [label,setLabel]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [selected,setSelected]=useState('ALL')
 const audit=useMemo(()=>holidayAudit(operators,days,holidays,year),[operators,days,holidays,year])
 const visible=selected==='ALL'?operators:operators.filter(o=>o.id===selected)
 const dateExists=holidays.some(h=>h.holiday_date===date)
 async function saveHoliday(){
   if(!hotelId||!date.startsWith(String(year))||!label.trim()){
     setMessage('Introduce la fecha del año seleccionado y el nombre del festivo.');return
   }
   setBusy(true);setMessage('')
   const payload={hotel_id:hotelId,holiday_date:date,label:label.trim(),source_kind:'MANUAL',
     updated_at:new Date().toISOString()}
   const result=dateExists
     ?await supabase.from('staff_calendar_holidays').update({label:payload.label,updated_at:payload.updated_at})
       .eq('hotel_id',hotelId).eq('holiday_date',date).select('holiday_date')
     :await supabase.from('staff_calendar_holidays').insert(payload).select('holiday_date')
   if(result.error)setMessage(result.error.message)
   else if(!result.data?.length)setMessage('Sin permisos para actualizar el calendario.')
   else{setMessage(dateExists?'Nombre del festivo actualizado.':'Festivo añadido al calendario.')
     setLabel('');await onReload()}
   setBusy(false)
 }
 const duplicates=audit.matrix.filter(r=>r.duplicate)
 const unmatched=audit.unresolved.filter(d=>d.work_date.startsWith(String(year))||
   d.work_date.startsWith(String(year+1)))
 const pendingCount=audit.summaries.reduce((n,s)=>n+s.duplicateOrigins,0)
 return <section className="space-y-3">
   <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
     <div className="flex flex-wrap items-start justify-between gap-2">
       <div><h2 className="text-base font-bold">Festivos · {year}</h2>
         <p className="text-xs text-slate-600">Calendario anual: pendientes en rojo, bajas y vacaciones excluidas, disfrutes y duplicados.</p></div>
       <button type="button" onClick={()=>void exportHolidayAuditPdf({
         hotelName,year,operators,days,holidays,operatorIds:pdfOperatorIds,
       }).catch(e=>setMessage(e instanceof Error?e.message:'Error PDF'))}
         className="rounded-lg border px-3 py-2 text-xs font-semibold">
         <Printer size={14} className="mr-1 inline"/>PDF
       </button>
       <button type="button" onClick={()=>void onReload()} disabled={busy}
         className="rounded-lg border px-3 py-2 text-xs font-semibold"><RefreshCw size={14} className="mr-1 inline"/>Actualizar</button>
     </div>
     <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
       {[
         ['Festivos del calendario',String(audit.official.length)],
         ['Turnos previstos en festivos',String(audit.summaries.reduce((n,s)=>n+s.scheduled,0))],
         ['Disfrutes anotados',String(audit.summaries.reduce((n,s)=>n+s.enjoyed,0))],
         ['Disfrutes duplicados',String(pendingCount)],
       ].map(([heading,value])=><div key={heading} className="rounded-lg bg-slate-50 p-2">
         <div className="text-[11px] text-slate-500">{heading}</div>
         <div className="mt-1 text-xl font-bold">{value}</div>
       </div>)}
     </div>
     <p className="mt-2 text-xs text-slate-600">«Turno previsto» no acredita que se haya trabajado. Los disfrutes futuros también son programados; los saldos no constituyen automáticamente derechos devengados.</p>
   </div>
   {(duplicates.length>0||unmatched.length>0)&&<div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3">
     <div className="flex items-center gap-2 font-semibold text-amber-950"><AlertTriangle size={17}/>Registros para revisar</div>
     {duplicates.map(row=><p key={row.operator.id+'-'+row.holiday.holiday_date} className="mt-1 text-xs text-amber-950">
       <strong>{row.operator.display_name}</strong>: el festivo {dayLabel(row.holiday.holiday_date)}
       está asignado {row.enjoyed.length} veces ({row.enjoyed.map(d=>dayLabel(d.work_date)).join(', ')}).
       {row.enjoyed.map(d=><button type="button" key={d.id} onClick={()=>onEditDay(row.operator.id,d.work_date)}
         className="ml-2 rounded border border-amber-500 px-2 py-0.5 font-semibold underline">Revisar {dayLabel(d.work_date)}</button>)}
     </p>)}
     {unmatched.length>0&&<p className="mt-2 text-xs text-amber-950">
       {unmatched.length} disfrutes no tienen festivo de origen reconocible. Requieren revisión manual.
     </p>}
   </div>}
   {!readOnly&&<div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
     <h3 className="text-sm font-bold"><CalendarPlus size={17} className="mr-2 inline"/>Añadir o corregir un festivo del calendario</h3>
     <p className="mt-1 text-xs text-slate-500">Se añade al calendario del hotel, no se asigna automáticamente a ningún trabajador.</p>
     <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
       <label className="text-xs font-medium">Fecha
         <input type="date" value={date} min={year+'-01-01'} max={year+'-12-31'}
           onChange={e=>{setDate(e.target.value);setLabel(holidays.find(h=>h.holiday_date===e.target.value)?.label??'')}}
           className="mt-1 w-full rounded-lg border p-2 text-sm"/></label>
       <label className="text-xs font-medium">Nombre o motivo
         <input value={label} onChange={e=>setLabel(e.target.value)} maxLength={120}
           placeholder="Ej.: Festivo local, Navidad..." className="mt-1 w-full rounded-lg border p-2 text-sm"/></label>
       <button type="button" disabled={busy||!label.trim()} onClick={()=>void saveHoliday()}
         className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
         {dateExists?'Actualizar nombre':'Añadir festivo'}</button>
     </div>
     {message&&<p role="status" className="mt-2 text-xs text-slate-700">{message}</p>}
     <div className="mt-3 flex flex-wrap gap-1.5">
       {audit.official.map(h=><button type="button" key={h.holiday_date}
         title="Seleccionar para revisar o cambiar el nombre"
         onClick={()=>{setDate(h.holiday_date);setLabel(h.label)}}
         className="rounded-md border bg-slate-50 px-2 py-1 text-xs">{dayLabel(h.holiday_date)} · {h.label}</button>)}
     </div>
   </div>}
   <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
       <h3 className="text-sm font-bold">Comparación por trabajador</h3>
       <label className="text-xs">Mostrar
         <select value={selected} onChange={e=>setSelected(e.target.value)}
           className="ml-2 rounded-lg border px-2 py-1">
           <option value="ALL">Todos</option>
           {operators.map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}
         </select></label>
     </div>
     <div className="mt-2 overflow-x-auto">
       <table className="w-full min-w-[620px] text-left text-xs">
         <thead><tr className="border-b bg-slate-50">
           <th className="p-2">Trabajador</th><th>Turnos festivos previstos</th>
           <th>Trabajos confirmados</th><th>Disfrutes anotados</th>
           <th>Festivos distintos</th><th>Excluidos (baja/vacaciones)</th><th>Pendientes</th><th>Duplicados</th><th>Diferencia turnos/disfrutes</th>
         </tr></thead>
         <tbody>{audit.summaries.filter(s=>visible.some(o=>o.id===s.operator.id))
           .map(s=><tr key={s.operator.id} className="border-b">
             <td className="p-2 font-semibold">{s.operator.display_name}</td>
             <td>{s.scheduled}</td><td>{s.confirmed}</td><td>{s.enjoyed}</td>
             <td>{s.distinctOrigins} / {audit.official.length}</td>
             <td className="text-slate-600">{s.excludedByLeave}</td>
             <td className={s.calendarPending?'bg-red-100 font-bold text-red-800':'text-slate-600'}>{s.calendarPending}</td>
             <td className={s.duplicateOrigins?'font-bold text-amber-800':''}>{s.duplicateOrigins}</td>
             <td>{s.diff>0?'+'+s.diff:s.diff}</td>
           </tr>)}</tbody>
       </table>
     </div>
     <p className="mt-2 text-[11px] text-slate-500">Los festivos que coinciden con baja o vacaciones quedan excluidos de pendientes automáticamente, salvo asignación expresa del administrador. Pendientes en rojo. La tabla es un control interno, no un cálculo legal automático de derechos.</p>
   </div>
   <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
     <h3 className="text-sm font-bold">Detalle por fecha y trabajador</h3>
     <p className="mt-1 text-xs text-slate-500">Cada celda distingue el turno del día festivo y cuándo se ha disfrutado ese festivo. Pulsa para editar el día en el cuadrante.</p>
     <div className="mt-3 overflow-x-auto">
       <table className="w-full min-w-[680px] border-collapse text-xs">
         <thead><tr className="border-b bg-slate-50">
           <th className="sticky left-0 bg-slate-50 p-2 text-left">Festivo</th>
           {visible.map(o=><th key={o.id} className="p-2 text-left">{o.display_name}</th>)}
         </tr></thead>
         <tbody>{audit.official.map(h=><tr key={h.holiday_date} className="border-b align-top">
           <th className="sticky left-0 bg-white p-2 text-left font-semibold">{dayLabel(h.holiday_date)}
             <div className="text-[10px] font-normal text-slate-500">{h.label}</div>
           </th>
           {visible.map(o=>{
             const data=audit.matrix.find(r=>r.holiday.holiday_date===h.holiday_date&&r.operator.id===o.id)!
             return <td key={o.id} className={'min-w-[145px] p-2 '+(data.pending?'bg-red-50':'')}>
               <button type="button" onClick={()=>onEditDay(o.id,h.holiday_date)}
                 className="block text-left text-[11px] font-medium text-sky-800 underline">
                 {kind(data.scheduled)}</button>
               {data.excludedByLeave&&<div className="mt-1 rounded bg-slate-100 p-1 text-[11px] font-medium text-slate-600">
                 Excluido: baja o vacaciones.
                 {data.enjoyed.length>0&&' Asignación manual registrada.'}
               </div>}
               {data.pending&&<span className="mt-1 block rounded bg-red-100 px-2 py-1 text-[11px] font-bold text-red-800">PENDIENTE · SIN ASIGNAR</span>}
               {data.enjoyed.length>0&&<div className={'mt-1 rounded p-1 text-[11px] '+
                   (data.duplicate?'bg-amber-100 text-amber-900':'bg-emerald-50 text-emerald-900')}>
                 {data.duplicate?'DUPLICADO · ':''}Disfrute: {data.enjoyed.map(d=>dayLabel(d.work_date)).join(', ')}
                 <div className="mt-1 flex flex-wrap gap-1">{data.enjoyed.map(d=><button key={d.id}
                   onClick={()=>onEditDay(o.id,d.work_date)}
                   className="rounded border border-current px-1 underline">Editar {dayLabel(d.work_date)}</button>)}</div>
               </div>}
             </td>
           })}
         </tr>)}</tbody>
       </table>
     </div>
   </div>
 </section>
}
