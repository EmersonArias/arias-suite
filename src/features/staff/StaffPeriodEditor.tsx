import type { StaffOperator } from './staffModel'

type Props={
 kind:'VACATION'|'MEDICAL_LEAVE'
 operators:StaffOperator[]
 operatorId:string
 start:string
 end:string
 busy:boolean
 onOperatorChange:(id:string)=>void
 onStartChange:(date:string)=>void
 onEndChange:(date:string)=>void
 onSubmit:()=>void
}
export default function StaffPeriodEditor({kind,operators,operatorId,start,end,busy,onOperatorChange,onStartChange,onEndChange,onSubmit}:Props){
 return <section className="rounded-xl border border-sky-200 bg-white p-3 shadow-sm">
   <h3 className="text-sm font-bold">
     {kind==='VACATION'?'Programar vacaciones en el cuadrante':'Registrar período de baja en el cuadrante'}
   </h3>
   <p className="mt-1 text-xs text-slate-600">
     Se guarda cada día en el cuadrante común, con fecha, usuario e historial. Los turnos trabajados
     confirmados, festivos disfrutados y descansos compensatorios no se sobrescriben.
   </p>
   <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_140px_auto] sm:items-end">
     <label className="text-xs font-medium">Trabajador
       <select value={operatorId} onChange={e=>onOperatorChange(e.target.value)}
         className="mt-1 w-full rounded-lg border px-2 py-2 text-sm">
         <option value="">Selecciona trabajador</option>
         {operators.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}
       </select>
     </label>
     <label className="text-xs font-medium">Desde
       <input type="date" value={start} onChange={e=>onStartChange(e.target.value)}
         className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"/>
     </label>
     <label className="text-xs font-medium">Hasta
       <input type="date" value={end} min={start} onChange={e=>onEndChange(e.target.value)}
         className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"/>
     </label>
     <button type="button" disabled={busy||!operatorId||!start||!end||end<start}
       onClick={onSubmit} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
       {kind==='VACATION'?'Programar vacaciones':'Registrar baja'}
     </button>
   </div>
 </section>
}
