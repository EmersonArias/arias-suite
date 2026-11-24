import type { StaffDay, StaffOperator } from './staffModel'
import { staffHolidayOrigin } from './staffModel'

export type HolidayItem={holiday_date:string;label:string}
export type HolidayAuditRow={
 holiday:HolidayItem
 operator:StaffOperator
 scheduled:StaffDay|null
 enjoyed:StaffDay[]
 duplicate:boolean
 excludedByLeave:boolean
 beforeJoining:boolean
 pending:boolean
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
 excludedByLeave:number
 beforeJoining:number
}
export function holidayAudit(operators:StaffOperator[],days:StaffDay[],holidays:HolidayItem[],year:number,firstScheduledDates:Record<string,string>={}){
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
   const scheduled=schedule.get(operator.id+'|'+holiday.holiday_date)??null
   const firstDay=operator.join_date??firstScheduledDates[operator.id]??null
   const beforeJoining=firstDay!==null && holiday.holiday_date<firstDay
   const excludedByLeave=scheduled!==null &&
     ['MEDICAL_LEAVE','VACATION','VACATION_PREVIOUS'].includes(scheduled.state)
   // An explicit recorded enjoyment is retained even when leave or vacation overlaps.
   const pending=!beforeJoining && !excludedByLeave && enjoyed.length===0
   return {holiday,operator,scheduled,enjoyed,duplicate:enjoyed.length>1,
     excludedByLeave,beforeJoining,pending}
 }))
 const summaries:HolidayWorkerSummary[]=operators.map(operator=>{
   const rows=matrix.filter(row=>row.operator.id===operator.id)
   const scheduled=rows.filter(row=>row.scheduled?.state==='SHIFT').length
   const confirmed=rows.filter(row=>row.scheduled?.state==='SHIFT'
      && row.scheduled.actual_confirmed && (row.scheduled.actual_minutes??0)>0).length
   const enjoyed=rows.reduce((n,row)=>n+row.enjoyed.length,0)
   const distinctOrigins=rows.filter(row=>row.enjoyed.length>0).length
   const duplicateOrigins=rows.reduce((n,row)=>n+Math.max(0,row.enjoyed.length-1),0)
   const excludedByLeave=rows.filter(row=>row.excludedByLeave).length
   const beforeJoining=rows.filter(row=>row.beforeJoining).length
   const calendarPending=rows.filter(row=>row.pending).length
   const unassigned=unresolved.filter(d=>d.operator_id===operator.id
     && (d.work_date.startsWith(String(year)) ||
       d.work_date.startsWith(String(year+1)))).length
   return {operator,scheduled,confirmed,enjoyed,distinctOrigins,duplicateOrigins,
     unassigned,calendarPending,excludedByLeave,beforeJoining}
 }).sort((a,b)=>b.scheduled-a.scheduled || a.operator.display_name.localeCompare(b.operator.display_name))
 return {official,matrix,summaries,unresolved}
}
