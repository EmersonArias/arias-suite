import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClipboardPlus, FileText, History, Save, CheckCircle2, X, Search, Camera } from 'lucide-react'
import { useAuth } from '../auth/context/AuthProvider'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { useSystemDialog } from '../../shared/components/dialogs/SystemDialogProvider'
import { useBeforeUnloadGuard } from '../../shared/hooks/useBeforeUnloadGuard'
import { canNavigateInSuite } from '../../shared/navigation/navigationGuard'
import BrandLogo from '../../shared/components/branding/BrandLogo'
import { bookDefinitions } from './bookDefinitions'
import { completedCount, createEntry, entryFields, fieldIssue, filterEntries, frequencyLabels, issueCount } from './bookModel'
import type { Scope } from './bookModel'
import type { BookDefinition, BookEntry, BookField } from './types'
import { loadBookRecords, saveBookRecord } from './bookRepository'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { controlSchedule } from './bookSchedule'
import { dueMessage, hotelDay } from '../../shared/maintenance/preventiveSchedule'
import { useHotelDay } from '../../shared/maintenance/useHotelDay'

import PamTicketPicker from './PamTicketPicker'
const ReferenceCatalog = lazy(() => import('./ReferenceCatalog'))
const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-700'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40'
const trialPath = '/registros-tecnicos/libros'

