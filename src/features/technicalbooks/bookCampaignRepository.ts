import { supabase } from '../../lib/supabase'
import { hotelDay } from '../../shared/maintenance/preventiveSchedule'
export type CampaignTarget = {
  id: string; ticket_id: string; hotel_id: string; book_id: string; target_key: string; label: string; location: string
  location_id: string; equipment_id: string | null; unit_id: string | null; record_id: string | null; required: boolean
  started_at: string | null
  previous_work: { status: string; completed_at: string | null; technician: string; notes: string } | null
  previous_confirmed_at: string | null
}
export const campaignTargetCompleted = (target: CampaignTarget) => !!(target.record_id || target.previous_confirmed_at)
export type BookCampaign = {
  ticket_id: string; kind: 'FANCOILS' | 'PCI'; closed_at: string | null; ot_number: string; scheduled_date: string; status: string
}
export async function loadBookCampaigns(hotelId: string): Promise<BookCampaign[]> {
  const rows: Array<Pick<BookCampaign, 'ticket_id' | 'kind' | 'closed_at'>> = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('technical_book_campaigns').select('ticket_id,kind,closed_at').eq('hotel_id', hotelId)
      .order('created_at', { ascending: false }).order('ticket_id').range(offset, offset + 499)
    if (result.error) throw new Error(result.error.message)
    rows.push(...result.data as typeof rows)
    if (result.data.length < 500) break
  }
  const orders: Array<{ id: string; ot_number: string; scheduled_date: string; status: string }> = []
  for (let offset = 0; offset < rows.length; offset += 200) {
    const result = await supabase.from('maintenance_work_orders').select('id,ot_number,scheduled_date,status').eq('hotel_id', hotelId)
      .in('id', rows.slice(offset, offset + 200).map(row => row.ticket_id))
    if (result.error) throw new Error(result.error.message)
    orders.push(...result.data)
  }
  return rows.flatMap(row => {
    const order = orders.find(order => order.id === row.ticket_id)
    return order ? [{ ...row, ot_number: order.ot_number, scheduled_date: order.scheduled_date, status: order.status } as BookCampaign] : []
  })
}
export async function loadCampaignTargets(hotelId: string, ticketId: string): Promise<CampaignTarget[]> {
  const rows: CampaignTarget[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('technical_book_campaign_targets').select('*').eq('hotel_id', hotelId).eq('ticket_id', ticketId).order('id').range(offset, offset + 499)
    if (result.error) throw new Error(result.error.message)
    rows.push(...result.data as CampaignTarget[])
    if (result.data.length < 500) return rows
  }
}
export async function loadCampaignTarget(hotelId: string, targetId: string): Promise<CampaignTarget> {
  const result = await supabase.from('technical_book_campaign_targets').select('*').eq('hotel_id', hotelId).eq('id', targetId).single()
  if (result.error) throw new Error(result.error.message)
  return result.data as CampaignTarget
}
export const campaignTargetUrl = (target: CampaignTarget) =>
  '/registros-tecnicos/libros/' + target.book_id + '?campaign=' + target.ticket_id + '&target=' + target.id
export async function findOpenCampaignTarget(hotelId: string, bookId: string, targetKey: string): Promise<CampaignTarget | null> {
  if (!['fancoils', 'extintores', 'bie', 'pci', 'rociadores'].includes(bookId)) return null
  const today = hotelDay()
  const campaigns = (await loadBookCampaigns(hotelId)).filter(row => !row.closed_at && row.scheduled_date <= today &&
    ['PENDING', 'IN_PROGRESS', 'IN_MANAGEMENT'].includes(row.status)).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  for (const campaign of campaigns) {
    const result = await supabase.from('technical_book_campaign_targets').select('*').eq('hotel_id', hotelId)
      .eq('ticket_id', campaign.ticket_id).eq('book_id', bookId).eq('target_key', targetKey).eq('required', true).maybeSingle()
    if (result.error) throw new Error(result.error.message)
    if (result.data && !campaignTargetCompleted(result.data as CampaignTarget)) return result.data as CampaignTarget
  }
  return null
}
