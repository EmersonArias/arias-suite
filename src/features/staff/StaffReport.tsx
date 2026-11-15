import { useEffect, useMemo, useState } from 'react'
import { FileDown, FileText, Printer, Search } from 'lucide-react'
import { addDays, dateISO, fromISO, isoWeek, mondayOf, isVacationState,
  vacationStage, vacationCode, isSplitShift, plannedMinutes, type StaffDay, type StaffOperator } from './staffModel'
import { loadAllStaffDays } from './staffData'
import { supabase } from '../../lib/supabase'

type PeriodType = 'DAY' | 'MONTH' | 'YEAR' | 'DATES' | 'MONTHS'
type ReportOptions = {
  start: string
  end: string
  operatorId: string
  status: string
}
type ReportSnapshot = ReportOptions & { days: StaffDay[]; holidayDates: string[] }

const periodOptions: { value: PeriodType; label: string }[] = [
  { value: 'DAY', label: 'Día' }, { value: 'MONTH', label: 'Mes' },
  { value: 'YEAR', label: 'Año' }, { value: 'DATES', label: 'Entre fechas' },
  { value: 'MONTHS', label: 'Entre meses' },
]
const statusOptions = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'SHIFT', label: 'Turnos' },
  { value: 'REST', label: 'Descansos' },
  { value: 'VACATION', label: 'Vacaciones' },
  { value: 'MEDICAL_LEAVE', label: 'Bajas' },
  { value: 'PUBLIC_HOLIDAY', label: 'Festivos' },
  { value: 'COMP_REST', label: 'Recuperación de horas' },
]
const input = 'min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-600 sm:text-sm'
const palette: Record<string, { bg: string; fg: string; pdfBg: [number,number,number]; pdfFg: [number,number,number] }> = {
  SHIFT: {bg:'#FFFFFF', fg:'#334155',pdfBg:[255,255,255],pdfFg:[51,65,85]},
  REST: {bg:'#FECACA',fg:'#7F1D1D',pdfBg:[254,202,202],pdfFg:[127,29,29]},
  VACATION: {bg:'#A7F3D0',fg:'#064E3B',pdfBg:[167,243,208],pdfFg:[6,78,59]},
  VACATION_PREVIOUS: {bg:'#A7F3D0',fg:'#064E3B',pdfBg:[167,243,208],pdfFg:[6,78,59]},
  MEDICAL_LEAVE: {bg:'#F5D0FE',fg:'#701A75',pdfBg:[245,208,254],pdfFg:[112,26,117]},
  PUBLIC_HOLIDAY: {bg:'#FCD34D',fg:'#78350F',pdfBg:[252,211,77],pdfFg:[120,53,15]},
  COMP_REST: {bg:'#BAE6FD',fg:'#0C4A6E',pdfBg:[186,230,253],pdfFg:[12,74,110]},
  PERMISSION: {bg:'#FEF3C7',fg:'#92400E',pdfBg:[254,243,199],pdfFg:[146,64,14]},
  PERSONAL_DAY: {bg:'#FEF3C7',fg:'#92400E',pdfBg:[254,243,199],pdfFg:[146,64,14]},
  TRAINING: {bg:'#CCFBF1',fg:'#115E59',pdfBg:[204,251,241],pdfFg:[17,94,89]},
  UNJUSTIFIED_ABSENCE: {bg:'#FECACA',fg:'#991B1B',pdfBg:[254,202,202],pdfFg:[153,27,27]},
  OTHER: {bg:'#FFEDD5',fg:'#9A3412',pdfBg:[255,237,213],pdfFg:[154,52,18]},
  UNASSIGNED: {bg:'#F1F5F9',fg:'#64748B',pdfBg:[241,245,249],pdfFg:[100,116,139]},
}
const colorFor = (state: string) => palette[state] ?? palette.UNASSIGNED
const colorForEntry = (entry?: StaffDay) => {
  if(!entry)return palette.UNASSIGNED
  if(!isVacationState(entry.state))return colorFor(entry.state)
  const stage=vacationStage(entry)
  if(stage==='TAKEN')return {bg:'#047857',fg:'#FFFFFF',
    pdfBg:[4,120,87] as [number,number,number],pdfFg:[255,255,255] as [number,number,number]}
  if(stage==='UNVERIFIED')return {bg:'#ECFDF5',fg:'#065F46',
    pdfBg:[236,253,245] as [number,number,number],pdfFg:[6,95,70] as [number,number,number]}
  return colorFor(entry.state)
}
const shortDate = (day: string) => fromISO(day).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
const hourOnly = (time?:string|null) => {
  if (!time) return '—'
  const [h,m] = time.slice(0,5).split(':')
  return String(Number(h)) + (m==='00'?'':':'+m)
}
const stateCode = (entry?:StaffDay) => {
  if(!entry) return '—'
  switch(entry.state){
    case 'SHIFT': return isSplitShift(entry.start_time,entry.end_time)
      ? '9–13\n15–19' : hourOnly(entry.start_time)+'–'+hourOnly(entry.end_time)
    case 'REST': return 'D'
    case 'VACATION':
    case 'VACATION_PREVIOUS': return vacationCode(entry)
    case 'MEDICAL_LEAVE': return 'B'
    case 'PUBLIC_HOLIDAY': {
      const source=entry.source_code??''
      const ref=source.match(/(\d{4})-(\d{2})-(\d{2})/)
      if(ref)return 'F\n'+ref[3]+'/'+ref[2]
      const direct=source.match(/^(\d{2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i)
      if(direct){
        const months:Record<string,string>={ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',
          jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'}
        return 'F\n'+direct[1]+'/'+months[direct[2].toLowerCase()]
      }
      return 'F'
    }
    case 'COMP_REST': {
      const ref=entry.source_code?.match(/^R\s*(\d{2}[-/]\d{2})/i)
      return ref ? 'R\n'+ref[1].replace('-', '/') : 'R'
    }
    case 'PERMISSION': return 'P'
    case 'PERSONAL_DAY': return 'L'
    case 'TRAINING': return 'E'
    case 'UNJUSTIFIED_ABSENCE': return 'I'
    case 'OTHER': return 'O'
    default: return '—'
  }
}
const esc = (s:string) => s.replace(/[&<>"']/g,c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
} as Record<string,string>)[c] ?? c)

function monthEnd(value:string) {
  const [y,m] = value.split('-').map(Number)
  return dateISO(new Date(y,m,0,12))
}
function dayCount(start:string,end:string) {
  return Math.round((fromISO(end).getTime()-fromISO(start).getTime())/86400000)+1
}
function selectedRange(type:PeriodType,year:number,day:string,month:string,startDate:string,endDate:string,startMonth:string,endMonth:string) {
  if(type==='DAY') return {start:day,end:day}
  if(type==='MONTH') return {start:month+'-01',end:monthEnd(month)}
  if(type==='YEAR') return {start:year+'-01-01',end:year+'-12-31'}
  if(type==='MONTHS') return {start:startMonth+'-01',end:monthEnd(endMonth)}
  return {start:startDate,end:endDate}
}

type Props = {
  hotelId: string
  hotelName: string
  operators: StaffOperator[]
  initialYear: number
}
export default function StaffReport({hotelId,hotelName,operators,initialYear}:Props){
  const now=dateISO(new Date())
  const initialMonth=String(initialYear)+(now.slice(0,4)===String(initialYear)?now.slice(4,7):'-01')
  const [period,setPeriod]=useState<PeriodType>('MONTH')
  const [year,setYear]=useState(initialYear)
  const [day,setDay]=useState(initialMonth+'-01')
  const [month,setMonth]=useState(initialMonth)
  const [startDate,setStartDate]=useState(initialMonth+'-01')
  const [endDate,setEndDate]=useState(monthEnd(initialMonth))
  const [startMonth,setStartMonth]=useState(initialMonth)
  const [endMonth,setEndMonth]=useState(initialMonth)
  const [operatorId,setOperatorId]=useState('ALL')
  const [status,setStatus]=useState('ALL')
  const [snapshot,setSnapshot]=useState<ReportSnapshot|null>(null)
  const [loading,setLoading]=useState(false)
  const [exporting,setExporting]=useState(false)
  const [error,setError]=useState('')
  const range=selectedRange(period,year,day,month,startDate,endDate,startMonth,endMonth)

  async function generate(next:ReportOptions) {
    setError('')
    if (!next.start || !next.end || next.start > next.end) {
      setError('Revisa el período: la fecha inicial debe ser anterior o igual a la final.')
      return
    }
    const days=dayCount(next.start,next.end)
    if (!Number.isFinite(days) || days<1 || days>731) {
      setError('Selecciona un período de hasta dos años por reporte.')
      return
    }
    setLoading(true)
    const [result, holidayResult]=await Promise.all([
      loadAllStaffDays({hotelId,startDate:next.start,endDate:next.end}),
      supabase.from('staff_calendar_holidays').select('holiday_date').eq('hotel_id',hotelId)
        .gte('holiday_date',next.start).lte('holiday_date',next.end),
    ])
    if(result.error||holidayResult.error) setError((result.error||holidayResult.error)!.message)
    else setSnapshot({...next,days:result.data,holidayDates:(holidayResult.data??[]).map(h=>h.holiday_date)})
    setLoading(false)
  }
  // Show an immediately useful preview for the current month.
  useEffect(()=>{
    let alive=true
    const start=initialMonth+'-01'
    const end=monthEnd(initialMonth)
    void Promise.all([
      loadAllStaffDays({hotelId,startDate:start,endDate:end}),
      supabase.from('staff_calendar_holidays').select('holiday_date').eq('hotel_id',hotelId)
        .gte('holiday_date',start).lte('holiday_date',end),
    ]).then(([result,holidayResult])=>{
      if(!alive)return
      if(result.error||holidayResult.error)setError((result.error||holidayResult.error)!.message)
      else setSnapshot({start,end,operatorId:'ALL',status:'ALL',days:result.data,
        holidayDates:(holidayResult.data??[]).map(h=>h.holiday_date)})
    })
    return ()=>{alive=false}
  },[hotelId,initialMonth])

  const displayedOperators=useMemo(()=>snapshot?.operatorId==='ALL'
    ? operators
    : operators.filter(o=>o.id===snapshot?.operatorId),[operators,snapshot?.operatorId])
  const entries=useMemo(()=>new Map((snapshot?.days??[]).map(d=>[d.operator_id+'|'+d.work_date,d])),[snapshot?.days])
  const holidaySet=useMemo(()=>new Set(snapshot?.holidayDates??[]),[snapshot?.holidayDates])
  const rawDates=useMemo(()=>{
    if(!snapshot)return [] as string[]
    return Array.from({length:dayCount(snapshot.start,snapshot.end)},(_,i)=>addDays(snapshot.start,i))
  },[snapshot?.start,snapshot?.end])
  const dates=useMemo(()=>rawDates.filter(d=>{
    if(!snapshot||snapshot.status==='ALL')return true
    return displayedOperators.some(o=>{
      const entry=entries.get(o.id+'|'+d)
      return snapshot.status==='VACATION' ? ['VACATION','VACATION_PREVIOUS'].includes(entry?.state??'')
        : entry?.state===snapshot.status
    })
  }),[rawDates,snapshot?.status,displayedOperators,entries])
  const selectedEntry = (operatorId:string, date:string):StaffDay|undefined => {
    if(!dateSet.has(date))return undefined
    const entry=entries.get(operatorId+'|'+date)
    if(!entry)return undefined
    if(snapshot?.status==='ALL')return entry
    if(snapshot?.status==='VACATION')return ['VACATION','VACATION_PREVIOUS'].includes(entry.state)?entry:undefined
    return snapshot?.status===entry.state?entry:undefined
  }
  const dateSet=new Set(dates)
  const weekGroups=useMemo(()=>{
    const groups=new Map<string,string[]>()
    for(const date of dates){
      const weekStart=mondayOf(date)
      if(!groups.has(weekStart))groups.set(weekStart,Array.from({length:7},(_,i)=>addDays(weekStart,i)))
    }
    return [...groups].map(([start,week])=>({start,week}))
  },[dates])
  const weekCaption=(start:string)=>{
    const finish=addDays(start,6)
    return 'Semana '+isoWeek(start)+' · '+shortDate(start)+' – '+shortDate(finish)
  }
  const weekdays=['L','M','X','J','V','S','D']
  const dateHeading=(value:string,index:number)=>weekdays[index]+' '+fromISO(value).getDate()
  const previewWeeks=weekGroups.slice(0,7)
  const totals=useMemo(()=>displayedOperators.map(o=>{
    const own=(snapshot?.days??[]).filter(d=>d.operator_id===o.id && (snapshot?.status==='ALL' || dates.includes(d.work_date)))
    return {
      person:o,
      shifts:own.filter(d=>d.state==='SHIFT').length,
      minutes:own.filter(d=>d.state==='SHIFT').reduce((n,d)=>n+plannedMinutes(d),0),
      vacations:own.filter(d=>['VACATION','VACATION_PREVIOUS'].includes(d.state)).length,
      rests:own.filter(d=>d.state==='REST').length,
      medical:own.filter(d=>d.state==='MEDICAL_LEAVE').length,
    }
  }),[displayedOperators,snapshot?.days,snapshot?.status,dates])
  const stateLabel=statusOptions.find(o=>o.value===snapshot?.status)?.label??'Todos los estados'
  const periodLabel=snapshot ? shortDate(snapshot.start)+(snapshot.start===snapshot.end?'':' – '+shortDate(snapshot.end)):''
  const filename=snapshot ? 'horarios_'+snapshot.start+'_'+snapshot.end+(snapshot.operatorId==='ALL'?'_todos':'_operario')+'.pdf':'horarios.pdf'
  const unchanged=!!snapshot && snapshot.start===range.start && snapshot.end===range.end && snapshot.operatorId===operatorId && snapshot.status===status
  const statusLegend=[
    ['SHIFT','Horario (9–13/15–19: 8 h)'],['REST','D Descanso'],['VACATION','V Programadas'],
    ['VACATION_PREVIOUS','A25 Vac. de 2025 / A26 de 2026'],['MEDICAL_LEAVE','B Baja'],
    ['PUBLIC_HOLIDAY','F Festivo disfrutado'],['COMP_REST','R Recuperable'], 
  ]
  const summaryNote='Horario previsto. Las vacaciones pasadas no se consideran disfrutadas hasta su confirmación.'
  const previewCapped=weekGroups.length>previewWeeks.length

  async function exportPdf(){
    if(!snapshot||loading||exporting||!unchanged)return
    setExporting(true);setError('')
    try {
      const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')])
      const doc=new jsPDF({orientation:period==='MONTH'?'portrait':'landscape',unit:'mm',format:'a4',compress:true})
      doc.setProperties({title:'Planificador horario · '+periodLabel,subject:'Reporte de turnos'})
      const pageWidth=period==='MONTH'?210:297
      doc.setFont('helvetica','bold');doc.setFontSize(12)
      doc.text('PLANIFICADOR HORARIO · DEPARTAMENTO DE MANTENIMIENTO',9,11)
      doc.setFont('helvetica','normal');doc.setFontSize(8)
      doc.text(doc.splitTextToSize(hotelName.slice(0,64)+'  ·  '+periodLabel,pageWidth-18)[0],9,17)
      doc.text(doc.splitTextToSize('Filtro: '+stateLabel+'  ·  '+(snapshot.operatorId==='ALL'?'Todos los operarios':displayedOperators[0]?.display_name??''),pageWidth-18)[0],9,22)

      // A4 vertical, una sola página. Cada bloque reproduce una semana de la vista de calendario.
      if(period==='MONTH'){
        const monthWeeks=[...new Set(rawDates.map(value=>mondayOf(value)))].map(start=>({
          start,
          week:Array.from({length:7},(_,i)=>addDays(start,i)),
        }))
        const left=8.5, right=201.5, contentWidth=right-left
        const nameWidth=39, dayWidth=(contentWidth-nameWidth)/7
        const gridTop=30, gridBottom=251
        const captionHeight=6, dayHeadingHeight=7, gap=1.8
        const groupCount=Math.max(1,monthWeeks.length)
        const personCount=Math.max(1,displayedOperators.length)
        const rowHeight=Math.min(17,Math.max(0.3,
          (gridBottom-gridTop-groupCount*(captionHeight+dayHeadingHeight)-(groupCount-1)*gap)/
          (groupCount*personCount)))
        const drawText=(value:string,x:number,y:number,width:number,height:number,baseSize:number,color:[number,number,number],leftAlign=false)=>{
          const lines=height>=4.5?value.split('\n'):[value.replace(/\n/g,' / ')]
          const size=Math.min(baseSize,Math.max(1.5,height*0.91/Math.max(1,lines.length)))
          doc.setFont('helvetica','bold');doc.setFontSize(size)
          const widest=Math.max(0,...lines.map(line=>doc.getTextWidth(line)))
          if(widest>width-1.5) doc.setFontSize(Math.max(1.3,size*(width-1.5)/widest))
          doc.setTextColor(...color)
          const step=Math.min(height/Math.max(1,lines.length),doc.getFontSize()*0.36)
          const start=y+height/2-(lines.length-1)*step/2+doc.getFontSize()*0.14
          lines.forEach((line,i)=>doc.text(line,leftAlign?x+1.5:x+width/2,start+i*step,leftAlign?undefined:{align:'center'}))
        }
        let y=gridTop
        monthWeeks.forEach(({start,week},weekIndex)=>{
          doc.setFillColor(226,232,240);doc.setDrawColor(203,213,225)
          doc.rect(left,y,contentWidth,captionHeight,'FD')
          doc.setTextColor(30,41,59);doc.setFont('helvetica','bold');doc.setFontSize(7.7)
          doc.text(weekCaption(start),left+2,y+4.2)
          y+=captionHeight
          doc.setFillColor(248,250,252);doc.setDrawColor(203,213,225)
          doc.rect(left,y,nameWidth,dayHeadingHeight,'FD')
          drawText('TRABAJADOR',left,y,nameWidth,dayHeadingHeight,6.8,[30,41,59],true)
          week.forEach((date,dayIndex)=>{
            const x=left+nameWidth+dayIndex*dayWidth
            const inside=date>=snapshot.start&&date<=snapshot.end
            const officialHoliday=inside&&holidaySet.has(date)
            const weekend=dayIndex>=5
            const bg:[number,number,number]=!inside?[242,245,249]:
              officialHoliday?[29,78,216]:weekend?[226,232,240]:[248,250,252]
            const fg:[number,number,number]=officialHoliday?[255,255,255]:
              !inside?[148,163,184]:weekend?[159,18,57]:[30,41,59]
            doc.setFillColor(...bg);doc.setDrawColor(203,213,225)
            doc.rect(x,y,dayWidth,dayHeadingHeight,'FD')
            drawText(dateHeading(date,dayIndex),x,y,dayWidth,dayHeadingHeight,7,fg)
          })
          y+=dayHeadingHeight
          displayedOperators.forEach(person=>{
            doc.setFillColor(248,250,252);doc.setDrawColor(203,213,225)
            doc.rect(left,y,nameWidth,rowHeight,'FD')
            drawText(person.display_name,left,y,nameWidth,rowHeight,8,[30,41,59],true)
            week.forEach((date,dayIndex)=>{
              const x=left+nameWidth+dayIndex*dayWidth
              const inside=date>=snapshot.start&&date<=snapshot.end
              const selected=inside&&dateSet.has(date)
              const entry=selected?selectedEntry(person.id,date):undefined
              const color=colorForEntry(entry)
              const bg:[number,number,number]=!inside?[245,247,250]:selected?color.pdfBg:[248,250,252]
              doc.setFillColor(...bg);doc.setDrawColor(226,232,240)
              doc.rect(x,y,dayWidth,rowHeight,'FD')
              if(selected)drawText(stateCode(entry),x,y,dayWidth,rowHeight,8.1,color.pdfFg)
            })
            y+=rowHeight
          })
          if(weekIndex<monthWeeks.length-1)y+=gap
        })
        // Leyenda completa, en cuatro columnas, con los mismos colores que aparecen en pantalla.
        doc.setFont('helvetica','bold');doc.setTextColor(30,41,59);doc.setFontSize(8)
        doc.text('LEYENDA · CÓDIGOS Y COLORES',left,258)
        const legendItems=[
          {code:'T',label:'Turno / horario',bg:[255,255,255],fg:[51,65,85]},
          {code:'D',label:'Descanso',bg:[254,202,202],fg:[127,29,29]},
          {code:'V',label:'Vacaciones disfrutadas',bg:[4,120,87],fg:[255,255,255]},
          {code:'A25',label:'Vacaciones anteriores',bg:[167,243,208],fg:[6,78,59]},
          {code:'F',label:'Festivo disfrutado',bg:[252,211,77],fg:[120,53,15]},
          {code:'R',label:'Recuperable',bg:[186,230,253],fg:[12,74,110]},
          {code:'B',label:'Baja médica',bg:[245,208,254],fg:[112,26,117]},
          {code:'P',label:'Permiso',bg:[254,243,199],fg:[146,64,14]},
          {code:'L',label:'Asuntos propios',bg:[254,243,199],fg:[146,64,14]},
          {code:'E',label:'Formación',bg:[204,251,241],fg:[17,94,89]},
          {code:'I',label:'Ausencia',bg:[254,202,202],fg:[153,27,27]},
          {code:'O',label:'Otros',bg:[255,237,213],fg:[154,52,18]},
          {code:'?',label:'V sin confirmar',bg:[236,253,245],fg:[6,95,70]},
          {code:'AZ',label:'Día festivo (cabecera)',bg:[29,78,216],fg:[255,255,255]},
        ] as Array<{code:string;label:string;bg:[number,number,number];fg:[number,number,number]}>
        const legendColumnWidth=contentWidth/4
        legendItems.forEach((item,i)=>{
          const lx=left+(i%4)*legendColumnWidth,ly=261+Math.floor(i/4)*6.2
          doc.setFillColor(...item.bg);doc.setDrawColor(203,213,225)
          doc.rect(lx,ly,7,4.6,'FD')
          drawText(item.code,lx,ly,7,4.6,5.4,item.fg)
          doc.setFont('helvetica','normal');doc.setFontSize(6.3);doc.setTextColor(51,65,85)
          doc.text(item.label,lx+8.2,ly+3.15)
        })
        doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(75,85,99)
        doc.text('Turno partido: 09–13 / 15–19 = 8 horas. F: festivo. R: recuperable.',left,289)
        doc.setFontSize(6)
        doc.text(summaryNote,left,293)
        doc.text('Pág. 1/1',right,293,{align:'right'})
        doc.save(filename)
        return
      }
      const body=weekGroups.flatMap(({start,week})=>[
        [{content:weekCaption(start),colSpan:8,styles:{fillColor:[226,232,240] as [number,number,number],
          textColor:[30,41,59] as [number,number,number],fontStyle:'bold' as const,halign:'left' as const}}],
        [
          {content:'',styles:{fillColor:[255,255,255] as [number,number,number],textColor:[30,41,59] as [number,number,number],fontStyle:'bold' as const}},
          ...week.map((day,i)=>({content:dateHeading(day,i),styles:{
            fillColor:(holidaySet.has(day)?[29,78,216]:[255,255,255]) as [number,number,number],
            textColor:(holidaySet.has(day)?[255,255,255]:[30,41,59]) as [number,number,number],
            fontStyle:'bold' as const,halign:'center' as const}})),
        ],
        ...displayedOperators.map(person=>[
          {content:person.display_name,styles:{fontStyle:'bold' as const,textColor:[30,41,59] as [number,number,number]}},
          ...week.map(day=>{
            const entry=selectedEntry(person.id,day)
            const color=colorForEntry(entry)
            const inRange=dateSet.has(day)
            return {content:inRange?stateCode(entry):'',styles:{
              fillColor:inRange?color.pdfBg:([248,250,252] as [number,number,number]),
              textColor:color.pdfFg,fontStyle:'bold' as const,halign:'center' as const,
            }}
          }),
        ]),
      ])
      const compactSummary=totals.map(t=>t.person.display_name+': '+t.shifts+'T '+t.vacations+'V '+t.medical+'B').join('   |   ')
      doc.setFont('helvetica','normal');doc.setFontSize(7)
      doc.text(compactSummary.slice(0,185),9,26)
      autoTable(doc,{
        body,
        startY:30,margin:{left:9,right:9,top:9,bottom:15},
        theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:1.1,overflow:'ellipsize',minCellHeight:4.4},
        columnStyles:{0:{cellWidth:34,fontStyle:'bold',textColor:[30,41,59]}},
        rowPageBreak:'avoid',
        didDrawPage:({pageNumber})=>{
          doc.setFont('helvetica','normal');doc.setFontSize(6.2)
          doc.setTextColor(75,85,99)
          doc.text('Cabecera azul: festivo del calendario   |   Mostaza (15/08): festivo disfrutado   |   Celeste (R): recuperable',9,198.5)
          doc.text('9-13 / 15-19: turno partido (8 h) | D: descanso | V: vacaciones | A25/A26: anteriores | B: baja',9,201.5)
          doc.text(summaryNote,9,204.5)
          doc.text('Pag. '+pageNumber,pageWidth-18,204.5)
        },
      })
      if(dates.length===0){doc.setFontSize(10);doc.text('No hay registros para los filtros seleccionados.',10,37)}
      doc.save(filename)
    } catch(e) {
      setError('No se pudo generar el PDF: '+(e instanceof Error?e.message:'Error desconocido'))
    } finally {
      setExporting(false)
    }
  }

  function printReport(){
    if(!snapshot||loading||!unchanged)return
    const page=window.open('','_blank')
    if(!page){setError('El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes.');return}

    const heading=esc(hotelName)+' · '+esc(periodLabel)
    // Impresión del mes: mismo diseño semanal apilado, en A4 vertical.
    if(period==='MONTH'){
      const monthWeeks=[...new Set(rawDates.map(value=>mondayOf(value)))].map(start=>({
        start,week:Array.from({length:7},(_,i)=>addDays(start,i)),
      }))
      const groupCount=Math.max(1,monthWeeks.length)
      const peopleCount=Math.max(1,displayedOperators.length)
      const captionMm=6,dayHeadMm=7,gapMm=1.6
      const rowMm=Math.min(17,Math.max(0.3,
        (207-groupCount*(captionMm+dayHeadMm)-(groupCount-1)*gapMm)/(groupCount*peopleCount)))
      const fontPt=Math.min(9,Math.max(2,rowMm*0.86))
      const bodyHtml=monthWeeks.map(({start,week})=>{
        const daysHeading=week.map((date,i)=>{
          const inside=date>=snapshot.start&&date<=snapshot.end
          const holiday=inside&&holidaySet.has(date)
          const weekend=i>=5
          const background=!inside?'#f2f5f9':holiday?'#1d4ed8':weekend?'#e2e8f0':'#f8fafc'
          const color=holiday?'#fff':!inside?'#94a3b8':weekend?'#9f1239':'#1e293b'
          return '<th style="background:'+background+';color:'+color+'">'+esc(dateHeading(date,i))+'</th>'
        }).join('')
        const people=displayedOperators.map(person=>{
          const cells=week.map(date=>{
            const inside=date>=snapshot.start&&date<=snapshot.end
            const active=inside&&dateSet.has(date)
            const entry=active?selectedEntry(person.id,date):undefined
            const colors=colorForEntry(entry)
            const bg=!inside?'#f5f7fa':active?colors.bg:'#f8fafc'
            const value=active?esc(stateCode(entry)).replace(/\n/g,'<br>'):''
            return '<td style="background:'+bg+';color:'+colors.fg+'">'+value+'</td>'
          }).join('')
          return '<tr><th class="person">'+esc(person.display_name)+'</th>'+cells+'</tr>'
        }).join('')
        return '<section class="week"><h2>'+esc(weekCaption(start))+'</h2>'+
          '<table><thead><tr><th class="person">Trabajador</th>'+daysHeading+
          '</tr></thead><tbody>'+people+'</tbody></table></section>'
      }).join('')
      const legendValues=[
        ['T','Turno / horario','#ffffff','#334155'],['D','Descanso','#fecaca','#7f1d1d'],
        ['V','Vacaciones disfrutadas','#047857','#ffffff'],['A25','Vacaciones anteriores','#a7f3d0','#064e3b'],
        ['F','Festivo disfrutado','#fcd34d','#78350f'],['R','Recuperable','#bae6fd','#0c4a6e'],
        ['B','Baja médica','#f5d0fe','#701a75'],['P','Permiso','#fef3c7','#92400e'],
        ['L','Asuntos propios','#fef3c7','#92400e'],['E','Formación','#ccfbf1','#115e59'],
        ['I','Ausencia','#fecaca','#991b1b'],['O','Otros','#ffedd5','#9a3412'],
        ['V?','Sin confirmar','#ecfdf5','#065f46'],['AZ','Festivo en cabecera','#1d4ed8','#ffffff'],
      ]
      const legendHtml=legendValues.map(([code,label,bg,fg])=>
        '<span class="legend-cell"><b style="background:'+bg+';color:'+fg+'">'+esc(code)+'</b>'+
        '<span>'+esc(label)+'</span></span>').join('')
      const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planificador mensual · A4 vertical</title><style>'+
        '@page{size:A4 portrait;margin:7mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
        'html,body{margin:0;padding:0;color:#1e293b;font-family:Arial,sans-serif}'+
        'h1{font-size:13pt;margin:0 0 1.5mm}p{font-size:7.5pt;margin:0 0 1mm}'+
        '.weeks{margin-top:3mm}.week{break-inside:avoid;page-break-inside:avoid;margin-bottom:'+gapMm+'mm}'+
        '.week h2{height:'+captionMm+'mm;line-height:'+captionMm+'mm;padding:0 2mm;margin:0;background:#e2e8f0;font-size:8pt}'+
        'table{width:100%;table-layout:fixed;border-collapse:collapse}'+
        'th,td{border:1px solid #cbd5e1;text-align:center;vertical-align:middle;padding:0;overflow:hidden;'+
        'line-height:1.05;font-size:'+fontPt+'pt;height:'+rowMm+'mm}'+
        'thead th{height:'+dayHeadMm+'mm;background:#f8fafc;font-size:8pt}'+
        'th.person{width:39mm;text-align:left;padding-left:1mm;background:#f8fafc;font-weight:700}'+
        '.legend{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1mm 1.4mm;margin-top:2mm}'+
        '.legend-cell{display:flex;align-items:center;gap:1mm;font-size:6.5pt;white-space:nowrap}'+
        '.legend-cell b{display:inline-flex;align-items:center;justify-content:center;min-width:7mm;height:4mm;border:1px solid #cbd5e1}'+
        '.foot{font-size:6.5pt;margin-top:2mm;color:#475569}'+
        '</style></head><body><h1>PLANIFICADOR HORARIO · DEPARTAMENTO DE MANTENIMIENTO</h1><p>'+
        heading+' · '+esc(stateLabel)+' · '+(snapshot.operatorId==='ALL'?'Todos los operarios':esc(displayedOperators[0]?.display_name??''))+
        '</p><div class="weeks">'+bodyHtml+'</div><div class="legend">'+legendHtml+'</div>'+
        '<p class="foot">9–13 / 15–19: turno partido de 8 horas. '+esc(summaryNote)+'</p>'+
        '<script>window.addEventListener("load",function(){window.focus();window.print();});<\/script></body></html>'
      page.document.open();page.document.write(html);page.document.close()
      return
    }
    const weeklyTables=weekGroups.map(({start,week})=>{
      const head='<th class="person"></th>'+week.map((day,i)=>'<th'+
        (holidaySet.has(day)?' style="background:#1d4ed8;color:white"':'')+'>'+
        esc(dateHeading(day,i))+'</th>').join('')
      const rows=displayedOperators.map(person=>{
        const cells=week.map(day=>{
          const inRange=dateSet.has(day)
          const entry=selectedEntry(person.id,day)
          const color=colorForEntry(entry)
          return '<td style="background:'+(inRange?color.bg:'#f8fafc')+';color:'+color.fg+';font-weight:700;text-align:center;white-space:pre-line">'+
            (inRange?esc(stateCode(entry)):'')+'</td>'
        }).join('')
        return '<tr><th class="person">'+esc(person.display_name)+'</th>'+cells+'</tr>'
      }).join('')
      return '<section class="week"><h2>'+esc(weekCaption(start))+'</h2><table><thead><tr>'+head+
        '</tr></thead><tbody>'+rows+'</tbody></table></section>'
    }).join('')
    const summary=totals.map(t=>'<span>'+esc(t.person.display_name)+': '+t.shifts+' turnos, '+t.vacations+' vac., '+t.medical+' bajas</span>').join(' · ')
    const legendHtml=statusLegend.map(([s,label])=>'<span style="display:inline-block;margin-right:10px"><b style="background:'+colorFor(s).bg+';color:'+colorFor(s).fg+';padding:1px 4px;border-radius:3px">'+(s==='SHIFT'?'9–13/15–19':s==='REST'?'D':s==='VACATION'?'V':s==='VACATION_PREVIOUS'?'A25':s==='MEDICAL_LEAVE'?'B':s==='PUBLIC_HOLIDAY'?'15/08':s==='COMP_REST'?'R':s==='PERMISSION'?'P':'R')+'</b> '+esc(label)+'</span>').join('')
    const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte horario</title><style>'+
      '@page{size:A4 landscape;margin:9mm}body{font-family:Arial,sans-serif;color:#1e293b;margin:0;font-size:9px}'+
      'h1{font-size:14px;margin:0 0 3px}p{margin:2px 0 7px}table{border-collapse:collapse;width:100%;table-layout:fixed}'+
      'thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #e2e8f0;padding:2px 3px;height:12px}'+
      'thead th{background:#fff;color:#334155;text-align:center}.person{width:90px;text-align:left}'+
      '.week{break-inside:avoid;page-break-inside:avoid;margin-bottom:5px}.week h2{font-size:9px;margin:3px 0 2px}'+
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      '.footer{margin-top:7px;font-size:8px;line-height:1.6}.notes{font-size:8px;color:#475569}'+
      '</style></head><body><h1>PLANIFICADOR HORARIO · DEPARTAMENTO DE MANTENIMIENTO</h1><p>'+heading+' · '+esc(stateLabel)+'</p>'+
      weeklyTables+
      '<div class="footer"><span style="display:inline-block;background:#1d4ed8;color:white;padding:1px 4px;margin-right:8px">Cabecera azul: festivo del calendario</span>'+legendHtml+'</div><p class="notes">'+esc(summary)+'</p><p class="notes">'+esc(summaryNote)+'</p>'+
      '<script>window.addEventListener("load",function(){window.focus();window.print();});<\/script></body></html>'
    page.document.open();page.document.write(html);page.document.close()
  }

  return <section className="space-y-2 sm:space-y-3">
    <div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-2"><FileText size={18}/><h2 className="text-sm font-bold sm:text-lg">Reporte de horarios</h2></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-[11px] font-semibold text-slate-600">Período
          <select className={input+' mt-1'} value={period} onChange={e=>setPeriod(e.target.value as PeriodType)}>
            {periodOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {period==='DAY'&&<label className="text-[11px] font-semibold text-slate-600">Fecha
          <input className={input+' mt-1'} type="date" value={day} onChange={e=>setDay(e.target.value)}/>
        </label>}
        {period==='MONTH'&&<label className="text-[11px] font-semibold text-slate-600">Mes
          <input className={input+' mt-1'} type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        </label>}
        {period==='YEAR'&&<label className="text-[11px] font-semibold text-slate-600">Año
          <input className={input+' mt-1'} type="number" min="2000" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/>
        </label>}
        {period==='DATES'&&<>
          <label className="text-[11px] font-semibold text-slate-600">Desde
            <input className={input+' mt-1'} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">Hasta
            <input className={input+' mt-1'} type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/>
          </label>
        </>}
        {period==='MONTHS'&&<>
          <label className="text-[11px] font-semibold text-slate-600">Mes inicial
            <input className={input+' mt-1'} type="month" value={startMonth} onChange={e=>setStartMonth(e.target.value)}/>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">Mes final
            <input className={input+' mt-1'} type="month" value={endMonth} onChange={e=>setEndMonth(e.target.value)}/>
          </label>
        </>}
        <label className="text-[11px] font-semibold text-slate-600">Operario
          <select className={input+' mt-1'} value={operatorId} onChange={e=>setOperatorId(e.target.value)}>
            <option value="ALL">Todos</option>
            {operators.map(o=><option key={o.id} value={o.id}>{o.display_name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Mostrar
          <select className={input+' mt-1'} value={status} onChange={e=>setStatus(e.target.value)}>
            {statusOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={loading} onClick={()=>void generate({...range,operatorId,status})}
          className="flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          <Search size={15}/>{loading?'Generando…':'Ver reporte'}
        </button>
        <button type="button" disabled={!snapshot||loading||!unchanged} onClick={printReport}
          className="flex min-h-9 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold disabled:opacity-40">
          <Printer size={15}/> Imprimir
        </button>
        <button type="button" disabled={!snapshot||loading||exporting||!unchanged} onClick={()=>void exportPdf()}
          className="flex min-h-9 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold disabled:opacity-40">
          <FileDown size={15}/>{exporting?'PDF…':'Descargar PDF'}
        </button>
      </div>
      {!unchanged&&snapshot&&<p className="mt-2 text-xs text-amber-700">Has cambiado los filtros. Pulsa «Ver reporte» para actualizarlos.</p>}
      {error&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    </div>

    {snapshot&&<div className="rounded-xl bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="text-sm font-bold">Vista previa · {periodLabel}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{stateLabel} · {displayedOperators.length} operario(s) · {dates.length} día(s)</p></div>
        <span className="text-[10px] text-slate-500">{period==='MONTH'?'A4 vertical · semanas · una sola página':'A4 horizontal · páginas automáticas'}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {totals.map(t=><div key={t.person.id} className="rounded-md bg-slate-50 p-2">
          <div className="truncate text-xs font-bold">{t.person.display_name}</div>
          <div className="mt-0.5 text-[10px] text-slate-600">{t.shifts} turnos · {t.vacations} vac. · {t.medical} bajas</div>
        </div>)}
      </div>
      <div className="mt-2 space-y-2">
        {previewWeeks.map(({start,week})=><section key={start} className="overflow-hidden rounded-lg border border-slate-200">
          <div className="bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{weekCaption(start)}</div>
          <table className="w-full table-fixed border-collapse text-[9px] sm:text-xs">
            <thead><tr className="bg-white text-slate-700">
              <th className="w-[68px] border border-slate-200 px-1 py-1 text-left sm:w-24"></th>
              {week.map((day,i)=><th key={day} className={'border border-slate-200 px-px py-1 text-center '+(holidaySet.has(day)?'bg-blue-700 text-white':'')}>{dateHeading(day,i)}</th>)}
            </tr></thead>
            <tbody>
              {displayedOperators.map(person=><tr key={person.id}>
                <th className="border border-slate-200 bg-slate-50 px-1 py-1 text-left text-[9px] font-semibold sm:text-xs">
                  {person.display_name}
                </th>
                {week.map(day=>{
                  const inRange=dateSet.has(day)
                  const entry=selectedEntry(person.id,day)
                  const color=colorForEntry(entry)
                  return <td key={day} className="overflow-hidden border border-white p-px text-center font-bold tracking-tighter"
                    style={{background:inRange?color.bg:'#f8fafc',color:color.fg}}>
                    <span className={'block '+(entry?.state==='SHIFT'&&isSplitShift(entry.start_time,entry.end_time)
                       ? 'whitespace-pre-line leading-[11px]' : 'truncate')}>{inRange?stateCode(entry):''}</span>
                  </td>
                })}
              </tr>)}
            </tbody>
          </table>
        </section>)}
      </div>
      {previewCapped&&<p className="mt-2 text-xs text-slate-500">Se muestran las primeras siete semanas. El PDF y la impresión incluyen todo el período seleccionado.</p>}
      {dates.length===0&&<p className="py-4 text-center text-xs text-slate-500">No hay días que cumplan el filtro.</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
        <span className="text-[9px] text-slate-600"><span className="mr-1 rounded bg-emerald-600 px-1 font-bold text-white">V</span>Disfrutadas</span>
        <span className="text-[9px] text-slate-600"><span className="mr-1 rounded bg-emerald-50 px-1 font-bold text-emerald-950 ring-1 ring-inset ring-amber-500">V?</span>Pasadas por confirmar</span>
        <span className="text-[9px] text-slate-600"><span className="mr-1 rounded bg-blue-700 px-1 text-white">15</span>Cabecera azul: festivo calendario</span>
        {statusLegend.map(([value,label])=><span key={value} className="text-[9px] text-slate-600">
          <span className="mr-1 rounded px-1 font-bold" style={{background:colorFor(value).bg,color:colorFor(value).fg}}>{value==='SHIFT'?'9–13/15–19':value==='REST'?'D':value==='VACATION'?'V':value==='VACATION_PREVIOUS'?'A25':value==='MEDICAL_LEAVE'?'B':value==='PUBLIC_HOLIDAY'?'15/08':value==='COMP_REST'?'R':value==='PERMISSION'?'P':'R'}</span>{label}
        </span>)}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">{summaryNote}</p>
    </div>}
  </section>
}