function TrialNotice() {
  return <aside className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">Las revisiones finalizadas se conservan en el historial del hotel.</aside>
}
function BookIndex() {
  return <>
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      <Link to={trialPath + '/plan-anual'} className="rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sky-950"><h2 className="font-bold">R-SSTT-01-01 · Plan anual</h2><p className="mt-1 text-sm">Consulta la planificación anual de mantenimiento. Solo lectura; no activa vencimientos.</p></Link>
      <Link to={trialPath + '/aparatos'} className="rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sky-950"><h2 className="font-bold">R-SSTT-01-02 · Relación de aparatos</h2><p className="mt-1 text-sm">Consulta la relación de equipos e instalaciones. Solo lectura; no modifica el inventario del hotel.</p></Link>
      <article className="rounded-2xl border border-slate-200 bg-slate-100 p-5 text-slate-700"><h2 className="font-bold">R-SSTT-01-03 · Piscina y SPA</h2><div className="mt-2 flex gap-4 text-sky-700"><Link to="/pools">Abrir piscina</Link><Link to="/spa">Abrir spa</Link></div></article>
    </div>
    <section aria-label="Libros disponibles" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {bookDefinitions.map(book => <Link key={book.id} to={trialPath + '/' + book.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md">
        <img src={'/assets/record-icons-3d/' + book.icon + '.webp'} alt="" width={72} height={72} className="h-18 w-18 shrink-0 object-contain" />
        <div><p className="text-xs font-semibold text-sky-700">{book.code}</p><h2 className="mt-1 font-bold text-slate-800">{book.title}</h2><p className="mt-1 text-xs text-slate-500">{book.fields.length} controles</p></div>
      </Link>)}
    </section>
  </>
}
function FieldCard({ field, entry, disabled, update, showErrors }: { field: BookField; entry: BookEntry; disabled: boolean; showErrors: boolean; update: (value: string, note?: string) => void }) {
  const answer = entry.answers[field.id] ?? { value: '', note: '' }
  const issue = fieldIssue(field, answer, showErrors)
  const adverse = answer.value === 'X' || (!!field.adverse && answer.value === field.adverse)
  const id = 'book-field-' + field.id
  return <div className={'rounded-xl border bg-white p-2 ' + (issue || adverse ? 'border-amber-300' : 'border-slate-200')}>
    <div className="flex items-start justify-between gap-2"><label htmlFor={id} className="text-sm font-bold leading-5 text-slate-800">{field.label}</label><span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ' + (adverse ? 'bg-amber-50 text-amber-800' : answer.value ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-500')}>{adverse ? 'Con incidencia' : answer.value ? 'Registrado' : 'Sin registrar'}</span></div>
    {field.reference && <p className="mt-1 text-xs text-slate-500">Valor de referencia: {field.reference}{field.unit ? ' ' + field.unit : ''}</p>}
    <div className="mt-3 flex items-center gap-2">
      {field.kind === 'check' || field.kind === 'yesno' ? <select id={id} value={answer.value} disabled={disabled} onChange={e => update(e.target.value)} className={input} aria-describedby={issue ? id + '-error' : undefined}>
        <option value="">Selecciona resultado…</option>
        {field.kind === 'check' ? <><option value="V">V · Correcto</option><option value="X">X · Avería / no correcto</option></> : <><option value="SI">Sí</option><option value="NO">No</option></>}
        <option value="NA">No aplica · explicar</option>
      </select> : <>
        <input id={id} disabled={disabled || answer.value === 'NA'} type={field.kind === 'date' ? 'date' : 'text'} inputMode={field.kind === 'number' ? 'decimal' : undefined} value={answer.value === 'NA' ? '' : answer.value} onChange={e => update(e.target.value)} className={input} aria-invalid={!!issue} aria-describedby={issue ? id + '-error' : undefined} />
        {field.unit && <span className="shrink-0 text-xs font-semibold text-slate-500">{field.unit}</span>}
      </>}
    </div>
    {!['check', 'yesno'].includes(field.kind) && <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={answer.value === 'NA'} disabled={disabled} onChange={e => update(e.target.checked ? 'NA' : '')} />No aplica</label>}
    <details open={adverse || answer.value === 'NA' || !!answer.note || undefined} className="mt-1 text-xs text-slate-500"><summary>Observación{adverse || answer.value === 'NA' ? ' obligatoria' : ''}</summary>
    <label className="mt-3 block text-xs text-slate-500" htmlFor={id + '-note'}>Detalle / observación{adverse || answer.value === 'NA' ? ' · obligatorio' : ''}</label>
    <textarea id={id + '-note'} value={answer.note} disabled={disabled} onChange={e => update(answer.value, e.target.value)} rows={2} maxLength={5000} className={input + ' mt-1'} />
    </details>
    {issue && <p id={id + '-error'} className="mt-2 text-xs text-amber-800">{issue}</p>}
  </div>
}
function BookForm({ book, scope, hotelName }: { book: BookDefinition; scope: Scope; hotelName: string }) {
  const today = useHotelDay()
  const demo = isDemoUser(scope.userId)
  const { confirm, alert } = useSystemDialog()
  const [records, setRecords] = useState<BookEntry[]>([])
  const [storageError, setStorageError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    const refresh = () => loadBookRecords(scope.hotelId, book.id).then(rows => { if (active) { setRecords(rows); setStorageError('') } })
      .catch(e => { if (active) setStorageError(e.message) }).finally(() => { if (active) setLoading(false) })
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [scope.hotelId, book.id, today])
  const [entry, setEntry] = useState(() => createEntry(book, scope))
  const [baseline, setBaseline] = useState<BookEntry | null>(null)
  const [initial, setInitial] = useState(() => JSON.stringify(entry))
  const [tab, setTab] = useState<'form' | 'history'>('form')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('ALL')
  const [notice, setNotice] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(entry) !== initial
  const foreignDraft = entry.status === 'DRAFT' && !!baseline && entry.userId !== scope.userId
  const readOnly = demo || entry.status === 'FINAL' || foreignDraft
  useBeforeUnloadGuard(dirty)
  const current = readOnly ? entry : { ...entry, date: today }
  const schedule = controlSchedule(entry.template, current, records, today)
  const pendingEntry = readOnly || entry.supersedes ? entry : { ...current, controlIds: schedule.filter(s => s.due).map(s => s.field.id) }
  const fields = entryFields(entry.template, pendingEntry)
  const notDue = !readOnly && !entry.supersedes && (!fields.length || entry.date > hotelDay())
  const nextDue = schedule.filter(s => !s.due).map(s => s.nextDue).filter((d): d is string => !!d).sort()[0]
  const sections = [...new Set(fields.map(f => f.section))]
  const filtered = useMemo(() => filterEntries(records, book.id, query, from, to, status), [records, book.id, query, from, to, status])
  const bookRecords = records.filter(r => r.bookId === book.id)
  function update<K extends keyof BookEntry>(key: K, value: BookEntry[K]) { setEntry(e => ({ ...e, [key]: value })); setNotice('') }
  function reset(next: BookEntry, saved: BookEntry | null) { setEntry(next); setBaseline(saved); setInitial(JSON.stringify(next)); setErrors([]); setShowErrors(false); setNotice(''); setTab('form') }
  async function canLeave() { return !dirty || await confirm({ title: 'Cambios sin guardar', message: '¿Quieres descartar los cambios de esta ficha?', confirmLabel: 'Descartar', variant: 'warning' }) }
  async function select(next: BookEntry) { if (await canLeave()) reset(structuredClone(next), structuredClone(next)) }
  async function save(finalize: boolean) {
    if (busy || readOnly || loading || notDue) return
    if (finalize && entry.pamTicketId && !entry.pamOutcome) { setErrors(['Selecciona el resultado del ticket PAM.']); return }
    setShowErrors(finalize); setErrors([])
    let finalizationMessage = 'Se comprobarán los controles y se guardará la revisión en el hotel. Una vez finalizada no podrá borrarse ni modificarse.'
    if (entry.pamTicketId) {
      finalizationMessage = book.id === 'fotoluminiscentes'
        ? 'Se cerrará el ticket anual global de elementos fotoluminiscentes. ¿Confirmas que has terminado la revisión de todas las señales del hotel?'
        : 'Se cerrará el ticket PAM seleccionado. ¿Se ha completado todo su trabajo, incluidas las unidades a las que corresponde?'
    }
    if (finalize && !await confirm({ title: 'Finalizar revisión', message: finalizationMessage, confirmLabel: 'Finalizar' })) return
    setBusy(true)
    try {
      const next = await saveBookRecord(scope, book, pendingEntry, finalize, baseline)
      setRecords(rows => [next, ...rows.filter(row => row.id !== next.id)]); reset(next, structuredClone(next)); setNotice(finalize ? 'Revisión finalizada y guardada en Arias Suite.' : 'Borrador guardado en Arias Suite.')
    } catch (e) { setErrors((e instanceof Error ? e.message : 'No se pudo guardar.').split('\n')); requestAnimationFrame(() => document.querySelector('[data-book-errors]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
    finally { setBusy(false) }
  }
  async function changeFrequency(value: string) {
    if (Object.values(entry.answers).some(a => a.value || a.note) && !await confirm({ title: 'Cambiar controles', message: 'Cambiar la frecuencia vaciará los controles de este borrador. ¿Continuar?', confirmLabel: 'Cambiar', variant: 'warning' })) return
    setEntry(e => ({ ...e, frequency: value, controlIds: undefined, answers: {} })); setShowErrors(false); setErrors([])
  }
  async function exportPdf(rows: BookEntry[]) {
    if (!rows.length) { await alert({ title: 'Sin registros', message: 'Guarda una revisión o cambia los filtros antes de exportar.' }); return }
    try { const { buildBookPdf } = await import('./bookPdf'); buildBookPdf(book, rows, hotelName, demo).save(`${demo ? 'PRUEBA-' : ''}${book.code}-${book.id}.pdf`) }
    catch (e) { await alert({ title: 'No se pudo generar el PDF', message: e instanceof Error ? e.message : 'Comprueba los datos del registro.' }) }
  }
  async function photos(files: FileList | null) {
    if (!files) return
    const incoming = Array.from(files)
    if (incoming.length + entry.evidence.length > 3 || incoming.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 1024 * 1024)) { await alert({ title: 'Revisa las fotografías', message: 'Puedes adjuntar hasta tres imágenes PNG, JPEG o WebP, de hasta 1 MB cada una.' }); return }
    setBusy(true)
    try {
      const evidence = await Promise.all(incoming.map(file => new Promise<{ name: string; dataUrl: string }>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('No se pudo leer la imagen.')); reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) }); reader.readAsDataURL(file) })))
      await Promise.all(evidence.map(async photo => { const image = new Image(); image.src = photo.dataUrl; await image.decode() }))
      setEntry(e => ({ ...e, evidence: [...e.evidence, ...evidence] }))
    } catch { await alert({ title: 'Error de lectura', message: 'No se pudieron añadir las fotografías.' }) }
    finally { setBusy(false) }
  }
  return <>
    <nav aria-label="Acciones del libro" className="book-action-row mb-2">
      <Link className={button} to="/registros-tecnicos" onClick={e => { if (!canNavigateInSuite()) e.preventDefault() }}>Volver</Link>
      <Link className={button} to="/" onClick={e => { if (!canNavigateInSuite()) e.preventDefault() }}>Inicio</Link>
      {(['form', 'history'] as const).map((t, i) => <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={button + (tab === t ? ' border-sky-300 bg-sky-50 text-sky-800' : '')}>{[<ClipboardPlus size={17} />, <History size={17} />][i]}{['Formulario', `Historial (${bookRecords.length})`][i]}</button>)}
      {tab === 'form' && <>
        <button className={button} disabled={busy} onClick={async () => { if (await canLeave()) reset(createEntry(book, scope), null) }}><ClipboardPlus size={17} />Nueva revisión</button>
        {!readOnly ? <><button className={button} disabled={busy || loading || !!storageError || notDue} onClick={() => void save(false)}><Save size={17} />Guardar borrador</button><button className={button + ' border-teal-600 bg-teal-600 text-white hover:bg-teal-700'} disabled={busy || loading || !!storageError || notDue} onClick={() => void save(true)}><CheckCircle2 size={17} />Finalizar revisión</button><button className={button} disabled={!dirty || busy} onClick={async () => { if (await canLeave()) reset(baseline ? structuredClone(baseline) : createEntry(book, scope), baseline) }}><X size={17} />Cancelar</button></> : null}
        <button className={button} disabled={(!demo && (!baseline || dirty)) || busy} onClick={() => void exportPdf(demo ? [entry] : baseline ? [baseline] : [])}><FileText size={17} />PDF de la ficha</button>
      </>}
    </nav>
    {loading && <p role="status" className="mb-4 p-3 text-sm">Cargando historial del hotel…</p>}
    {storageError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{storageError}<button className={button + ' ml-3'} onClick={() => { try { setLoading(true); loadBookRecords(scope.hotelId, book.id).then(rows => { setRecords(rows); setStorageError('') }).catch(e => setStorageError(e.message)).finally(() => setLoading(false)) } catch { /* Preserve unreadable data. */ } }}>Reintentar lectura</button></div>}
    {tab === 'history' ? <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="text-lg font-bold">Historial de revisiones · {book.title}</h2>
      <div className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="text-xs text-slate-600">Equipo, ubicación o técnico<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input aria-label="Buscar registros" value={query} onChange={e => setQuery(e.target.value)} className={input + ' pl-9'} /></div></label><label className="text-xs text-slate-600">Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} className={input + ' mt-1'} /></label><label className="text-xs text-slate-600">Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} className={input + ' mt-1'} /></label><label className="text-xs text-slate-600">Estado<select value={status} onChange={e => setStatus(e.target.value)} className={input + ' mt-1'}><option value="ALL">Todos</option><option value="DRAFT">Borradores</option><option value="FINAL">Finalizados</option></select></label><button className={button + ' self-end'} onClick={() => void exportPdf(filtered)}><FileText size={17} />PDF del listado</button></div>
      {!filtered.length ? <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">No hay registros que coincidan con los filtros.</p> : <div className="space-y-2">{filtered.map(record => <button key={record.id} onClick={() => void select(record)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4 text-left hover:bg-sky-50"><span><strong className="text-sm">{record.asset}</strong><span className="mt-1 block text-xs text-slate-500">{record.date} · {record.time} · {record.technician} · Rev. {record.revision}</span></span><span className="text-xs text-slate-600">{record.status === 'FINAL' ? 'Finalizado' : 'Borrador'} · {issueCount(book, record)} incidencias{records.some(r => r.supersedes === record.id) ? ' · Con rectificación' : ''}</span></button>)}</div>}
    </section> : <>
      {foreignDraft && <p className="mb-4 p-3 text-sm text-slate-600">Borrador de otro usuario. Solo su autor puede modificarlo.</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
      {!!errors.length && <div role="alert" data-book-errors className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>No se ha guardado.</strong><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      <PamTicketPicker hotelId={scope.hotelId} bookId={book.id} readOnly={readOnly} ticketId={entry.pamTicketId} outcome={entry.pamOutcome}
        onSelect={t => setEntry(e => ({ ...e, pamTicketId: t?.ticket_id, pamOutcome: undefined, asset: e.asset || t?.equipment || '', location: e.location || t?.location || '' }))}
        onOutcome={value => update('pamOutcome', value)} />
      <section className="mb-2 rounded-xl border bg-white p-2"><h2 className="mb-4 font-bold text-slate-800">Datos de la revisión</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">{book.assetLabel} *<input value={entry.asset} disabled={readOnly || !!entry.supersedes} maxLength={300} onChange={e => update('asset', e.target.value)} className={input + ' mt-1'} /></label>
        <label className="text-xs font-semibold text-slate-600">Ubicación<input value={entry.location} disabled={readOnly || !!entry.supersedes} maxLength={300} onChange={e => update('location', e.target.value)} className={input + ' mt-1'} /></label>
        <p className="text-xs text-slate-600">{baseline ? [baseline.date, baseline.time, baseline.technician].join(' · ') : 'Fecha, hora y operario se registran al guardar.'}</p>
        <label className="text-xs font-semibold text-slate-600">Campaña / trimestre / revisión<input value={entry.campaign} disabled={readOnly} maxLength={300} onChange={e => update('campaign', e.target.value)} placeholder="Ej. 2026 · 4.ª revisión" className={input + ' mt-1'} /></label>
        {book.fields.some(f => f.frequency) && <label className="text-xs font-semibold text-slate-600">Controles de esta visita<select value={entry.frequency} disabled={readOnly || !!entry.supersedes} onChange={e => void changeFrequency(e.target.value)} className={input + ' mt-1'}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {entry.supersedes && <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Motivo de rectificación *<textarea value={entry.correctionReason} disabled={readOnly} maxLength={3000} onChange={e => update('correctionReason', e.target.value)} className={input + ' mt-1'} /></label>}
      </div><p className="mt-4 text-xs text-slate-500">{completedCount(book, pendingEntry)} / {fields.length} controles registrados · {issueCount(book, pendingEntry)} incidencias. Una revisión finalizada puede contener averías: el resultado de la revisión y el estado del equipo se conservan por separado.</p></section>
      {!readOnly && !entry.supersedes && <aside role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        {entry.date > hotelDay() ? 'No se puede registrar una revisión futura.' : notDue && nextDue ? dueMessage(nextDue) : 'Se muestran los controles pendientes para esta fecha. Los ya realizados permanecen en el historial.'}
        {schedule.some(s => !s.due) && <details className="mt-2"><summary className="cursor-pointer font-semibold">Ver controles que todavía no corresponden</summary><ul className="mt-2 space-y-1">{schedule.filter(s => !s.due).map(s => <li key={s.field.id}>{s.field.label}: {s.nextDue && dueMessage(s.nextDue)}</li>)}</ul></details>}
        {schedule.some(s => s.manual) && <p className="mt-2">Los controles sin periodicidad definida se registran según el plan o la necesidad; no tienen una fecha automática asignada.</p>}
      </aside>}
      {sections.map(section => <section key={section} className="mb-5"><h2 className="mb-3 text-base font-bold text-slate-700">{section}</h2><div className="grid gap-3 lg:grid-cols-2">{fields.filter(f => f.section === section).map(field => <FieldCard key={field.id} field={field} entry={entry} disabled={readOnly || loading || notDue} showErrors={showErrors} update={(value, note) => setEntry(e => ({ ...e, answers: { ...e.answers, [field.id]: { value, note: note ?? e.answers[field.id]?.note ?? '' } } }))} />)}</div></section>)}
      <section className="rounded-2xl border bg-white p-4 sm:p-5"><label htmlFor="book-observations" className="font-bold text-slate-700">Observaciones / actuaciones</label><textarea id="book-observations" rows={4} value={entry.observations} disabled={readOnly} maxLength={15000} onChange={e => update('observations', e.target.value)} className={input + ' mt-3'} />
        <div className="mt-4"><label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><Camera size={18} />Fotografías de la revisión<input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={readOnly || busy} onChange={e => { void photos(e.target.files); e.target.value = '' }} className="block max-w-full text-xs" /></label><p className="mt-1 text-xs text-slate-500">Hasta 3 imágenes de 1 MB. Se guardan con la revisión del hotel.</p><div className="mt-3 flex flex-wrap gap-3">{entry.evidence.map((photo, index) => <figure key={index} className="w-32"><img src={photo.dataUrl} alt={photo.name} className="h-24 w-32 rounded-xl object-cover" /><figcaption className="truncate text-xs">{photo.name}</figcaption>{!readOnly && <button className="mt-1 text-xs text-red-700 underline" onClick={() => update('evidence', entry.evidence.filter((_, i) => i !== index))}>Quitar fotografía</button>}</figure>)}</div></div>
      </section>

    </>}
  </>
}
export default function TechnicalBooksPage() {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const { session } = useAuth()
  const book = bookDefinitions.find(b => b.id === bookId)
  if (!hotel || !session?.user.id) return <p className="p-6">Selecciona un hotel para revisar sus libros.</p>
  return <main className="book-screen min-h-screen bg-slate-50 p-2 text-slate-900 sm:p-5"><div className="mx-auto max-w-[1300px]">
    <header className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm"><BrandLogo className="h-12 w-auto" onActivate={() => { if (canNavigateInSuite()) navigate('/') }} /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-sky-700">{book?.code || 'Libros técnicos'}</p><h1 className="text-xl font-bold sm:text-2xl">{book?.title || (bookId === 'plan-anual' ? 'Plan anual de mantenimiento' : bookId === 'aparatos' ? 'Relación de aparatos' : 'Libros técnicos')}</h1><p className="mt-1 text-xs text-slate-500">{hotel.name}</p></div>{!book && <Link to="/registros-tecnicos" onClick={event => { if (!canNavigateInSuite()) event.preventDefault() }} className={button}>Volver a Registros técnicos</Link>}</header>
    {!book && <TrialNotice />}
    {!bookId ? <BookIndex /> : ['plan-anual', 'aparatos'].includes(bookId) ? <Suspense fallback={<p>Cargando referencia…</p>}><ReferenceCatalog mode={bookId} /></Suspense> : book ? <BookForm key={`${session.user.id}:${hotel.id}:${book.id}`} book={book} scope={{ userId: session.user.id, hotelId: hotel.id }} hotelName={hotel.name} /> : <p className="rounded-xl bg-white p-5">Este libro no está disponible. Piscina y SPA conservan sus módulos actuales.</p>}
  </div></main>
}
