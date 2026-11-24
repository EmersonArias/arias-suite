import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { DEMO_USER_ID } from '../../core/access/demoReadOnly'
import { demoActivityLabels, type DemoActivityKind } from '../../core/access/demoActivityModel'
import { accessDate, accessDevice, madridMidnight } from './accessLogModel'
type Row = { id: string; occurred_at: string; event_type: DemoActivityKind; route: string; ip_address: string | null; user_agent: string | null }
const button = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40'
export default function DemoActivityPanel({ from, to, refreshKey }: { from: string; to: string; refreshKey: number }) {
  const { isPlatformAdmin, loading } = useHotelScope()
  const [rows,setRows] = useState<Row[]>([])
  const [page,setPage] = useState(0)
  const [busy,setBusy] = useState(false)
  const [more,setMore] = useState(false)
  const [error,setError] = useState('')
  useEffect(() => {
    if (loading || !isPlatformAdmin) return
    let current = true
    async function load() {
      setBusy(true);setError('');setRows([])
      try {
        const start=madridMidnight(from),end=madridMidnight(to,true)
        if(start>=end)throw new Error('Revisa las fechas del filtro.')
        const result=await supabase.from('demo_activity_events').select('id, occurred_at, event_type, route, ip_address, user_agent').eq('user_id',DEMO_USER_ID).gte('occurred_at',start).lt('occurred_at',end).order('occurred_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+50)
        if(result.error)throw new Error('No se pudo consultar la actividad de PRUEBA.')
        if(current){setRows((result.data??[]).slice(0,50));setMore((result.data??[]).length>50)}
      }catch(e){if(current){setError(e instanceof Error?e.message:'No se pudo consultar la actividad.');setMore(false)}}
      finally{if(current)setBusy(false)}
    }
    void load()
    return()=>{current=false}
  },[from,to,page,refreshKey,isPlatformAdmin,loading])
  if(loading||!isPlatformAdmin)return null
  return <section className="mt-6 rounded-2xl border bg-white p-4" aria-label="Actividad de PRUEBA" aria-busy={busy}>
    <h2 className="text-lg font-bold">Actividad de PRUEBA</h2>
    <p className="mb-4 mt-2 text-sm leading-6 text-slate-600">Recargas, apertura de módulos, vuelta al primer plano, solicitudes de PDF e intentos bloqueados. No se registran formularios ni renovaciones automáticas. Son señales comunicadas por el navegador y no identifican a la persona. Las sesiones con una versión antigua necesitan recargar para empezar a registrarlas.</p>
    {error&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {busy?<p role="status" className="p-4 text-sm text-slate-500">Cargando actividad…</p>:!rows.length?<p className="p-4 text-sm text-slate-500">{error?'No se ha podido mostrar la actividad.':'Sin actividad registrada en este intervalo.'}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-100 text-xs text-slate-600"><tr>{['Fecha y hora','Acción','Pantalla','Dispositivo','IP comunicada'].map(h=><th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t align-top"><td className="whitespace-nowrap p-3">{accessDate(row.occurred_at)}</td><td className="p-3">{demoActivityLabels[row.event_type]}</td><td className="p-3 font-mono text-xs">{row.route}</td><td className="p-3">{accessDevice(row.user_agent)}</td><td className="p-3 font-mono text-xs">{row.ip_address||'No disponible'}</td></tr>)}</tbody></table></div>}
    <nav className="mt-3 flex items-center justify-between gap-3" aria-label="Páginas de actividad"><button type="button" className={button} disabled={page===0||busy} onClick={()=>setPage(n=>n-1)}>Anterior</button><span className="text-sm text-slate-500">Página {page+1}</span><button type="button" className={button} disabled={!more||busy||page>=200} onClick={()=>setPage(n=>n+1)}>Siguiente</button></nav>
  </section>
}
