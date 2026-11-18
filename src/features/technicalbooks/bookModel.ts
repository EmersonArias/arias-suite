import type { Answer, BookDefinition, BookEntry } from './types.ts'
import { assertDemoWriteAllowed } from '../../core/access/demoReadOnly.ts'
import { hotelDay } from '../../shared/maintenance/preventiveSchedule.ts'

export type Scope = { hotelId: string; userId: string }
export type SandboxStorage = Pick<Storage, 'getItem' | 'setItem'>
const values = new Set(['V', 'X', 'NA'])
const yesno = new Set(['SI', 'NO', 'NA'])
export const frequencyLabels: Record<string, string> = { ALL: 'Todos', D: 'Diarios', S: 'Semanales', M: 'Mensuales', V: 'Según plan' }
export function sandboxKey(scope: Scope) {
  return `arias-suite:technical-books:trial:v1:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.hotelId)}`
}
export function localDay(now = new Date()) {
  return hotelDay(now)
}
export function createEntry(book: BookDefinition, scope: Scope): BookEntry {
  const now = new Date()
  return { id: crypto.randomUUID(), bookId: book.id, definitionHash: book.sha256, template: structuredClone(book), ...scope, date: localDay(now),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, asset: '', location: '',
    technician: '', campaign: '', frequency: 'ALL', answers: {}, observations: '', evidence: [],
    status: 'DRAFT', revision: 1, supersedes: null, correctionReason: '', createdAt: now.toISOString(), finalizedAt: null }
}
export function entryFields(book: BookDefinition, entry: BookEntry) {
  return book.fields.filter(field => (!field.frequency || entry.frequency === 'ALL' || field.frequency === entry.frequency) && (!entry.controlIds || entry.controlIds.includes(field.id)))
}
export function decimal(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}
export function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
}
export function fieldIssue(field: BookDefinition['fields'][number], answer: Answer | undefined, complete: boolean) {
  const value = answer?.value.trim() ?? ''
  if (!value) return complete ? 'Falta registrar este control.' : ''
  if (value === 'NA') return answer?.note.trim() ? '' : 'Explica por qué no aplica.'
  if (field.kind === 'check' && !values.has(value)) return 'Selecciona un resultado válido.'
  if (field.kind === 'yesno' && !yesno.has(value)) return 'Selecciona Sí o No.'
  if ((value === 'X' || value === field.adverse) && !answer?.note.trim()) return 'Anota la incidencia o el detalle del resultado.'
  if (field.kind === 'number') {
    const n = decimal(value)
    if (n === null) return 'Introduce una medición numérica válida.'
    if (field.min !== undefined && n < field.min) return `El valor mínimo es ${field.min}.`
  }
  if (field.kind === 'date' && !validDay(value)) return 'Introduce una fecha válida.'
  if (value.length > 3000 || (answer?.note.length ?? 0) > 5000) return 'El texto de este control es demasiado largo.'
  return ''
}
// Postgres JSONB can reorder object keys when a saved draft is reloaded.
function orderedKeys(_key: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
}
export function validateEntry(book: BookDefinition, entry: BookEntry, complete = false): string[] {
  const issues: string[] = []
  if (!validDay(entry.date)) issues.push('Indica una fecha válida.')
  if (entry.date > hotelDay()) issues.push('No se puede registrar una revisión futura.')
  if (entry.controlIds && (!entry.controlIds.length || new Set(entry.controlIds).size !== entry.controlIds.length || entry.controlIds.some(id => !book.fields.some(f => f.id === id && (!f.frequency || entry.frequency === 'ALL' || f.frequency === entry.frequency))))) issues.push('Selecciona al menos un control pendiente válido.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) issues.push('Indica una hora válida.')
  if (!entry.asset.trim()) issues.push(`Indica ${book.assetLabel.toLowerCase()}.`)
  if (!entry.technician.trim()) issues.push('Indica el técnico responsable.')
  if (entry.bookId !== book.id || entry.definitionHash !== book.sha256) issues.push('La versión de la ficha no coincide con el libro.')
  if (JSON.stringify(entry.template, orderedKeys) !== JSON.stringify(book, orderedKeys)) issues.push('La plantilla guardada no coincide con la versión de este formulario.')
  if (!(entry.frequency in frequencyLabels)) issues.push('Frecuencia de controles no válida.')
  if (entry.supersedes && !entry.correctionReason.trim()) issues.push('Indica el motivo de la rectificación.')
  for (const field of entryFields(book, entry)) {
    const issue = fieldIssue(field, entry.answers[field.id], complete)
    if (issue) issues.push(`${field.label}: ${issue}`)
    if (complete && entry.targetKey && book.id === 'legionella' && /^activity-(9|1[0-8])$/.test(field.id) &&
      entry.answers[field.id]?.value && entry.answers[field.id].value !== 'NA' && !entry.controlEquipmentIds?.[field.id]) {
      issues.push(`${field.label}: selecciona el acumulador del catálogo.`)
    }
  }
  if (complete && book.id === 'puertas-cortafuegos' && entry.answers['control-G']?.value === 'X' && !entry.evidence.length) {
    issues.push('Adjunta una foto de los objetos que impiden el funcionamiento de la puerta, tal como pide la ficha.')
  }
  if (entry.evidence.length > 3 || entry.evidence.some(photo => !/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(photo.dataUrl) || photo.dataUrl.length > 1400000)) issues.push('Adjunta hasta tres imágenes PNG, JPEG o WebP, de un máximo de 1 MB cada una.')
  if ([entry.asset, entry.location, entry.technician, entry.campaign].some(s => s.length > 300) || entry.observations.length > 15000 || entry.correctionReason.length > 3000) issues.push('Alguno de los textos supera el tamaño admitido.')
  return issues
}
export function issueCount(book: BookDefinition, entry: BookEntry) {
  return entryFields(book, entry).filter(f => entry.answers[f.id]?.value === 'X' || (!!f.adverse && entry.answers[f.id]?.value === f.adverse)).length
}
export function completedCount(book: BookDefinition, entry: BookEntry) {
  return entryFields(book, entry).filter(f => !!entry.answers[f.id]?.value.trim()).length
}
export function fieldLabel(bookId: string, field: BookDefinition['fields'][number]) {
  return bookId === 'bie' && field.id === 'kg' ? 'Presión del manómetro (KG)' : field.label
}
export function answerText(field: BookDefinition['fields'][number], entry: BookEntry) {
  const a = entry.answers[field.id]
  if (!a?.value) return 'Sin registrar'
  const labels: Record<string, string> = { V: 'Correcto', X: 'Avería / no correcto', NA: 'No aplica', SI: 'Sí', NO: 'No' }
  const value = labels[a.value] ?? `${a.value}${field.unit ? ' ' + field.unit : ''}`
  return (entry.controlEquipmentLabels?.[field.id] ? entry.controlEquipmentLabels[field.id] + ' · ' : '') + value + (a.note ? ` · ${a.note}` : '')
}

function isEntry(value: unknown, scope: Scope): value is BookEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as BookEntry
  const strings = ['id', 'bookId', 'definitionHash', 'date', 'time', 'asset', 'location', 'technician', 'campaign', 'frequency', 'observations', 'createdAt', 'correctionReason'] as const
  return e.hotelId === scope.hotelId && e.userId === scope.userId && strings.every(k => typeof e[k] === 'string') &&
    ['DRAFT', 'FINAL'].includes(e.status) && Number.isInteger(e.revision) && e.revision > 0 &&
    (e.supersedes === null || typeof e.supersedes === 'string') && (e.finalizedAt === null || typeof e.finalizedAt === 'string') &&
    !!e.template && e.template.id === e.bookId && e.template.sha256 === e.definitionHash && Array.isArray(e.template.fields) && e.template.fields.every(f => f && typeof f.id === 'string' && typeof f.label === 'string' && ['check', 'yesno', 'number', 'text', 'date'].includes(f.kind)) &&
    !!e.answers && typeof e.answers === 'object' && !Array.isArray(e.answers) && Object.values(e.answers).every(a => !!a && typeof a.value === 'string' && typeof a.note === 'string') &&
    Array.isArray(e.evidence) && e.evidence.every(p => p && typeof p.name === 'string' && typeof p.dataUrl === 'string')
}
export function loadSandbox(storage: SandboxStorage, scope: Scope): BookEntry[] {
  const raw = storage.getItem(sandboxKey(scope))
  if (raw === null) return []
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('entries' in data) || !Array.isArray(data.entries) || !data.entries.every(e => isEntry(e, scope))) throw new Error('Los datos de prueba no se pueden leer. No se han sobrescrito.')
  return data.entries
}
export function persistEntry(storage: SandboxStorage, scope: Scope, book: BookDefinition, input: BookEntry, finalize: boolean, expected: BookEntry | null) {
  assertDemoWriteAllowed(scope.userId)
  if (scope.hotelId !== input.hotelId || scope.userId !== input.userId) throw new Error('El registro pertenece a otro hotel o usuario.')
  const issues = validateEntry(book, input, finalize)
  if (issues.length) throw new Error(issues.join('\n'))
  const current = loadSandbox(storage, scope)
  const existing = current.find(e => e.id === input.id)
  if (existing?.status === 'FINAL') throw new Error('Una revisión finalizada se conserva. Utiliza Rectificar.')
  if (JSON.stringify(existing ?? null) !== JSON.stringify(expected)) throw new Error('El registro ha cambiado en otra ventana. Recarga el historial antes de guardar.')
  if (input.supersedes) {
    const parent = current.find(e => e.id === input.supersedes)
    if (!parent || parent.status !== 'FINAL' || parent.bookId !== input.bookId || current.some(e => e.supersedes === parent.id && e.id !== input.id)) throw new Error('La revisión original ya tiene una rectificación o no está disponible.')
    if (input.revision !== parent.revision + 1) throw new Error('La revisión de la rectificación no es válida.')
  } else if (input.revision !== 1) throw new Error('Número de revisión no válido.')
  // Exclude controls outside the selected frequency; never silently retain hidden measurements.
  const allowed = new Set(entryFields(book, input).map(f => f.id))
  const next: BookEntry = { ...structuredClone(input), answers: Object.fromEntries(Object.entries(input.answers).filter(([id]) => allowed.has(id))),
    status: finalize ? 'FINAL' : 'DRAFT', finalizedAt: finalize ? new Date().toISOString() : null }
  const entries = [next, ...current.filter(e => e.id !== next.id)]
  // Write first; the caller updates the screen only after successful persistence.
  storage.setItem(sandboxKey(scope), JSON.stringify({ version: 1, entries }))
  return { entries, entry: next }
}
export function correction(entry: BookEntry): BookEntry {
  if (entry.status !== 'FINAL') throw new Error('Solo se rectifican revisiones finalizadas.')
  return { ...structuredClone(entry), id: crypto.randomUUID(), supersedes: entry.id, revision: entry.revision + 1,
    status: 'DRAFT', correctionReason: '', createdAt: new Date().toISOString(), finalizedAt: null }
}
export function filterEntries(entries: BookEntry[], bookId: string, query: string, from: string, to: string, status = 'ALL') {
  const q = query.trim().toLocaleLowerCase('es')
  return entries.filter(e => e.bookId === bookId && (!from || e.date >= from) && (!to || e.date <= to) &&
    (status === 'ALL' || e.status === status) && (!q || `${e.asset} ${e.location} ${e.technician} ${e.campaign}`.toLocaleLowerCase('es').includes(q)))
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`) || b.revision - a.revision)
}
