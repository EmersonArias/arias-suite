import type { StaffDay,StaffOperator } from './staffModel'
import { holidayAudit, type HolidayItem } from './staffHolidayAudit'

type HistoryRow={
 id:string;operator_id:string;work_date:string;action:string;changed_at:string;
 actor_user_id:string|null;previous_values:Record<string,unknown>|null;
 new_values:Record<string,unknown>|null
}
const display=(date:string)=>date.split('-').reverse().join('/')
async function pdfBase(title:string,hotelName:string,year:number) {
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')])
 const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape',compress:true})
 doc.setFontSize(15);doc.text(title+' · '+year,11,15)
 doc.setFontSize(9);doc.text(hotelName+' · '+new Date().toLocaleDateString('es-ES'),11,22)
 return {doc,autoTable}
}
export async function exportHolidayAuditPdf(input:{
 hotelName:string;year:number;operators:StaffOperator[];days:StaffDay[];
 holidays:HolidayItem[];operatorIds:string[]
}){
 const people=input.operators.filter(o=>input.operatorIds.includes(o.id))
 if(!people.length)throw new Error('Selecciona uno o más operarios.')
 const audit=holidayAudit(people,input.days,input.holidays,input.year)
 const {doc,autoTable}=await pdfBase('Control de festivos',input.hotelName,input.year)
 const body=audit.matrix.map(r=>[
  display(r.holiday.holiday_date),r.holiday.label,r.operator.display_name,
  r.scheduled?.state??'Sin registrar',
  r.enjoyed.map(d=>display(d.work_date)).join(', ')||'—',
  r.duplicate?'DUPLICADO':r.excludedByLeave?'EXCLUIDO baja/vacaciones':r.pending?'PENDIENTE':'Registrado',
 ])
 autoTable(doc,{head:[['Festivo','Denominación','Trabajador','Estado del día','Disfrutado el','Situación']],
  body,theme:'grid',startY:28,styles:{fontSize:8,cellPadding:2},
  headStyles:{fillColor:[32,70,92]},margin:{left:10,right:10}})
 doc.save('arias_suite_festivos_'+input.year+'.pdf')
}
export async function exportStaffHistoryPdf(input:{
 hotelName:string;year:number;operators:StaffOperator[];
 history:HistoryRow[];operatorIds:string[]
}){
 const included=new Set(input.operatorIds)
 if(!included.size)throw new Error('Selecciona uno o más operarios.')
 const names=new Map(input.operators.map(o=>[o.id,o.display_name]))
 const {doc,autoTable}=await pdfBase('Historial de cambios de jornadas',input.hotelName,input.year)
 autoTable(doc,{head:[['Fecha del cambio','Operario','Día','Acción','Estado anterior','Estado nuevo','Usuario']],
  body:input.history.filter(row=>included.has(row.operator_id)).map(row=>[
    new Date(row.changed_at).toLocaleString('es-ES'),names.get(row.operator_id)??'—',
    display(row.work_date),row.action,String(row.previous_values?.state??'—'),
    String(row.new_values?.state??'—'),row.actor_user_id??'No identificado',
  ]),theme:'grid',startY:28,styles:{fontSize:7.5,cellPadding:2},
  headStyles:{fillColor:[32,70,92]},margin:{left:9,right:9}})
 doc.setFontSize(8);doc.text('Historial limitado a los últimos 200 cambios cargados del año.',10,200)
 doc.save('arias_suite_historial_'+input.year+'.pdf')
}
