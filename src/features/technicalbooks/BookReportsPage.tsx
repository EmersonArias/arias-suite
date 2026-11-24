import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Download, Printer } from 'lucide-react'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { useAuth } from '../auth/context/AuthProvider'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { waterBook } from '../waterquality/waterBooks'
import { bookDefinitions } from './bookDefinitions'
import { answerText, entryFields, filterEntries, fieldLabel } from './bookModel'
import { loadBookRecords } from './bookRepository'
import type { BookDefinition, BookEntry } from './types'

const books = [waterBook('pool'), waterBook('spa'), ...bookDefinitions]
const reportPath = '/maintenance/record'
const button = 'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-45'
const input = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm'
const statusText = (entry: BookEntry) => entry.status === 'FINAL' ? 'Finalizado' : 'Borrador'

function Revision({ entry }: { entry: BookEntry }) {
  const [open, setOpen] = useState(false)
  return <article className="border-b border-slate-200 px-3 py-2 print:px-0">
    <button aria-expanded={open} type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
      <span><strong className="text-sm">{entry.date} · {entry.time} · {entry.asset}</strong>
        <span className="block text-xs text-slate-600">{[entry.location, entry.technician, statusText(entry), 'Rev. ' + entry.revision].filter(Boolean).join(' · ')}</span>
      </span><ChevronRight aria-hidden="true" size={16} className={'shrink-0 print:hidden ' + (open ? 'rotate-90' : '')} />
    </button>
    <div className={(open ? 'block' : 'hidden') + ' mt-2 text-sm print:block'}>
      <dl className="divide-y divide-slate-100">{entryFields(entry.template, entry).map(field =>
        <div className="grid grid-cols-2 gap-2 py-1 break-inside-avoid" key={field.id}>
          <dt>{fieldLabel(entry.bookId, field)}</dt><dd className="whitespace-pre-wrap break-words">{answerText(field, entry)}</dd>
        </div>)}</dl>
      {entry.pamTicketNumber && <p>Ticket PAM · {entry.pamTicketNumber}</p>}
      {entry.campaign && <p>Campaña · {entry.campaign}</p>}
      {entry.observations && <p className="whitespace-pre-wrap">Observaciones · {entry.observations}</p>}
      {entry.supersedes && <p>Rectificación · {entry.correctionReason} · Original {entry.supersedes}</p>}
      <p className="text-xs text-slate-500">Registro {entry.id}</p>
      {entry.evidence.map((photo, index) => <figure key={index} className="my-2 break-inside-avoid"><img src={photo.dataUrl} alt={photo.name} className="max-h-48 max-w-full object-contain" /><figcaption>{photo.name}</figcaption></figure>)}
    </div>
  </article>
}

