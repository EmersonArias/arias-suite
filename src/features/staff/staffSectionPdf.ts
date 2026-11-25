import { recoveryStatus } from './staffOvertimeDetails'
import { loadPdfLibraries } from '../../shared/components/reports/loadPdfLibraries'
import { previewPdf } from '../../shared/components/reports/pdfPreview'
import type { StaffDay, StaffOperator, StaffOvertime } from './staffModel'
import { vacationStage } from './staffModel'

function display(iso: string) {
  const parts = iso.split('-')
  return parts.length===3 ? parts[2]+'/'+parts[1]+'/'+parts[0] : iso
}
function time(minutes:number) {return (minutes/60).toLocaleString('es-ES',{maximumFractionDigits:2})+' h'}
function consumption(entry:StaffOvertime,ledger:StaffOvertime[]){
  const used=ledger.filter(e=>e.entry_type==='REST_TAKEN'&&e.compensates_entry_id===entry.id)
  return {minutes:used.reduce((n,e)=>n+e.minutes,0),dates:[...new Set(used.map(e=>e.entry_date))].sort()}
}

export async function staffSectionPdf(options:{
  section:'EXTRAS'|'VACACIONES'|'BAJAS',
  hotelName:string,year:number,operators:StaffOperator[],days:StaffDay[],
  overtime:StaffOvertime[],operatorId:string,operatorIds?:string[],statusFilter?:string
}) {
  const { jsPDF, autoTable } = await loadPdfLibraries()
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true})
  const heading=options.section==='EXTRAS'?'Horas extras':options.section==='VACACIONES'?'Vacaciones':'Bajas y ausencias'
  const people=options.operators.filter(p=>options.operatorIds!==undefined
    ?options.operatorIds.includes(p.id)
    :options.operatorId==='ALL'||p.id===options.operatorId)
  const names=new Map(options.operators.map(p=>[p.id,p.display_name]))
  const title=heading+' · '+options.year
  doc.setFontSize(16);doc.text(title,14,18)
  doc.setFontSize(9);doc.text(options.hotelName+' · Emitido '+new Date().toLocaleDateString('es-ES'),14,25)
  let head:string[]=[]
  let body:string[][]=[]
  if(options.section==='EXTRAS'){
    head=['Trabajador','Fecha','Tipo','Horas','Motivo','Estado','Origen horas','Fecha de recuperación']
    body=options.overtime.filter(e=>people.some(p=>p.id===e.operator_id))
       .sort((a,b)=>a.entry_date.localeCompare(b.entry_date)).map(e=>{
       const consumed=consumption(e,options.overtime)
       const source=e.entry_type==='EARNED'||e.entry_type==='ADJUSTMENT_PLUS'
       const state=source
         ?consumed.minutes===0?'Pendiente':consumed.minutes>=e.minutes?'Asignado':'Parcial'
         :e.entry_type==='REST_TAKEN'?recoveryStatus(e.entry_date):e.entry_type==='PAID'?'Abonado':'Ajuste'
       const dates=source?consumed.dates.map(display).join(', '):
         e.entry_type==='REST_TAKEN'?display(e.entry_date):'—'
       const sourceRecord=e.compensates_entry_id
         ?options.overtime.find(row=>row.id===e.compensates_entry_id):null
       const origin=e.entry_type==='REST_TAKEN'
         ?sourceRecord?display(sourceRecord.entry_date)+' · '+time(e.minutes):'Sin origen vinculado'
         :'—'
       return [names.get(e.operator_id)||'—',display(e.entry_date),
         ({EARNED:'Generadas',REST_TAKEN:'Recuperación',PAID:'Abonadas',ADJUSTMENT_PLUS:'Ajuste +',ADJUSTMENT_MINUS:'Ajuste -'} as Record<string,string>)[e.entry_type]||'Otro',
         time(e.minutes),e.reason,state,origin,dates||'—']
     })
  }else{
    head=['Trabajador','Fecha','Estado','Detalle']
    body=options.days.filter(d=>d.work_date.startsWith(String(options.year))&&
       people.some(p=>p.id===d.operator_id)&&
       (options.section==='VACACIONES'?['VACATION','VACATION_PREVIOUS'].includes(d.state):
         ['MEDICAL_LEAVE','UNJUSTIFIED_ABSENCE','PERSONAL_DAY','PERMISSION'].includes(d.state)))
      .filter(d=>options.section!=='VACACIONES'||!options.statusFilter||options.statusFilter==='ALL'||vacationStage(d)===options.statusFilter)
      .sort((a,b)=>a.work_date.localeCompare(b.work_date)).map(d=>[
        names.get(d.operator_id)||'—',display(d.work_date),
        options.section==='VACACIONES'?(d.state==='VACATION_PREVIOUS'?'Vac. año anterior':'Vacaciones'):
          ({MEDICAL_LEAVE:'Baja',UNJUSTIFIED_ABSENCE:'Ausencia',PERSONAL_DAY:'Asuntos propios',PERMISSION:d.source_code||'Permiso'} as Record<string,string>)[d.state]||d.state,
        options.section==='VACACIONES'?vacationStage(d)==='TAKEN'?'Disfrutadas':vacationStage(d)==='UPCOMING'?'Pendientes':'Por confirmar':
          ({DOCUMENTED:'Documentada',PENDING:'Pendiente',UNJUSTIFIED:'No justificada',UNKNOWN:'Sin verificar'} as Record<string,string>)[d.justification]||'Sin verificar'
      ])
  }
  autoTable(doc,{head:[head],body:body.length?body:[['Sin registros para el período',...head.slice(1).map(()=>'')]],
    startY:30,theme:'grid',styles:{fontSize:8,cellPadding:1.8,overflow:'linebreak'},
    headStyles:{fillColor:[28,64,87]},margin:{left:11,right:11,bottom:16},
    didDrawPage:()=>{doc.setFontSize(8);doc.text('Arias Suite · Informe interno',12,290)}
  })
  previewPdf(doc, 'arias_suite_'+options.section.toLowerCase()+'_'+options.year+'.pdf')
}
