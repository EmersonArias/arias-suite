import { useEffect, useMemo, useState } from 'react'
import { FileDown, FileText, Printer, Search } from 'lucide-react'
import { addDays, dateISO, fromISO, type StaffDay, type StaffOperator } from './staffModel'
import { loadAllStaffDays } from './staffData'

type PeriodType = 'DAY' | 'MONTH' | 'YEAR' | 'DATES' | 'MONTHS'
type ReportOptions = {
  start: string
  end: string
  operatorId: string
  status: string
}
type ReportSnapshot = ReportOptions & { days: StaffDay[] }

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
  SHIFT: {bg:'#D1FAE5', fg:'#065F46',pdfBg:[209,250,229],pdfFg:[6,95,70]},
  REST: {bg:'#FFE4E6',fg:'#9F1239',pdfBg:[255,228,230],pdfFg:[159,18,57]},
  VACATION: {bg:'#DBEAFE',fg:'#1E40AF',pdfBg:[219,234,254],pdfFg:[30,64,175]},
  VACATION_PREVIOUS: {bg:'#DBEAFE',fg:'#1E40AF',pdfBg:[219,234,254],pdfFg:[30,64,175]},
  MEDICAL_LEAVE: {bg:'#E2E8F0',fg:'#334155',pdfBg:[226,232,240],pdfFg:[51,65,85]},
  PUBLIC_HOLIDAY: {bg:'#EDE9FE',fg:'#5B21B6',pdfBg:[237,233,254],pdfFg:[91,33,182]},
  COMP_REST: {bg:'#FAE8FF',fg:'#86198F',pdfBg:[250,232,255],pdfFg:[134,25,143]},
  PERMISSION: {bg:'#FEF3C7',fg:'#92400E',pdfBg:[254,243,199],pdfFg:[146,64,14]},
  PERSONAL_DAY: {bg:'#FEF3C7',fg:'#92400E',pdfBg:[254,243,199],pdfFg:[146,64,14]},
  TRAINING: {bg:'#CCFBF1',fg:'#115E59',pdfBg:[204,251,241],pdfFg:[17,94,89]},
  UNJUSTIFIED_ABSENCE: {bg:'#FECACA',fg:'#991B1B',pdfBg:[254,202,202],pdfFg:[153,27,27]},
  OTHER: {bg:'#FFEDD5',fg:'#9A3412',pdfBg:[255,237,213],pdfFg:[154,52,18]},
  UNASSIGNED: {bg:'#F1F5F9',fg:'#64748B',pdfBg:[241,245,249],pdfFg:[100,116,139]},
}
const colorFor = (state: string) => palette[state] ?? palette.UNASSIGNED
const shortDate = (day: string) => fromISO(day).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
const hourOnly = (time?:string|null) => {
  if (!time) return '—'
  const [h,m] = time.slice(0,5).split(':')
  return String(Number(h)) + (m==='00'?'':':'+m)
}
const stateCode = (entry?:StaffDay) => {
  if(!entry) return '—'
  switch(entry.state){
    case 'SHIFT': return hourOnly(entry.start_time)+'–'+hourOnly(entry.end_time)
    case 'REST': return 'D'
    case 'VACATION': return 'V'
    case 'VACATION_PREVIOUS': return 'A'
    case 'MEDICAL_LEAVE': return 'B'
    case 'PUBLIC_HOLIDAY': return 'F'
    case 'COMP_REST': return 'C'
    case 'PERMISSION': return 'P'
    case 'PERSONAL_DAY': return 'L'
    case 'TRAINING': return 'E'
    case 'UNJUSTIFIED_ABSENCE': return 'I'
    case 'OTHER': return 'R'
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
    const result=await loadAllStaffDays({hotelId,startDate:next.start,endDate:next.end})
    if(result.error) setError(result.error.message)
    else setSnapshot({...next,days:result.data})
    setLoading(false)
  }
  // Show an immediately useful preview for the current month.
  useEffect(()=>{
    let alive=true
    const start=initialMonth+'-01'
    const end=monthEnd(initialMonth)
    void loadAllStaffDays({hotelId,startDate:start,endDate:end}).then(result=>{
      if(!alive)return
      if(result.error)setError(result.error.message)
      else setSnapshot({start,end,operatorId:'ALL',status:'ALL',days:result.data})
    })
    return ()=>{alive=false}
  },[hotelId,initialMonth])

  const displayedOperators=useMemo(()=>snapshot?.operatorId==='ALL'
    ? operators
    : operators.filter(o=>o.id===snapshot?.operatorId),[operators,snapshot?.operatorId])
  const entries=useMemo(()=>new Map((snapshot?.days??[]).map(d=>[d.operator_id+'|'+d.work_date,d])),[snapshot?.days])
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
  const totals=useMemo(()=>displayedOperators.map(o=>{
    const own=(snapshot?.days??[]).filter(d=>d.operator_id===o.id && (snapshot?.status==='ALL' || dates.includes(d.work_date)))
    return {
      person:o,
      shifts:own.filter(d=>d.state==='SHIFT').length,
      minutes:own.filter(d=>d.state==='SHIFT').reduce((n,d)=>n+(d.planned_minutes??0),0),
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
    ['SHIFT','Horario'],['REST','D Descanso'],['VACATION','V Vacaciones'],['MEDICAL_LEAVE','B Baja'],
    ['PUBLIC_HOLIDAY','F Festivo'],['COMP_REST','C Recuperación'], 
  ]
  const summaryNote='Horario planificado. No acredita por sí solo la presencia real ni el disfrute efectivo de vacaciones.'
  const previewRows=dates.slice(0,50)
  const previewCapped=dates.length>previewRows.length

  async function exportPdf(){
    if(!snapshot||loading||exporting||!unchanged)return
    setExporting(true);setError('')
    try {
      const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')])
      const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true})
      doc.setProperties({title:'Planificador horario · '+periodLabel,subject:'Reporte de turnos'})
      const pageWidth=297
      doc.setFont('helvetica','bold');doc.setFontSize(12)
      doc.text('PLANIFICADOR HORARIO',9,11)
      doc.setFont('helvetica','normal');doc.setFontSize(8)
      doc.text(hotelName.slice(0,64)+'  ·  '+periodLabel,9,17)
      doc.text('Filtro: '+stateLabel+'  ·  '+(snapshot.operatorId==='ALL'?'Todos los operarios':displayedOperators[0]?.display_name??''),9,22)
      const head=['Fecha',...displayedOperators.map(o=>o.display_name)]
      const body=dates.map(d=>[
        shortDate(d).slice(0,5)+' '+fromISO(d).toLocaleDateString('es-ES',{weekday:'short'}),
        ...displayedOperators.map(o=>{
          const e=entries.get(o.id+'|'+d)
          const color=colorFor(e?.state??'UNASSIGNED')
          return {content:stateCode(e),styles:{fillColor:color.pdfBg,textColor:color.pdfFg,fontStyle:'bold' as const,halign:'center' as const}}
        }),
      ])
      const compactSummary=totals.map(t=>t.person.display_name+': '+t.shifts+'T '+t.vacations+'V '+t.medical+'B').join('   |   ')
      doc.setFont('helvetica','normal');doc.setFontSize(7)
      doc.text(compactSummary.slice(0,185),9,26)
      autoTable(doc,{
        head:[head],body,
        startY:30,margin:{left:9,right:9,top:9,bottom:15},
        theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:1.1,overflow:'ellipsize',minCellHeight:4.4},
        headStyles:{fillColor:[30,41,59],textColor:[255,255,255],fontStyle:'bold',fontSize:8},
        columnStyles:{0:{cellWidth:27,fontStyle:'bold',textColor:[30,41,59]}},
        showHead:'everyPage',
        didDrawPage:({pageNumber})=>{
          doc.setFont('helvetica','normal');doc.setFontSize(6.2)
          doc.setTextColor(75,85,99)
          doc.text('9-19 Horario  |  D Descanso  |  V Vacaciones  |  B Baja  |  F Festivo  |  C Recuperacion',9,199)
          doc.text(summaryNote,9,203.5)
          doc.text('Pag. '+pageNumber,pageWidth-18,203.5)
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
    const th=displayedOperators.map(o=>'<th>'+esc(o.display_name)+'</th>').join('')
    const trs=dates.map(d=>{
      const cells=displayedOperators.map(o=>{
        const e=entries.get(o.id+'|'+d)
        const color=colorFor(e?.state??'UNASSIGNED')
        return '<td style="background:'+color.bg+';color:'+color.fg+';font-weight:700;text-align:center">'+esc(stateCode(e))+'</td>'
      }).join('')
      return '<tr><th>'+esc(shortDate(d))+'</th>'+cells+'</tr>'
    }).join('')
    const summary=totals.map(t=>'<span>'+esc(t.person.display_name)+': '+t.shifts+' turnos, '+t.vacations+' vac., '+t.medical+' bajas</span>').join(' · ')
    const legendHtml=statusLegend.map(([s,label])=>'<span style="display:inline-block;margin-right:10px"><b style="background:'+colorFor(s).bg+';color:'+colorFor(s).fg+';padding:1px 4px;border-radius:3px">'+(s==='SHIFT'?'9–19':s==='REST'?'D':s==='VACATION'?'V':s==='MEDICAL_LEAVE'?'B':s==='PUBLIC_HOLIDAY'?'F':s==='COMP_REST'?'C':s==='PERMISSION'?'P':'R')+'</b> '+esc(label)+'</span>').join('')
    const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte horario</title><style>'+
      '@page{size:A4 landscape;margin:9mm}body{font-family:Arial,sans-serif;color:#1e293b;margin:0;font-size:9px}'+
      'h1{font-size:14px;margin:0 0 3px}p{margin:2px 0 7px}table{border-collapse:collapse;width:100%;table-layout:fixed}'+
      'thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #e2e8f0;padding:2px 3px;height:13px}'+
      'thead th{background:#1e293b;color:white;text-align:center}tbody th{width:78px;text-align:left}'+
      '.footer{margin-top:7px;font-size:8px;line-height:1.6}.notes{font-size:8px;color:#475569}'+
      '</style></head><body><h1>PLANIFICADOR HORARIO</h1><p>'+heading+' · '+esc(stateLabel)+'</p>'+
      '<table><thead><tr><th>Fecha</th>'+th+'</tr></thead><tbody>'+trs+'</tbody></table>'+
      '<div class="footer">'+legendHtml+'</div><p class="notes">'+esc(summary)+'</p><p class="notes">'+esc(summaryNote)+'</p>'+
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
        <span className="text-[10px] text-slate-500">A4 horizontal · páginas automáticas</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {totals.map(t=><div key={t.person.id} className="rounded-md bg-slate-50 p-2">
          <div className="truncate text-xs font-bold">{t.person.display_name}</div>
          <div className="mt-0.5 text-[10px] text-slate-600">{t.shifts} turnos · {t.vacations} vac. · {t.medical} bajas</div>
        </div>)}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[10px] sm:text-xs">
          <thead><tr className="bg-slate-800 text-white">
            <th className="w-[70px] border border-slate-200 p-1 text-left">Fecha</th>
            {displayedOperators.map(o=><th key={o.id} className="border border-slate-200 p-1">{o.display_name}</th>)}
          </tr></thead>
          <tbody>
            {previewRows.map(d=><tr key={d}>
              <th className="border border-slate-200 p-1 text-left font-medium">{shortDate(d).slice(0,5)} <span className="text-[9px] text-slate-400">{fromISO(d).toLocaleDateString('es-ES',{weekday:'short'})}</span></th>
              {displayedOperators.map(o=>{
                const entry=entries.get(o.id+'|'+d)
                const color=colorFor(entry?.state??'UNASSIGNED')
                return <td key={o.id} className="border border-white px-0.5 py-1 text-center font-bold"
                  style={{background:color.bg,color:color.fg}}>{stateCode(entry)}</td>
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      {previewCapped&&<p className="mt-2 text-xs text-slate-500">Vista previa de los primeros 50 días. El PDF y la impresión incluyen los {dates.length} días del reporte.</p>}
      {dates.length===0&&<p className="py-4 text-center text-xs text-slate-500">No hay días que cumplan el filtro.</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
        {statusLegend.map(([value,label])=><span key={value} className="text-[9px] text-slate-600">
          <span className="mr-1 rounded px-1 font-bold" style={{background:colorFor(value).bg,color:colorFor(value).fg}}>{value==='SHIFT'?'9–19':value==='REST'?'D':value==='VACATION'?'V':value==='MEDICAL_LEAVE'?'B':value==='PUBLIC_HOLIDAY'?'F':value==='COMP_REST'?'C':value==='PERMISSION'?'P':'R'}</span>{label}
        </span>)}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">{summaryNote}</p>
    </div>}
  </section>
}
