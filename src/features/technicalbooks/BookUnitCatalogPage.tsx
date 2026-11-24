import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { useAuth } from '../auth/context/AuthProvider'
import { useSystemDialog } from '../../shared/components/dialogs/SystemDialogProvider'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { supabase } from '../../lib/supabase'
import { loadBookCatalog, locationPath } from './bookCatalog'
import type { BookCatalog, CatalogUnit } from './bookCatalog'

const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40'
export default function BookUnitCatalogPage() {
  const { bookId } = useParams(), { hotel } = useHotelScope(), { session } = useAuth()
  const { confirm } = useSystemDialog()
  const readOnly = isDemoUser(session?.user.id || '')
  const [catalog, setCatalog] = useState<BookCatalog>({ locations: [], assets: [], units: [] })
  const [draft, setDraft] = useState<Partial<CatalogUnit> | null>(null)
  const [query, setQuery] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true), [loadedHotel, setLoadedHotel] = useState('')
  const request = useRef(0)
  async function reload() {
    if (!hotel) return
    const current = ++request.current
    setLoading(true)
    try {
      const next = await loadBookCatalog(hotel.id)
      if (current !== request.current) return
      setCatalog(next); setLoadedHotel(hotel.id); setMessage('')
    } catch (e) { if (current === request.current) setMessage((e as Error).message) }
    finally { if (current === request.current) setLoading(false) }
  }
  useEffect(() => { setDraft(null); setQuery(''); void reload(); return () => { request.current++ } }, [hotel?.id, bookId])
  if (!hotel || !['extintores', 'bie'].includes(bookId || '')) return <p className="p-4">Selecciona el hotel y un listado de extintores o BIE.</p>
  if (loading || loadedHotel !== hotel.id) return <p className="p-4" role="status">{message || 'Cargando listado…'}</p>
  const rows = catalog.units.filter(row => row.book_id === bookId &&
    (row.code + ' ' + row.name + ' ' + JSON.stringify(row.metadata)).toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))
    .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es'))
  async function save() {
    if (!draft || !hotel || readOnly || busy) return
    if (!await confirm({ title: 'Guardar unidad', message: '¿Confirmas los datos de esta unidad?', confirmLabel: 'Guardar' })) return
    setBusy(true)
    const asset = catalog.assets.find(row => row.source_id === 272)
    const data = { hotel_id: hotel.id, book_id: bookId, code: draft.code?.trim() || '', name: draft.name?.trim() || '',
      equipment_id: asset?.id, location_id: draft.location_id || null, metadata: draft.metadata || {},
      active: draft.active ?? true, verified: draft.verified ?? false }
    const result = draft.id
      ? await supabase.from('technical_book_units').update(data).eq('id', draft.id).eq('hotel_id', hotel.id).select('id').single()
      : await supabase.from('technical_book_units').insert(data).select('id').single()
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    setDraft(null); await reload(); setMessage('Unidad guardada.')
  }
  async function verifyList() {
    if (!hotel || readOnly || busy) return
    if (!await confirm({ title: 'Confirmar listado vigente', message: '¿Has comprobado todas las unidades activas, sus placas y sus ubicaciones? El listado se utilizará para completar la revisión trimestral.', confirmLabel: 'Confirmar listado' })) return
    setBusy(true)
    const result = await supabase.from('technical_book_units').update({ verified: true }).eq('hotel_id', hotel.id).eq('book_id', bookId).eq('active', true).select('id')
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    if (!result.data.length) { setMessage('No se pudo confirmar ninguna unidad. Comprueba tus permisos.'); return }
    await reload(); setMessage('Listado confirmado. Actualiza el alcance si ya hay una campaña abierta.')
  }
  return <main className="mx-auto max-w-5xl space-y-3 p-3 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold">Listado de {bookId === 'bie' ? 'BIE' : 'extintores'}</h1><Link className={button} to={'/registros-tecnicos/libros/' + bookId}>Volver al libro</Link></div>
    <p className="text-sm">{hotel.name} · El inventario inicial procede del Excel aportado. Revisa las unidades para confirmar el listado vigente.</p>
    <div className="flex flex-wrap gap-2"><input aria-label="Buscar unidad" className={input + ' max-w-sm'} value={query} onChange={e => setQuery(e.target.value)} placeholder="Número, placa o ubicación" /><button className={button} disabled={readOnly || busy} onClick={() => setDraft({ code: '', name: '', metadata: {}, active: true, verified: false })}>Añadir unidad</button><button className={button} disabled={readOnly || busy || !rows.length} onClick={() => void verifyList()}>Confirmar listado vigente</button><Link className={button} to="/maintenance/structure">Gestionar ubicaciones</Link></div>
    {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    {draft && <section className="rounded-xl border bg-white p-3"><h2 className="font-bold">{draft.id ? 'Actualizar unidad' : 'Nueva unidad'}</h2><div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Número<input className={input} value={draft.code || ''} onChange={e => setDraft({ ...draft, code: e.target.value })} /></label>
      <label className="text-xs">Descripción<input className={input} value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="text-xs">Tipo<input className={input} value={draft.metadata?.type || ''} onChange={e => setDraft({ ...draft, metadata: { ...draft.metadata, type: e.target.value } })} /></label>
      <label className="text-xs">{bookId === 'bie' ? 'Señalización' : 'Número de placa'}<input className={input} value={draft.metadata?.[bookId === 'bie' ? 'sign' : 'plate'] || ''} onChange={e => setDraft({ ...draft, metadata: { ...draft.metadata, [bookId === 'bie' ? 'sign' : 'plate']: e.target.value } })} /></label>
      <label className="text-xs sm:col-span-2">Ubicación<select className={input} value={draft.location_id || ''} onChange={e => setDraft({ ...draft, location_id: e.target.value })}><option value="">Seleccionar ubicación…</option>{catalog.locations.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{locationPath(catalog.locations, row.id)}</option>)}</select></label>
      <label className="text-sm"><input type="checkbox" checked={draft.active ?? true} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Unidad activa</label>
      <label className="text-sm"><input type="checkbox" checked={draft.verified ?? false} onChange={e => setDraft({ ...draft, verified: e.target.checked })} /> Datos comprobados</label>
    </div><div className="mt-3 flex gap-2"><button className={button} disabled={busy || readOnly} onClick={() => void save()}>Guardar</button><button className={button} onClick={() => setDraft(null)}>Cancelar</button></div></section>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Número</th><th className="p-2">Unidad / ubicación</th><th className="p-2">{bookId === 'bie' ? 'Señalización' : 'Placa'}</th><th className="p-2">Estado</th><th /></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.code}{row.metadata.previous_code && <small className="block text-slate-500">Antes {row.metadata.previous_code}</small>}</td><td className="p-2">{row.name}<small className="block">{locationPath(catalog.locations, row.location_id || '')}</small></td><td className="p-2">{row.metadata[bookId === 'bie' ? 'sign' : 'plate']}</td><td className="p-2">{!row.active ? 'Inactiva' : row.verified ? 'Comprobada' : 'Por comprobar'}</td><td className="p-2"><button className={button} disabled={readOnly} onClick={() => setDraft(structuredClone(row))}>Actualizar</button></td></tr>)}</tbody></table></div>
  </main>
}
