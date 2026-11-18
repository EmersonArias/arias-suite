import DemoActivityPanel from './DemoActivityPanel'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { accessDate, accessDevice, madridDay, madridMidnight, type AccessLogEntry } from './accessLogModel'

const control = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800'
const kinds = { LOGIN: 'Inicio de sesión', SESSION: 'Sesión conservada', LAST_SIGN_IN: 'Último inicio registrado' }
export default function AccessLogPage() {
  const { isPlatformAdmin, loading } = useHotelScope()
  const [rows, setRows] = useState<AccessLogEntry[]>([])
  const [users, setUsers] = useState<Array<{ id: string; login_identifier: string; full_name: string | null }>>([])
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState(() => madridDay(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(() => madridDay())
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)

  useEffect(() => {
    if (loading || !isPlatformAdmin) return
    let current = true
    void supabase.from('profiles').select('id, login_identifier, full_name').order('login_identifier').then(({ data }) => { if (current) setUsers(data ?? []) })
    return () => { current = false }
  }, [loading, isPlatformAdmin])
  useEffect(() => {
    if (loading || !isPlatformAdmin) return
    let current = true
    async function load() {
      setBusy(true); setError(''); setRows([])
      try {
        const start = madridMidnight(from), end = madridMidnight(to, true)
        if (start >= end) throw new Error('La fecha de inicio debe ser anterior o igual a la fecha final.')
        const { data, error: requestError } = await supabase.rpc('list_user_access_log', { p_from: start, p_to: end, p_user_id: userId || null, p_limit: 51, p_offset: page * 50 })
        if (requestError) throw new Error('No se ha podido cargar el registro de accesos. ' + requestError.message)
        if (current) { setRows((data ?? []).slice(0,50)); setMore((data ?? []).length > 50) }
      } catch (e) { if (current) { setError(e instanceof Error ? e.message : 'No se pudo consultar el registro.'); setMore(false) } }
      finally { if (current) setBusy(false) }
    }
    void load()
    return () => { current = false }
  }, [loading, isPlatformAdmin, from, to, userId, page, refresh])

  if (loading) return <p className="p-6">Comprobando acceso…</p>
  if (!isPlatformAdmin) return <main className="mx-auto max-w-xl p-6"><h1 className="text-xl font-bold">Registro de accesos</h1><p className="mt-3">Esta sección está reservada al administrador de la plataforma.</p><Link to="/" className={control + ' mt-4 inline-block'}>Volver al inicio</Link></main>
  return <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:p-6"><div className="mx-auto max-w-7xl">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5"><div><p className="text-xs font-semibold text-sky-700">Administración</p><h1 className="text-2xl font-bold">Registro de accesos</h1><p className="mt-1 text-sm text-slate-500">Todos los usuarios · Horario de Barcelona</p></div><Link className={control} to="/profile">Volver a mi cuenta</Link></header>
    <section className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">Los accesos nuevos se conservan desde la activación de este registro. Los anteriores muestran solo la información disponible. Una renovación automática no demuestra que alguien esté usando la aplicación. La IP puede corresponder a un proxy o VPN; el dispositivo es el comunicado por el navegador. La ubicación física no está confirmada y no se solicita GPS.</section>
    <section aria-label="Filtrar accesos" className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4">
      <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs font-semibold">Usuario<select className={control} value={userId} onChange={e => { setPage(0); setUserId(e.target.value) }}><option value="">Todos los usuarios</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name ? u.full_name + ' · ' : ''}{u.login_identifier}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs font-semibold">Desde<input type="date" className={control} value={from} onChange={e => { setPage(0); setFrom(e.target.value) }} /></label>
      <label className="flex flex-col gap-1 text-xs font-semibold">Hasta<input type="date" className={control} value={to} onChange={e => { setPage(0); setTo(e.target.value) }} /></label>
      <button type="button" disabled={busy} className={control} onClick={() => setRefresh(n => n + 1)}>Actualizar</button>
    </section>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <section aria-label="Historial de accesos" aria-busy={busy} className="overflow-x-auto rounded-2xl border bg-white">
      {busy ? <p role="status" className="p-6 text-slate-500">Cargando accesos…</p> : !rows.length ? <p className="p-6 text-slate-500">{error ? 'No se han podido mostrar los accesos.' : 'No hay accesos disponibles para estos filtros.'}</p> : <table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-100 text-xs text-slate-600"><tr>{['Usuario', 'Fecha de acceso', 'Registro', 'Dispositivo', 'IP / origen', 'Ubicación', 'Última renovación'].map(h => <th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.event_id} className="border-t align-top"><td className="p-3"><strong>{row.full_name || row.login_identifier}</strong>{row.full_name && <p className="text-xs text-slate-500">{row.login_identifier}</p>}</td><td className="p-3 whitespace-nowrap">{accessDate(row.occurred_at)}</td><td className="p-3">{kinds[row.event_kind]}</td><td className="p-3">{accessDevice(row.user_agent)}</td><td className="p-3"><span className="font-mono text-xs">{row.ip_address || 'No disponible'}</span><p className="mt-1 text-xs text-slate-500">{row.ip_source === 'auth_server' ? 'IP del servidor, no del dispositivo' : row.ip_source === 'forwarded_header' ? 'Origen comunicado por la pasarela' : row.ip_source === 'auth_session' ? 'Registrada con la sesión' : 'Sin origen conservado'}</p></td><td className="p-3 text-slate-500">No disponible</td><td className="p-3 whitespace-nowrap">{accessDate(row.renewed_at)}</td></tr>)}</tbody></table>}
    </section>
    <nav aria-label="Páginas del registro" className="mt-4 flex items-center justify-between gap-3"><button type="button" className={control} disabled={page === 0 || busy} onClick={() => setPage(n => n - 1)}>Anterior</button><span className="text-sm text-slate-500">Página {page + 1}</span><button type="button" className={control} disabled={!more || busy || page >= 200} onClick={() => setPage(n => n + 1)}>Siguiente</button></nav>
    {(!userId || isDemoUser(userId)) && <DemoActivityPanel key={from + to} from={from} to={to} refreshKey={refresh} />}
  </div></main>
}
