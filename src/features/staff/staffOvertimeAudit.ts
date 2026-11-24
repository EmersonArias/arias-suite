import type { StaffDay,StaffOvertime } from './staffModel'

export type UnlinkedRest={day:StaffDay;historicalMovements:StaffOvertime[]}
export function auditCompensatoryRest(days:StaffDay[],ledger:StaffOvertime[],operatorId:string,year:number){
 const earnedById=new Map(ledger.filter(e=>e.operator_id===operatorId&&
   ['EARNED','ADJUSTMENT_PLUS'].includes(e.entry_type)).map(e=>[e.id,e]))
 const restDays=days.filter(d=>d.operator_id===operatorId&&d.state==='COMP_REST'&&
   d.work_date.startsWith(String(year)))
 const linked=ledger.filter(e=>e.operator_id===operatorId&&e.entry_type==='REST_TAKEN'&&
   e.linked_schedule_entry_id!==null)
 const consumedBySchedule=new Map<string,StaffOvertime[]>()
 for(const movement of linked){
   const key=movement.linked_schedule_entry_id!
   consumedBySchedule.set(key,[...(consumedBySchedule.get(key)??[]),movement])
 }
 const unlinked:UnlinkedRest[]=restDays.filter(d=>!consumedBySchedule.has(d.id)).map(day=>({
   day,historicalMovements:ledger.filter(e=>e.operator_id===operatorId&&
     e.entry_type==='REST_TAKEN'&&e.compensates_entry_id===null&&
     e.linked_schedule_entry_id===null&&e.entry_date===day.work_date),
 }))
 const issues=linked.filter(e=>{
   const source=e.compensates_entry_id?earnedById.get(e.compensates_entry_id):null
   const day=restDays.find(d=>d.id===e.linked_schedule_entry_id)
   return !source||!day||e.entry_date!==day.work_date
 })
 return {restDays,linked,unlinked,issues,
   generated:ledger.filter(e=>e.operator_id===operatorId&&['EARNED','ADJUSTMENT_PLUS'].includes(e.entry_type))
     .reduce((n,e)=>n+e.minutes,0),
   compensated:ledger.filter(e=>e.operator_id===operatorId&&e.entry_type==='REST_TAKEN')
     .reduce((n,e)=>n+e.minutes,0),
   movementsByDay:consumedBySchedule,
   earnedById}
}
