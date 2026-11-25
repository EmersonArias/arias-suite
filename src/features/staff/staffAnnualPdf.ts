import { loadPdfLibraries } from '../../shared/components/reports/loadPdfLibraries'
import { previewPdf } from '../../shared/components/reports/pdfPreview'
import type { StaffOperator } from './staffModel'

export type AnnualRow={
 operator:StaffOperator
 planned:number
 shifts:number
 total:number
 vacation:number
 sick:number
 earned:number
 compensated:number
 paid:number
 cumulativeBalance:number
}
const duration=(minutes:number)=>Math.round(minutes/60*100)/100
export async function exportAnnualStaffPdf(input:{
 year:number;hotelName:string;rows:AnnualRow[]
}) {
 const { jsPDF, autoTable } = await loadPdfLibraries()
 const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape',compress:true})
 doc.setProperties({title:'Resumen anual de personal · '+input.year,
   subject:'Horas previstas, vacaciones previstas y saldos de horas extras'})
 doc.setFontSize(16);doc.text('Planificador · Resumen anual '+input.year,12,16)
 doc.setFontSize(9);doc.text(input.hotelName+'  ·  Emitido '+new Date().toLocaleDateString('es-ES'),12,22)
 const body=input.rows.map(row=>[
   row.operator.display_name,duration(row.planned).toLocaleString('es-ES')+' h',
   String(row.shifts),String(row.total),String(row.vacation)+' d',String(row.sick)+' d',
   duration(row.earned).toLocaleString('es-ES')+' h',
   duration(row.compensated).toLocaleString('es-ES')+' h',
   duration(row.paid).toLocaleString('es-ES')+' h',
   duration(Math.max(0,row.cumulativeBalance)).toLocaleString('es-ES')+' h',
 ])
 autoTable(doc,{
   startY:28,theme:'grid',margin:{left:9,right:9,bottom:18},
   head:[['Trabajador','Horas previstas','Turnos','F. semana','Vacaciones previstas',
     'Bajas','H. extra generadas','Disfrutadas','Pagadas','Saldo pendiente']],
   body:body.length?body:[['Sin registros','','','','','','','','','']],
   styles:{fontSize:7.5,cellPadding:2,overflow:'linebreak'},
   headStyles:{fillColor:[26,63,84]},
   didDrawPage:()=>{doc.setFontSize(8);doc.text('Arias Suite · Documento interno',10,197)},
 })
 doc.setFontSize(8)
 const y=Math.min(184,(doc as typeof doc&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??175)+6
 doc.text('Saldo pendiente: horas no compensadas ni abonadas, sin atribuirles automáticamente una forma de liquidación.',10,y)
 previewPdf(doc, 'arias_suite_resumen_anual_'+input.year+'.pdf')
}
