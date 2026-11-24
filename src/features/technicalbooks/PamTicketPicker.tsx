import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { BookEntry } from './types'

export type PamTicket = { ticket_id: string; ot_number: string; equipment: string; location: string | null; plan_name: string }
type Props = { hotelId: string; bookId: string; ticketId?: string; readOnly: boolean; outcome?: BookEntry['pamOutcome']
  onSelect: (ticket?: PamTicket) => void; onOutcome: (value: BookEntry['pamOutcome']) => void }

export default function PamTicketPicker({ hotelId, bookId, ticketId, readOnly, outcome, onSelect, onOutcome }: Props) {
  const [tickets, setTickets] = useState<PamTicket[]>([])
  const requested = useRef(new URLSearchParams(window.location.search).get('ticket'))
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      const result = await supabase.from('technical_book_due_tickets').select('ticket_id,ot_number,equipment,location,plan_name')
        .eq('hotel_id', hotelId).eq('book_id', bookId).order('ot_number')
      if (active) {
        const rows = result.data ?? []
        setTickets(rows)
        setError(result.error?.message || '')

      }
    }
    void load()
    window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('focus', load) }
  }, [hotelId, bookId, attempt])
  useEffect(() => {
    const match = tickets.find(t => t.ticket_id === requested.current)
    if (match && !readOnly && !ticketId) { requested.current = null; onSelect(match) }
  }, [tickets, readOnly, ticketId, onSelect])
  if (readOnly) return null
  if (error) return <p role="alert">Error al consultar el PAM. <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></p>
  if (!tickets.length && !ticketId) return null
  return <section className="my-2 rounded-lg border bg-white p-2 text-sm">
    <label>Ticket PAM que completa esta revisión<select className="block w-full border p-1.5" value={ticketId || ''} onChange={e => onSelect(tickets.find(t => t.ticket_id === e.target.value))}>
      <option value="">Registrar solo en el libro</option>
      {ticketId && !tickets.some(t => t.ticket_id === ticketId) && <option value={ticketId}>Ticket ya no disponible</option>}
      {tickets.map(t => <option key={t.ticket_id} value={t.ticket_id}>{t.ot_number} · {t.equipment} · {t.location}</option>)}
    </select></label>
    {ticketId && <label className="mt-1 block">Resultado del trabajo completo del ticket<select className="block w-full border p-1.5" value={outcome || ''} onChange={e => onOutcome(e.target.value as Props['outcome'])}>
      <option value="">Seleccionar antes de finalizar</option><option value="COMPLETED">Realizado</option><option value="COMPLETED_WITH_ISSUES">Realizado con incidencias</option>
    </select></label>}
  </section>
}
