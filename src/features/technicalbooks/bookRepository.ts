import { supabase } from '../../lib/supabase'
import { assertDemoWriteAllowed } from '../../core/access/demoReadOnly'
import { entryFields, validateEntry } from './bookModel'
import type { Scope } from './bookModel'
import type { BookDefinition, BookEntry } from './types'

type Row = { payload: BookEntry; version: number }
export async function loadBookRecords(hotelId: string, bookId: string): Promise<BookEntry[]> {
  const records: BookEntry[] = []
  // PostgREST limits each response; page explicitly so the history is never silently truncated.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('technical_book_records').select('payload,version')
      .eq('hotel_id', hotelId).eq('book_id', bookId).order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
    if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`)
    const rows = data as Row[]
    records.push(...rows.map(row => ({ ...row.payload, serverVersion: row.version })))
    if (rows.length < 500) return records
  }
}
export async function saveBookRecord(scope: Scope, book: BookDefinition, input: BookEntry, finalize: boolean, expected: BookEntry | null): Promise<BookEntry> {
  assertDemoWriteAllowed(scope.userId)
  if (input.hotelId !== scope.hotelId) throw new Error('El registro pertenece a otro hotel.')
  const issues = validateEntry(book, input, finalize)
  if (issues.length) throw new Error(issues.join('\n'))
  const allowed = new Set(entryFields(book, input).map(field => field.id))
  const { serverVersion: _version, ...payload } = structuredClone(input)
  void _version
  payload.answers = Object.fromEntries(Object.entries(payload.answers).filter(([id]) => allowed.has(id)))
  payload.status = finalize ? 'FINAL' : 'DRAFT'
  const row = { id: input.id, hotel_id: scope.hotelId, book_id: book.id, definition_hash: book.sha256, payload }
  const result = expected
    ? await supabase.from('technical_book_records').update(row).eq('id', input.id).eq('hotel_id', scope.hotelId)
      .eq('version', expected.serverVersion ?? -1).select('payload,version').maybeSingle()
    : await supabase.from('technical_book_records').insert(row).select('payload,version').single()
  if (result.error) throw new Error(`No se pudo guardar: ${result.error.message}`)
  if (!result.data) throw new Error('El registro cambió en otra ventana o no tienes permiso. Recarga el historial antes de guardar.')
  const saved = result.data as Row
  return { ...saved.payload, serverVersion: saved.version }
}
