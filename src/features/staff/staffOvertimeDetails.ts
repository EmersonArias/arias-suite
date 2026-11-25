import type { StaffOvertime } from './staffModel'

export const overtimeLabels = {
  earned: 'Generadas',
  recovered: 'Recuperadas o programadas',
  paid: 'Abonadas',
  pending: 'Saldo acumulado',
} as const

export type OvertimeDetailKind = keyof typeof overtimeLabels

export function isOvertimeCredit(entry: StaffOvertime) {
  return entry.entry_type === 'EARNED' || entry.entry_type === 'ADJUSTMENT_PLUS'
}

export function recoveryStatus(date: string) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return date > today ? 'Programada' : 'Recuperada'
}

export function overtimeDetails(ledger: StaffOvertime[], operatorId: string, kind: OvertimeDetailKind) {
  const entries = ledger.filter(entry => entry.operator_id === operatorId)
  const credits = new Map(entries.filter(isOvertimeCredit).map(entry => [entry.id, entry]))
  const consumed = new Map<string, number>()
  for (const entry of entries) {
    const source = entry.compensates_entry_id
    if (!isOvertimeCredit(entry) && source && credits.has(source)) {
      consumed.set(source, (consumed.get(source) ?? 0) + entry.minutes)
    }
  }
  return entries.flatMap(entry => {
    const origin = credits.get(entry.compensates_entry_id ?? '')
    if (kind === 'pending') {
      if (isOvertimeCredit(entry)) {
        const minutes = entry.minutes - (consumed.get(entry.id) ?? 0)
        return minutes ? [{ entry, origin: entry, minutes }] : []
      }
      return origin ? [] : [{ entry, origin, minutes: -entry.minutes }]
    }
    const matches = kind === 'earned' ? isOvertimeCredit(entry)
      : entry.entry_type === (kind === 'recovered' ? 'REST_TAKEN' : 'PAID')
    return matches ? [{ entry, origin, minutes: entry.minutes }] : []
  }).sort((a, b) => a.entry.entry_date.localeCompare(b.entry.entry_date))
}

export function overtimeTimeRange(reason: string) {
  return reason.match(/^\d{2}:\d{2}[–-]\d{2}:\d{2}/)?.[0]
}