function BookHistory({ book, hotelId, hotelName, demo }: { book: BookDefinition; hotelId: string; hotelName: string; demo: boolean }) {
  const [params, setParams] = useSearchParams()
  const [records, setRecords] = useState<BookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const from = params.get('desde') || '', to = params.get('hasta') || '', query = params.get('buscar') || ''
  const status = params.get('estado') || 'ALL'
  const invalidRange = Boolean(from && to && from > to)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    loadBookRecords(hotelId, book.id)
      .then(rows => { if (active) setRecords(rows) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Error al cargar las revisiones.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [book.id, hotelId, retry])
  const filtered = useMemo(() => filterEntries(records, book.id, query, from, to, status), [records, book.id, query, from, to, status])
  function change(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== 'ALL') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  async function download() {
    setExportError('')
    setExporting(true)
    try {
      const { buildBookPdf } = await import('./bookPdf')
      buildBookPdf(book, filtered, hotelName, demo).save([demo ? 'PRUEBA' : '', book.code, book.id, from, to].filter(Boolean).join('-') + '.pdf')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'No se pudo generar el PDF.')
    } finally {
      setExporting(false)
    }
  }
  const ready = !loading && !error && !invalidRange
  const empty = !filtered.length
  return <>
    <h2 className="mt-4 font-bold">{book.code} · {book.title}</h2>
    <div className="my-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-3 text-xs font-semibold sm:grid-cols-4 print:hidden">
      <label>Desde<input type="date" value={from} className={input} onChange={e => change('desde', e.target.value)} /></label>
      <label>Hasta<input type="date" value={to} className={input} onChange={e => change('hasta', e.target.value)} /></label>
      <label>Estado<select value={status} className={input} onChange={e => change('estado', e.target.value)}><option value="ALL">Todos</option><option value="FINAL">Finalizado</option><option value="DRAFT">Borrador</option></select></label>
      <label>Buscar<input type="search" value={query} className={input} placeholder="Equipo, ubicación, técnico o campaña" onChange={e => change('buscar', e.target.value)} /></label>
    </div>
    <div className="mb-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap print:hidden">
      <button className={button} onClick={() => void download()} disabled={!ready || empty || exporting}><Download size={16} />{exporting ? 'Generando…' : 'PDF'}</button>
      <button className={button} onClick={() => window.print()} disabled={!ready || empty}><Printer size={16} />Imprimir</button>
      <button className={button} onClick={() => setParams({ libro: book.id }, { replace: true })} disabled={!from && !to && !query && status === 'ALL'}>Limpiar filtros</button>
    </div>
    {exportError && <p role="alert">{exportError}</p>}
    {invalidRange && <p role="alert">La fecha de inicio debe ser anterior o igual a la fecha final.</p>}
    {loading && <p role="status">Cargando revisiones…</p>}
    {error && <p role="alert">{error} <button className={button} onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>}
    {ready && <><div className="mb-2 text-sm text-slate-600" role="status">{filtered.length} {filtered.length === 1 ? 'revisión' : 'revisiones'}{demo && ' · Documento de prueba'}</div>
      {empty ? <p className="rounded-lg bg-white p-3 text-sm">{records.length ? 'Ninguna revisión coincide con los filtros.' : 'Este libro todavía no tiene revisiones guardadas en este hotel.'}</p>
        : <section aria-label="Revisiones" className="rounded-xl bg-white">{filtered.map(entry => <Revision key={entry.id} entry={entry} />)}</section>}
    </>}
  </>
}

export default function BookReportsPage() {
  const { hotel } = useHotelScope()
  const { session } = useAuth()
  const [params] = useSearchParams()
  if (!hotel || !session?.user.id) return <p className="p-4">Selecciona un hotel para consultar los reportes.</p>
  const id = params.get('libro')
  const book = books.find(item => item.id === id)
  return <main className="mx-auto max-w-4xl p-3 text-slate-900 sm:p-5">
    <nav className="mb-2 flex gap-3 text-sm font-semibold text-sky-800 print:hidden">
      <Link to={id ? reportPath : '/registros-tecnicos'}>{id ? 'Volver a reportes' : 'Volver a registros técnicos'}</Link><Link to="/">Inicio</Link>
    </nav>
    <header><h1 className="text-xl font-bold">Generador de reportes</h1><p className="text-sm text-slate-600">{hotel.name}</p></header>
    {book ? <BookHistory key={[session.user.id, hotel.id, id].join(':')} book={book} hotelId={hotel.id} hotelName={hotel.name} demo={isDemoUser(session.user.id)} />
      : <>{id && <p role="alert">Libro desconocido. Selecciona un registro del listado.</p>}
        <div className="my-3 grid gap-2 sm:grid-cols-2">{books.map(item =>
          <Link key={item.id} to={reportPath + '?libro=' + item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-sky-500">
            <span><strong className="block text-sm">{item.title}</strong><small className="text-slate-600">{item.code}</small></span><ChevronRight size={16} />
          </Link>)}</div>
        <h2 className="text-sm font-semibold">Documentos de consulta</h2>
        <div className="mt-1 flex flex-wrap gap-3 text-sm text-sky-800"><Link to="/registros-tecnicos/libros/plan-anual">Plan anual de mantenimiento</Link><Link to="/registros-tecnicos/libros/aparatos">Relación de aparatos</Link></div>
      </>}
  </main>
}
