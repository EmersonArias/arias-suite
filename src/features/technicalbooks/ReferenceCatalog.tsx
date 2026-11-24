import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { sourceCatalog } from './bookDefinitions'
import { loadBookCatalog, loadPamCatalog, locationPath } from './bookCatalog'
import type { CatalogAsset, CatalogLocation, PamCatalogGroup, PamCatalogMark } from './bookCatalog'

const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export default function ReferenceCatalog({ mode }: { mode: string }) {
  const { hotel } = useHotelScope()
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [assets, setAssets] = useState<CatalogAsset[]>([]), [locations, setLocations] = useState<CatalogLocation[]>([])
  const [groups, setGroups] = useState<PamCatalogGroup[]>([]), [marks, setMarks] = useState<PamCatalogMark[]>([])
  const [year, setYear] = useState(0), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!hotel) return
    let active = true
    setLoading(true)
    Promise.all([loadBookCatalog(hotel.id), loadPamCatalog(hotel.id)]).then(([catalog, pam]) => {
      if (!active) return
      setAssets(catalog.assets); setLocations(catalog.locations); setGroups(pam.groups); setMarks(pam.marks)
      setYear(Math.max(0, ...pam.groups.map(row => row.plan_year))); setError('')
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [hotel?.id, attempt])
  const q = query.trim().toLocaleLowerCase('es')
  const visibleAssets = assets.filter(row => row.active && [row.source_id, row.code, row.name, row.plant, row.location, row.maintenance].join(' ').toLocaleLowerCase('es').includes(q))
    .sort((a, b) => (a.source_id ?? Number.MAX_SAFE_INTEGER) - (b.source_id ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code))
  const visiblePlans = groups.filter(row => row.plan_year === year && (row.maintenance_name + ' ' + row.source_apparatus_expression).toLocaleLowerCase('es').includes(q)).sort((a, b) => a.source_row - b.source_row)
  const years = [...new Set(groups.map(row => row.plan_year))].sort((a, b) => b - a)
  return <section className="rounded-xl border bg-white p-3">
    <div className="mb-3 flex flex-wrap gap-3"><label className="flex-1 text-sm font-semibold">Buscar trabajo o equipo<input value={query} onChange={e => setQuery(e.target.value)} className="mt-1 block w-full rounded-lg border p-2 text-sm" /></label>
      {mode === 'plan-anual' && <label className="text-sm">Año<select value={year} onChange={e => setYear(Number(e.target.value))} className="mt-1 block rounded-lg border p-2">{years.map(value => <option key={value}>{value}</option>)}</select></label>}
    </div>
    {loading && <p role="status">Cargando el catálogo del hotel…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></p>}
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-sky-800"><Link to="/maintenance/pam">Abrir PAM</Link><Link to="/apparatusregistry">Gestionar activos</Link><Link to="/maintenance/structure">Gestionar ubicaciones</Link></div>
    <div className="overflow-x-auto">{mode === 'plan-anual' ? <>
      <table className="w-full min-w-[1100px] text-left text-xs"><caption className="mb-2 text-left font-semibold">Plan anual {year || '—'} · Las posiciones indican las divisiones de cada mes.</caption>
        <thead><tr><th className="p-2">Trabajo / equipos</th>{months.map(month => <th key={month} className="p-2">{month}</th>)}</tr></thead>
        <tbody>{visiblePlans.map(row => <tr key={row.id} className="border-t"><th className="max-w-72 p-2 font-medium">{row.maintenance_name}<span className="mt-1 block text-slate-500">Equipos {row.source_apparatus_expression}</span></th>
          {months.map((month, index) => <td key={month} className="p-2 align-top">{[...new Set(marks.filter(mark => mark.plan_year === year && mark.source_row === row.source_row && mark.month_number === index + 1).map(mark => mark.week_slot + ' · ' + mark.mark_code))].sort().join(' / ') || '—'}</td>)}
        </tr>)}</tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">{sourceCatalog.plan.legend.map(row => <span key={row.code}><strong>{row.code}</strong> · {row.label}</span>)}</div>
    </> : <table className="w-full min-w-[700px] text-left text-xs"><thead><tr>{['ID', 'Código', 'Denominación', 'Planta', 'Ubicación', 'Mantenimiento'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{visibleAssets.map(row => <tr key={row.id} className="border-t">{[row.source_id, row.code, row.name, row.plant, row.location_id ? locationPath(locations, row.location_id) : row.location, row.maintenance].map((value, index) => <td key={index} className="p-2">{value || '—'}</td>)}</tr>)}</tbody></table>}</div>
  </section>
}
