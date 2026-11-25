import { loadPdfLibraries } from '../../shared/components/reports/loadPdfLibraries'
import { previewPdf } from '../../shared/components/reports/pdfPreview'
import type {StaffDay,StaffOperator} from './staffModel'
import {isoWeek,plannedMinutes,stateView} from './staffModel'

import { calendarMonth, calendarPeople, dayCode, entryTone, legend, monthNames, weekdays } from './staffCalendarLayout'

const calendarFills:Record<string,string>={
 white:'#FFFFFF', 'slate-100':'#F1F5F9', 'red-200':'#FECACA', 'emerald-100':'#D1FAE5',
 'emerald-200':'#A7F3D0', 'emerald-600':'#059669', 'fuchsia-200':'#F5D0FE',
 'amber-100':'#FEF3C7', 'amber-300':'#FCD34D', 'sky-200':'#BAE6FD',
 'teal-100':'#CCFBF1', 'orange-100':'#FFEDD5',
}

async function exportMonthlyCalendar(input:{hotelName:string;year:number;days:StaffDay[];holidays?:string[]},people:StaffOperator[]){
 const {jsPDF}=await loadPdfLibraries()
 const doc=new jsPDF({format:'a4',orientation:'landscape',unit:'mm',compress:true})
 const days=new Map(input.days.map(entry=>[entry.operator_id+'|'+entry.work_date,entry]))
 const holidays=new Set(input.holidays)
 const left=10, top=30, width=277, nameWidth=45, dayWidth=(width-nameWidth)/7
 const headerHeight=6, gap=2
 const cell=(text:string,x:number,y:number,w:number,h:number,fill:string,color:string,fontSize:number,align:'left'|'center'='center')=>{
   doc.setFillColor(fill)
   doc.setDrawColor('#E2E8F0')
   doc.rect(x,y,w,h,'FD')
   doc.setTextColor(color)
   const lines=text.split('\n')
   const size=Math.min(fontSize,h*2.5/lines.length)
   const spacing=size*25.4/72*1.15
   doc.setFontSize(size)
   doc.text(lines,align==='left'?x+1.8:x+w/2,y+h/2-(lines.length-1)*spacing/2,{align,baseline:'middle'})
 }
 monthNames.forEach((month,index)=>{
   if(index>0)doc.addPage()
   doc.setTextColor('#0F172A')
   doc.setFont('helvetica','bold')
   doc.setFontSize(17)
   doc.text(month+' · '+input.year,left,15)
   doc.setFont('helvetica','normal')
   doc.setFontSize(9)
   doc.text(input.hotelName,left,23)
   const dates=calendarMonth(input.year,index)
   const weeks=dates.length/7
   const rowHeight=Math.min(9,(184-top-weeks*headerHeight-(weeks-1)*gap)/(weeks*people.length))
   const fontSize=Math.min(10,rowHeight*1.8)
   let y=top
   for(let week=0;week<weeks;week++){
     const datesOfWeek=dates.slice(week*7,week*7+7)
     const outside=(date:string)=>Number(date.slice(5,7))!==index+1
     cell('S'+isoWeek(datesOfWeek[0]),left,y,nameWidth,headerHeight,'#F1F5F9','#475569',9,'left')
     datesOfWeek.forEach((date,i)=>{
       const official=!outside(date)&&holidays.has(date)
       cell(weekdays[i]+' '+Number(date.slice(8)),left+nameWidth+i*dayWidth,y,dayWidth,headerHeight,
         official?'#1D4ED8':'#F1F5F9',outside(date)?'#94A3B8':official?'#FFFFFF':i>=5?'#BE123C':'#475569',9)
     })
     y+=headerHeight
     for(const person of people){
       doc.setFont('helvetica','bold')
       doc.setFontSize(fontSize)
       const name=doc.splitTextToSize(person.display_name,nameWidth-4)[0]||''
       cell(name,left,y,nameWidth,rowHeight,'#F8FAFC','#1E293B',fontSize,'left')
       datesOfWeek.forEach((date,i)=>{
         const entry=days.get(person.id+'|'+date)
         const tone=entryTone(entry)
         const fill=calendarFills[tone.split(' ')[0].slice(3)]??'#FFFFFF'
         cell(outside(date)?'':dayCode(entry),left+nameWidth+i*dayWidth,y,dayWidth,rowHeight,
           outside(date)?'#F8FAFC':fill,tone.includes('text-white')?'#FFFFFF':'#1E293B',fontSize)
       })
       y+=rowHeight
     }
     y+=gap
   }
   doc.setFont('helvetica','normal')
   doc.setTextColor('#475569')
   doc.setFontSize(8)
   const notes=[...legend.map(item=>item.code+' '+item.text),'V verde oscuro: disfrutadas',
     'V?: por confirmar','I Falta no justificada','P Permiso','L Asuntos propios','E Formación','O Otros',
     'Cabecera azul: festivo del calendario']
   doc.text(doc.splitTextToSize(notes.join(' · '),width),left,191)
   doc.text((index+1)+' / '+monthNames.length,left+width,201,{align:'right'})
 })
 previewPdf(doc,'arias_suite_cuadrante_'+input.year+'.pdf')
}

const readable=(value:string)=>{const a=value.split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:value}
export async function exportPlannerSchedulePdf(input:{
 hotelName:string;year:number;operators:StaffOperator[];days:StaffDay[];
 mode:'CUADRANTE'|'FINES';operatorId:string;holidays?:string[]
}){
 if(input.mode==='CUADRANTE'){
   const people=calendarPeople(input.operators,input.operatorId)
   if(!people.length)throw new Error('No hay operarios para este PDF.')
   return exportMonthlyCalendar(input,people)
 }
 const people=input.operators.filter(o=>input.operatorId==='ALL'||o.id===input.operatorId)
 if(!people.length)throw new Error('No hay operarios para este PDF.')
 const { jsPDF, autoTable } = await loadPdfLibraries()
 const doc=new jsPDF({format:'a4',orientation:'landscape',unit:'mm',compress:true})
 const heading='Fines de semana'
 const list=input.days.filter(d=>people.some(p=>p.id===d.operator_id)&&
   d.work_date.startsWith(String(input.year))&&
   [0,6].includes(new Date(d.work_date+'T12:00:00Z').getUTCDay()))
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
 previewPdf(doc, 'arias_suite_'+input.mode.toLowerCase()+'_'+input.year+'.pdf')
}
