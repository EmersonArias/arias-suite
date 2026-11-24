import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BookDefinition, BookEntry } from './types'
import { catalogTargets, loadBookCatalog, isRoomBook } from './bookCatalog'
import type { BookCatalog, CatalogTarget } from './bookCatalog'

const input = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100'
type Props = { book: BookDefinition; entry: BookEntry; disabled: boolean; onSelect: (target: CatalogTarget) => void }
export default function BookTargetPicker({ book, entry, disabled, onSelect }: Props) {
  const [catalog, setCatalog] = useState<BookCatalog>({ locations: [], assets: [], units: [] })
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [floor, setFloor] = useState(''), [zone, setZone] = useState(''), [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    loadBookCatalog(entry.hotelId).then(data => { if (active) { setCatalog(data); setError('') } })
      .catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [entry.hotelId, attempt])
  const targets = useMemo(() => catalogTargets(catalog, book.id), [catalog, book.id])
  useEffect(() => {
    const room = new URLSearchParams(globalThis.location?.search || '').get('room')
    if (!room || entry.targetKey || disabled) return
    const target = targets.find(row => row.label === room)
    if (target) onSelect(target)
  }, [targets, entry.targetKey, disabled, onSelect])
  const floors = [...new Set(targets.map(row => row.floor))]
  const zones = [...new Set(targets.filter(row => !floor || row.floor === floor).map(row => row.path))]
  const visible = targets.filter(row => (!floor || row.floor === floor) && (!zone || row.path === zone) &&
    (row.label + ' ' + row.path).toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))
  if (disabled) return <><p className="text-sm"><strong>{book.assetLabel}</strong><br />{entry.asset}</p><p className="text-sm"><strong>Ubicación</strong><br />{entry.location || '—'}</p></>
  return <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-3">
    {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></p>}
    <label className="text-xs font-semibold text-slate-600">Planta<select className={input} value={floor} onChange={e => { setFloor(e.target.value); setZone('') }}><option value="">Todas las plantas</option>{floors.map(name => <option key={name} value={name}>{name || 'Ámbito del hotel'}</option>)}</select></label>
    {!isRoomBook(book.id) && <label className="text-xs font-semibold text-slate-600">Zona / ubicación<select className={input} value={zone} onChange={e => setZone(e.target.value)}><option value="">Todas las ubicaciones</option>{zones.map(path => <option key={path} value={path}>{path}</option>)}</select></label>}
    {!isRoomBook(book.id) && <label className="text-xs font-semibold text-slate-600">Buscar en el catálogo<input className={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Número, equipo o ubicación" /></label>}
    <label className="text-xs font-semibold text-slate-600">{book.assetLabel} *<select className={input} value={entry.targetKey || ''} disabled={loading || !!error} onChange={e => { const target = targets.find(row => row.key === e.target.value); if (target) onSelect(target) }}>
      <option value="">{loading ? 'Cargando catálogo…' : 'Seleccionar…'}</option>
      {entry.targetKey && !visible.some(row => row.key === entry.targetKey) && <option value={entry.targetKey}>{entry.asset} · selección actual</option>}
      {visible.map(row => <option key={row.key} value={row.key}>{row.label} · {row.path}</option>)}
    </select></label>
    {!loading && !error && !targets.length && <p className="text-sm sm:col-span-2">Completa el catálogo para registrar esta revisión.</p>}
    <div className="flex flex-wrap gap-4 text-xs text-sky-800 sm:col-span-2"><Link to="/maintenance/structure">Gestionar ubicaciones</Link><Link to="/apparatusregistry">Gestionar activos</Link>{['extintores', 'bie'].includes(book.id) && <Link to={'/registros-tecnicos/catalogo/' + book.id}>Actualizar listado de unidades</Link>}</div>
  </div>
}
