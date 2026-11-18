import { plannedMinutes, type StaffDay } from './staffModel'

export type ClockAction = 'IN' | 'BREAK_START' | 'BREAK_END' | 'OUT'
export type ClockLocationMode = 'OFF' | 'OPTIONAL' | 'REQUIRED'

export type ClockSettings = {
  hotel_id: string
  timezone_name: string
  location_mode: ClockLocationMode
  signature_on_out: boolean
  is_enabled: boolean
  enabled_from: string
}

export type ClockEvent = {
  id: string
  hotel_id: string
  operator_id: string
  work_date: string
  event_type: ClockAction
  event_at: string
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  signature_png?: string | null
}

export const actionLabels: Record<ClockAction,string> = {
  IN: 'Entrada',
  BREAK_START: 'Inicio de pausa',
  BREAK_END: 'Fin de pausa',
  OUT: 'Salida',
}

export const localDate = (timezone: string, now = new Date()) => {
  try {
    return new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  } catch {
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  }
}
export const localTime = (stamp:string, timezone:string) => {
  try {
    return new Date(stamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:timezone})
  } catch {
    return new Date(stamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})
  }
}
export const dayLabel = (date:string) =>
  new Date(date+'T12:00:00').toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'short'})

/** Only server-stamped, completed segments count. No automatic clock-in from a planned shift. */
export function clockWorkedMinutes(entries:ClockEvent[]):number|null {
  const events=[...entries].sort((a,b)=>a.event_at.localeCompare(b.event_at))
  if(!events.length || events[0].event_type!=='IN' || events[events.length-1].event_type!=='OUT')
    return null
  let start:number|null=null
  let milliseconds=0
  for(const event of events){
    const at=new Date(event.event_at).getTime()
    if(event.event_type==='IN'||event.event_type==='BREAK_END'){
      start=at
    } else if(event.event_type==='BREAK_START'||event.event_type==='OUT'){
      if(start===null || at<start)return null
      milliseconds+=at-start
      start=null
    }
  }
  return Math.round(milliseconds/60000)
}

export type ClockDayStatus = 'MATCH'|'DIFFERENCE'|'MISSING'|'OPEN'|'PENDING'|'UNPLANNED'
export type ClockDayReview = {
  key:string; operatorId:string; name:string; day:string
  planned:number; actual:number|null; delta:number|null
  events:ClockEvent[]; status:ClockDayStatus
}
export function compareClockDay(
  operatorId:string,name:string,day:string,schedule:StaffDay|undefined,
  events:ClockEvent[],today:string,activationDate:string,toleranceMinutes=5,
):ClockDayReview|null {
  const planned=schedule?plannedMinutes(schedule):0
  if(!planned && !events.length)return null
  if(day<activationDate && !events.length)return null // Never mark historical schedules as missed.
  const actual=clockWorkedMinutes(events)
  const isClosed=actual!==null
  const status:ClockDayStatus= !events.length
    ? day<today?'MISSING':'PENDING'
    : !isClosed?'OPEN'
    : !planned?'UNPLANNED'
    : Math.abs(actual-planned)>toleranceMinutes?'DIFFERENCE':'MATCH'
  const delta=actual!==null ? actual-planned : null
  return {key:operatorId+'|'+day,operatorId,name,day,planned,actual,delta,events,status}
}
export const statusLabels:Record<ClockDayStatus,string>={
  MATCH:'Sin incidencias', DIFFERENCE:'Diferencia de horas',
  MISSING:'Falta fichaje', OPEN:'Jornada sin cerrar',
  PENDING:'Pendiente',UNPLANNED:'Fuera del cuadrante',
}
export const formatClockMinutes=(value:number|null) =>
  value===null?'—':(value<0?'-':'')+`${Math.floor(Math.abs(value)/60)} h ${String(Math.abs(value)%60).padStart(2,'0')} min`
