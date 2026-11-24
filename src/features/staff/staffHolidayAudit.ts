import type { StaffDay, StaffOperator } from './staffModel'
import { staffHolidayOrigin } from './staffModel'

export type HolidayItem={holiday_date:string;label:string}
export type HolidayAuditRow={
 holiday:HolidayItem
 operator:StaffOperator
 scheduled:StaffDay|null
 enjoyed:StaffDay[]
 duplicate:boolean
}
export type HolidayWorkerSummary={
 operator:StaffOperator
 scheduled:number
 confirmed:number
 enjoyed:number
 distinctOrigins:number
 duplicateOrigins:number
 unassigned:number
 calendarPending:number
 diff:number
}
export function holidayAudit(operators:StaffOperator[],days:StaffDay[],holidays:HolidayItem[],year:number){
 const official=holidays.filter(h=>h.holiday_date.startsWith(String(year)))
   .slice().sort((a,b)=>a.holiday_date.localeCompare(b.holiday_date))
 const schedule=new Map(days.map(d=>[d.operator_id+'|'+d.work_date,d]))
 const enjoyments=new Map<string,StaffDay[]>()
 const unresolved:StaffDay[]=[]
 for(const day of days){
   if(day.state!=='PUBLIC_HOLIDAY')continue
   const origin=staffHolidayOrigin(day)
   if(!origin){unresolved.push(day);continue}
   const key=day.operator_id+'|'+origin
   enjoyments.set(key,[...(enjoyments.get(key)??[]),day])
 }
 const matrix:HolidayAuditRow[]=official.flatMap(holiday=>operators.map(operator=>{
   const enjoyed=enjoyments.get(operator.id+'|'+holiday.holiday_date)??[]
   return {holiday,operator,scheduled:schedule.get(operator.id+'|'+holiday.holiday_date)??null,
     enjoyed,duplicate:enjoyed.length>1}
 }))
 const summaries:HolidayWorkerSummary[]=operators.map(operator=>{
   const rows=matrix.filter(row=>row.operator.id===operator.id)
   const scheduled=rows.filter(row=>row.scheduled?.state==='SHIFT').length
   const confirmed=rows.filter(row=>row.scheduled?.state==='SHIFT'
      && row.scheduled.actual_confirmed && (row.scheduled.actual_minutes??0)>0).length
   const enjoyed=rows.reduce((n,row)=>n+row.enjoyed.length,0)
   const distinctOrigins=rows.filter(row=>row.enjoyed.length>0).length
   const duplicateOrigins=rows.reduce((n,row)=>n+Math.max(0,row.enjoyed.length-1),0)
   const unassigned=unresolved.filter(d=>d.operator_id===operator.id
     && (d.work_date.startsWith(String(year)) ||
       d.work_date.startsWith(String(year+1)))).length
   return {operator,scheduled,confirmed,enjoyed,distinctOrigins,duplicateOrigins,
     unassigned,calendarPending:Math.max(0,official.length-distinctOrigins),diff:scheduled-distinctOrigins}
 }).sort((a,b)=>b.scheduled-a.scheduled || a.operator.display_name.localeCompare(b.operator.display_name))
 return {official,matrix,summaries,unresolved}
}
