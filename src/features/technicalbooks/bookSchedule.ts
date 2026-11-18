import { addPeriod, hotelDay } from '../../shared/maintenance/preventiveSchedule.ts'
import type { Period } from '../../shared/maintenance/preventiveSchedule.ts'
import type { BookDefinition, BookEntry, BookField } from './types.ts'

// Frecuencias verificadas en el PAM importado. Los libros sin frecuencia quedan manuales.
export const bookPeriods: Record<string, Period> = {
  bombas: { value: 6, unit: 'MONTH' }, climatizadores: { value: 6, unit: 'MONTH' },
  fancoils: { value: 1, unit: 'YEAR' }, 'cuadros-bt': { value: 1, unit: 'YEAR' }, fotoluminiscentes: { value: 1, unit: 'YEAR' },
  'luces-emergencia': { value: 3, unit: 'MONTH' }, 'puertas-cortafuegos': { value: 3, unit: 'MONTH' },
  extintores: { value: 3, unit: 'MONTH' }, bie: { value: 3, unit: 'MONTH' }, pci: { value: 3, unit: 'MONTH' },
  rociadores: { value: 3, unit: 'MONTH' }, calibraciones: { value: 3, unit: 'MONTH' },
}
export const normalizeIdentity = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
function periodFor(book: BookDefinition, field: BookField): Period | undefined {
  if (field.frequency) return ({ D: { value: 1, unit: 'DAY' }, S: { value: 1, unit: 'WEEK' }, M: { value: 1, unit: 'MONTH' } } as Record<string, Period>)[field.frequency]
  return bookPeriods[book.id]
}
export function controlSchedule(book: BookDefinition, entry: BookEntry, records: BookEntry[], today = hotelDay()) {
  return book.fields.filter(f => !f.frequency || entry.frequency === 'ALL' || f.frequency === entry.frequency).map(field => {
    const period = periodFor(book, field)
    const last = records.filter(r => r.id !== entry.id && r.hotelId === entry.hotelId && r.bookId === book.id && r.status === 'FINAL' && !r.supersedes &&
      (book.id === 'legionella' || (normalizeIdentity(r.asset) === normalizeIdentity(entry.asset) && normalizeIdentity(r.location) === normalizeIdentity(entry.location))) &&
      r.answers[field.id]?.value.trim() && r.answers[field.id]?.value !== 'NA').map(r => r.date).sort().at(-1)
    const nextDue = period && last ? addPeriod(last, period) : null
    return { field, nextDue, due: !nextDue || (nextDue <= today && nextDue <= entry.date), manual: !period }
  })
}
