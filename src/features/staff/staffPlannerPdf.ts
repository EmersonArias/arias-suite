import type {StaffDay,StaffOperator} from './staffModel'
import {plannedMinutes,stateView} from './staffModel'

const readable=(value:string)=>{const a=value.split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:value}
export async function exportPlannerSchedulePdf(input:{
 hotelName:string;year:number;operators:StaffOperator[];days:StaffDay[];
 mode:'CUADRANTE'|'FINES';operatorId:string
}){
 const people=input.operators.filter(o=>input.operatorId==='ALL'||o.id===input.operatorId)
 if(!people.length)throw new Error('No hay operarios para este PDF.')
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')])
 const doc=new jsPDF({format:'a4',orientation:'landscape',unit:'mm',compress:true})
 const heading=input.mode==='FINES'?'Fines de semana':'Cuadrante horario'
 const list=input.days.filter(d=>people.some(p=>p.id===d.operator_id)&&
   d.work_date.startsWith(String(input.year))&&
   (input.mode!=='FINES'||[0,6].includes(new Date(d.work_date+'T12:00:00Z').getUTCDay())))
   .sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.operator_id.localeCompare(b.operator_id))
 doc.setFontSize(15);doc.text(heading+' · '+input.year,10,16)
 doc.setFontSize(9);doc.text(input.hotelName+' · '+(input.operatorId==='ALL'?'Todos los operarios':people[0]?.display_name??''),10,23)
 autoTable(doc,{startY:30,theme:'grid',margin:{left:9,right:9,bottom:15},
   head:[['Trabajador','Fecha','Estado','Horario','Horas previstas']],
   body:list.length?list.map(d=>[
     people.find(p=>p.id===d.operator_id)?.display_name??'—',readable(d.work_date),
     stateView(d.state).label,
     d.state==='SHIFT'?(d.start_time??'—')+' – '+(d.end_time??'—'):'—',
     d.state==='SHIFT'?(plannedMinutes(d)/60).toLocaleString('es-ES',{maximumFractionDigits:2})+' h':'—',
   ]):[['Sin registros','—','—','—','—']],
   styles:{fontSize:8,cellPadding:2},
   headStyles:{fillColor:[30,55,75]},
   didDrawPage:({pageNumber})=>{doc.setFontSize(8);doc.text('Arias Suite · '+heading+' · Página '+pageNumber,10,200)},
 })
 doc.save('arias_suite_'+input.mode.toLowerCase()+'_'+input.year+'.pdf')
}
