import type { StaffDay,StaffOperator } from './staffModel'
import { holidayAudit, type HolidayItem } from './staffHolidayAudit'

type HistoryRow={
 id:string;operator_id:string;work_date:string;action:string;entity_kind:string;changed_at:string;
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
 holidays:HolidayItem[];operatorIds:string[];firstScheduledDates:Record<string,string>
}){
 const people=input.operators.filter(o=>input.operatorIds.includes(o.id))
 if(!people.length)throw new Error('Selecciona uno o más operarios.')
 const audit=holidayAudit(people,input.days,input.holidays,input.year,input.firstScheduledDates)
 const {doc,autoTable}=await pdfBase('Control de festivos',input.hotelName,input.year)
 // Cada trabajador tiene su propia página: el nombre solo aparece en cabecera.
 // El informe simplificado muestra únicamente fecha, denominación y disfrute.
 people.forEach((person,index)=>{
   if(index>0){
     doc.addPage()
     doc.setFontSize(15);doc.text('Control de festivos · '+input.year,11,15)
     doc.setFontSize(9);doc.text(input.hotelName+' · '+new Date().toLocaleDateString('es-ES'),11,22)
   }
   const rows=audit.matrix.filter(row=>row.operator.id===person.id)
   doc.setFontSize(12)
   doc.text('Trabajador: '+person.display_name,11,29)
   doc.setFontSize(8)
   const origin=person.join_date??input.firstScheduledDates[person.id]??null
   doc.text('Incorporación: '+(origin?display(origin):'Sin fecha registrada')+
     (!person.join_date&&origin?' (referencia provisional del cuadrante)':''),11,35)
   autoTable(doc,{
     head:[['Festivo','Denominación','Disfrutado el']],
     body:rows.map(row=>[
       display(row.holiday.holiday_date),row.holiday.label,
       row.enjoyed.map(d=>display(d.work_date)).join(', ')||
         (row.beforeJoining?'No corresponde · anterior al alta':
          row.excludedByLeave?'No corresponde · baja/vacaciones':'—'),
     ]),
     theme:'grid',startY:41,styles:{fontSize:9,cellPadding:3},
     headStyles:{fillColor:[32,70,92]},margin:{left:10,right:10},
   })
 })
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
 autoTable(doc,{head:[['Fecha del cambio','Operario','Día','Origen','Acción','Anterior','Nuevo','Usuario']],
  body:input.history.filter(row=>included.has(row.operator_id)).map(row=>[
    new Date(row.changed_at).toLocaleString('es-ES'),names.get(row.operator_id)??'—',
    display(row.work_date),row.entity_kind,row.action,String(row.previous_values?.state??'—'),
    String(row.new_values?.state??'—'),row.actor_user_id??'No identificado',
  ]),theme:'grid',startY:28,styles:{fontSize:7.5,cellPadding:2},
  headStyles:{fillColor:[32,70,92]},margin:{left:9,right:9}})
 doc.setFontSize(8);doc.text('Historial limitado a los últimos 200 cambios cargados del año.',10,200)
 doc.save('arias_suite_historial_'+input.year+'.pdf')
}
