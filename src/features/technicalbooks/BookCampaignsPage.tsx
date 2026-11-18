import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHotelScope } from '../../shared/context/HotelScopeContext'
import { useAuth } from '../auth/context/AuthProvider'
import { useSystemDialog } from '../../shared/components/dialogs/SystemDialogProvider'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { supabase } from '../../lib/supabase'
import { bookDefinitions } from './bookDefinitions'
import { loadBookCampaigns, loadCampaignTargets, campaignTargetUrl, campaignTargetCompleted } from './bookCampaignRepository'
import type { BookCampaign, CampaignTarget } from './bookCampaignRepository'

const input = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button = input + ' font-semibold disabled:opacity-40'
export default function BookCampaignsPage() {
  const { hotel } = useHotelScope(), { session } = useAuth(), { confirm } = useSystemDialog()
  const readOnly = isDemoUser(session?.user.id || '')
  const [campaigns, setCampaigns] = useState<BookCampaign[]>([])
  const [targets, setTargets] = useState<CampaignTarget[]>([])
  const [selected, setSelected] = useState(new URLSearchParams(globalThis.location?.search || '').get('ticket') || '')
  const [filter, setFilter] = useState('PENDING'), [book, setBook] = useState('')
  const [outcome, setOutcome] = useState(''), [notes, setNotes] = useState('')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true), [loadedHotel, setLoadedHotel] = useState('')
  const request = useRef(0)
  async function reload() {
    if (!hotel) return
    const current = ++request.current
    setLoading(true)
    try {
      const rows = await loadBookCampaigns(hotel.id)
      const ticket = rows.some(row => row.ticket_id === selected) ? selected : rows.find(row => !row.closed_at)?.ticket_id || rows[0]?.ticket_id || ''
      const members = ticket ? await loadCampaignTargets(hotel.id, ticket) : []
      if (current !== request.current) return
      setCampaigns(rows); setSelected(ticket); setTargets(members); setLoadedHotel(hotel.id)
      setMessage('')
    } catch (e) { if (current === request.current) setMessage((e as Error).message) }
    finally { if (current === request.current) setLoading(false) }
  }
  useEffect(() => { void reload(); return () => { request.current++ } }, [hotel?.id, selected])
  useEffect(() => { setOutcome(''); setNotes(''); setBook('') }, [hotel?.id, selected])
  if (!hotel) return <p className="p-4">Selecciona un hotel.</p>
  if (loading || loadedHotel !== hotel.id) return <p className="p-4" role="status">{message || 'Cargando campañas…'}</p>
  const campaign = campaigns.find(row => row.ticket_id === selected)
  const required = targets.filter(row => row.required)
  const done = required.filter(campaignTargetCompleted).length
  const previous = required.filter(row => row.previous_work && !campaignTargetCompleted(row) &&
    (!row.previous_work.completed_at || row.previous_work.completed_at.slice(0, 4) === campaign?.scheduled_date.slice(0, 4)))
  const books = [...new Set(required.map(row => row.book_id))]
  const visible = required.filter(row => (!book || row.book_id === book) && (filter === 'ALL' || (filter === 'DONE' ? campaignTargetCompleted(row) : !campaignTargetCompleted(row))))
    .sort((a, b) => a.book_id.localeCompare(b.book_id) || a.location.localeCompare(b.location, 'es', { numeric: true }) || a.label.localeCompare(b.label, 'es', { numeric: true }))
  async function refreshScope() {
    if (busy || readOnly || !selected) return
    if (!await confirm({ title: 'Actualizar alcance', message: 'Se incorporarán las unidades activas del catálogo y se conservarán las fichas finalizadas. ¿Continuar?', confirmLabel: 'Actualizar' })) return
    setBusy(true)
    const result = await supabase.rpc('refresh_technical_book_campaign', { target_ticket: selected })
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    await reload()
  }
  async function close() {
    if (busy || readOnly || !selected || !outcome) return
    if (!await confirm({ title: 'Finalizar campaña', message: '¿Confirmas que están revisadas todas las unidades y apartados de esta campaña? Se cerrará su único ticket global y se registrará tu usuario.', confirmLabel: 'Finalizar campaña' })) return
    setBusy(true)
    const result = await supabase.rpc('complete_technical_book_campaign', { target_ticket: selected, target_outcome: outcome, target_observations: notes })
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    await reload(); setMessage('Campaña finalizada y ticket cerrado.')
  }
  async function confirmPrevious() {
    if (busy || readOnly || !previous.length) return
    if (!await confirm({ title: 'Confirmar trabajos anteriores', message: '¿Confirmas que las ' + previous.length + ' habitaciones marcadas anteriormente como terminadas corresponden a esta campaña? Se conservarán sus datos originales y quedará registrada tu confirmación.', confirmLabel: 'Confirmar trabajos' })) return
    setBusy(true)
    const result = await supabase.rpc('confirm_previous_fancoil_work', { target_ticket: selected, target_ids: previous.map(row => row.id) })
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    await reload()
  }
  return <main className="mx-auto max-w-5xl space-y-3 p-3 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold">Campañas de revisión</h1><Link className={button} to="/registros-tecnicos">Volver a registros</Link></header>
    <label className="block text-sm">Ticket global<select className={input + ' mt-1 block w-full'} value={selected} onChange={e => { setSelected(e.target.value); setOutcome(''); setNotes('') }}><option value="">Seleccionar…</option>{campaigns.map(row => <option key={row.ticket_id} value={row.ticket_id}>{row.ot_number} · {row.kind === 'PCI' ? 'Incendios' : 'Fancoils de habitaciones'} · {row.scheduled_date}{row.closed_at ? ' · Finalizada' : ''}</option>)}</select></label>
    {!campaigns.length && <p className="rounded-xl border bg-white p-3 text-sm">Las campañas aparecerán con sus tickets preventivos después de iniciar el ejercicio del hotel.</p>}
    {campaign && <><p className="font-semibold">{done} / {required.length} unidades y apartados terminados</p>
      <div className="flex flex-wrap gap-2"><select aria-label="Apartado" className={input} value={book} onChange={e => setBook(e.target.value)}><option value="">Todos los apartados</option>{books.map(id => <option key={id} value={id}>{bookDefinitions.find(row => row.id === id)?.title || id}</option>)}</select><select aria-label="Estado de revisión" className={input} value={filter} onChange={e => setFilter(e.target.value)}><option value="PENDING">Pendientes</option><option value="DONE">Terminados</option><option value="ALL">Todos</option></select><button className={button} disabled={busy || readOnly || !!campaign.closed_at} onClick={() => void refreshScope()}>Actualizar alcance</button></div>
      {!!previous.length && !campaign.closed_at && <button className={button} disabled={busy || readOnly} onClick={() => void confirmPrevious()}>Confirmar {previous.length} trabajos anteriores</button>}
      <div className="grid gap-2 sm:grid-cols-2">{visible.map(row => <article key={row.id} className="rounded-xl border bg-white p-3 text-sm"><strong>{row.label}</strong><p className="text-xs text-slate-600">{row.location} · {bookDefinitions.find(book => book.id === row.book_id)?.title}</p><p className="my-1">{row.record_id ? 'Revisión finalizada' : row.previous_confirmed_at ? 'Trabajo anterior confirmado' : 'Pendiente'}</p>{!campaignTargetCompleted(row) && !campaign.closed_at && <Link className="font-semibold text-sky-800" to={campaignTargetUrl(row)}>Abrir ficha</Link>}{row.previous_work && <p className="text-xs">Seguimiento anterior · {row.previous_work.completed_at || 'Fecha original sin anotar'} · {row.previous_work.technician || 'Operario original sin anotar'}</p>}{row.record_id && <Link className="text-sky-800" to={'/maintenance/record?book=' + row.book_id}>Consultar historial</Link>}</article>)}</div>
      {!campaign.closed_at && <section className="space-y-2 rounded-xl border bg-white p-3"><h2 className="font-semibold">Cierre global</h2><select aria-label="Resultado global" className={input + ' block w-full'} value={outcome} onChange={e => setOutcome(e.target.value)}><option value="">Seleccionar resultado…</option><option value="COMPLETED">Realizado</option><option value="COMPLETED_WITH_ISSUES">Realizado con incidencias</option></select><textarea aria-label="Observaciones de cierre" className={input + ' block w-full'} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones de cierre" /><button className={button} disabled={busy || readOnly || !outcome || !required.length || done !== required.length} onClick={() => void close()}>Finalizar campaña y cerrar ticket</button></section>}
    </>}
    {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  </main>
}
