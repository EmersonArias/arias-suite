export type Period = { value: number; unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' }

export function hotelDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-')
}

export function addPeriod(day: string, period: Period): string {
  const date = new Date(day + 'T12:00:00Z')
  if (period.unit === 'DAY' || period.unit === 'WEEK') date.setUTCDate(date.getUTCDate() + period.value * (period.unit === 'WEEK' ? 7 : 1))
  else {
    const originalDay = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + period.value * (period.unit === 'YEAR' ? 12 : 1))
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(originalDay, lastDay))
  }
  return date.toISOString().slice(0, 10)
}

export function dueMessage(day: string): string {
  return `Todavía no toca esta revisión. Próxima fecha: ${day.split('-').reverse().join('/')}.`
}

export function planAccess(plan: { active: boolean; next_due_date: string | null; periodicity_unit?: string | null } | null | undefined, today = hotelDay()) {
  if (!plan) return { allowed: false, message: 'Sin plan asociado.' }
  if (!plan.active) return { allowed: false, message: 'Este mantenimiento está desactivado.' }
  if (!plan.next_due_date) return plan.periodicity_unit === 'VARIABLE'
    ? { allowed: true, message: 'Revisión según necesidad.' }
    : { allowed: false, message: 'Pendiente de programar: indica la primera fecha en el PAM.' }
  return { allowed: plan.next_due_date <= today, message: plan.next_due_date > today ? dueMessage(plan.next_due_date) : 'Revisión pendiente.' }
}

export function workOrderAccess(order: { work_type: string; scheduled_date: string | null }, today = hotelDay()) {
  return order.work_type === 'PREVENTIVE'
    ? planAccess({ active: true, next_due_date: order.scheduled_date }, today)
    : { allowed: true, message: '' }
}
