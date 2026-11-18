import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bookDefinitions, sourceCatalog } from '../src/features/technicalbooks/bookDefinitions.ts'
import { createEntry, validateEntry, fieldIssue, entryFields, decimal, persistEntry, loadSandbox, sandboxKey, correction, issueCount, filterEntries } from '../src/features/technicalbooks/bookModel.ts'
import { buildBookPdf } from '../src/features/technicalbooks/bookPdf.ts'

const scope = { userId: 'user-prueba', hotelId: 'hotel-prueba' }
const book = id => bookDefinitions.find(b => b.id === id)
const store = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data } }
function filled(b) {
  const e = createEntry(b, scope)
  e.asset = 'EQUIPO-FICTICIO-001'; e.technician = 'Técnico de pruebas'; e.location = 'Ubicación de pruebas'; e.campaign = 'Campaña de ensayo'
  for (const f of b.fields) e.answers[f.id] = { value: f.kind === 'check' ? 'V' : f.kind === 'yesno' ? (f.adverse === 'SI' ? 'NO' : 'SI') : f.kind === 'number' ? '21,5' : f.kind === 'date' ? '2027-06-30' : 'Anotación de ensayo', note: '' }
  return e
}
function pdfSave(name, pdf) { if (!process.env.ARIAS_VALIDATION_DIR) return; mkdirSync(process.env.ARIAS_VALIDATION_DIR, { recursive: true }); writeFileSync(join(process.env.ARIAS_VALIDATION_DIR, name), Buffer.from(pdf.output('arraybuffer'))) }

test('los 16 formularios conservan código, hoja, celda y huella del libro; Piscina y SPA quedan excluidos', () => {
  assert.equal(bookDefinitions.length, 16)
  assert.equal(bookDefinitions.reduce((n, b) => n + b.fields.length, 0), 201)
  assert.equal(new Set(bookDefinitions.map(b => b.id)).size, 16)
  for (const b of bookDefinitions) {
    assert.match(b.sha256, /^[a-f0-9]{64}$/)
    assert.ok(b.workbook.endsWith('.xlsx')); assert.ok(b.sheet)
    assert.ok(!/PISCINA|SPA/.test(b.code)); assert.notEqual(b.code, 'R-SSTT-01-03')
    assert.equal(new Set(b.fields.map(f => f.id)).size, b.fields.length)
    assert.ok(existsSync('public/assets/record-icons-3d/' + b.icon + '.webp'))
    for (const f of b.fields) { assert.match(f.source, /^[A-Z]+\d+$/); assert.ok(f.sourceLabel); assert.ok(f.label); assert.ok(f.section) }
  }
})
test('el plan y el inventario son referencias; no se convierten las cuatro divisiones mensuales en fechas inventadas', () => {
  assert.equal(sourceCatalog.plan.year, '2025')
  assert.equal(sourceCatalog.plan.rows.length, 34); assert.equal(sourceCatalog.assets.rows.length, 311)
  const signs = sourceCatalog.plan.rows.find(row => row.sourceRow === 14)
  assert.equal(signs.equipment, '339')
  assert.equal(sourceCatalog.assets.rows.find(row => row.id === signs.equipment)?.name, 'ELEMENTOS FOTOLUMINISCENTES')
  assert.equal(sourceCatalog.plan.rows.find(row => row.sourceRow === 16).equipment, '9')
  const fan = sourceCatalog.plan.rows.find(r => r.title.includes('01-07'))
  assert.equal(fan.equipment, '340')
  assert.equal(sourceCatalog.assets.rows.find(row => row.id === fan.equipment)?.name, 'FANCOILS DE HABITACIONES')
  assert.equal(sourceCatalog.assets.rows.find(row => row.id === '7')?.name, 'ASCENSOR CLIENTES C')
  assert.deepEqual(fan.schedule, [{ month: 1, slots: [{ slot: 1, action: 'F' }] }])
})
test('Fancoils contiene temperaturas, caudal, tres velocidades de ruido y todos los controles de la ficha', () => {
  const b = book('fancoils')
  assert.equal(b.code, 'R-SSTT-01-07'); assert.equal(b.fields.length, 19)
  for (const r of [7, 8, 11, 19, 20, 21]) assert.equal(b.fields.find(f => f.source === 'A' + r).kind, 'number')
  assert.equal(b.fields.find(f => f.id === 'control-11').unit, undefined)
  assert.ok(b.fields.some(f => f.sourceLabel === 'BANDEJA CONDENSADOS'))
})
test('Legionella respeta las frecuencias del libro y conserva las dos filas de apertura de grifos', () => {
  const b = book('legionella'); const e = filled(b)
  assert.equal(b.fields.length, 25)
  assert.equal(b.fields.find(f => f.source === 'A23').frequency, 'D')
  assert.equal(b.fields.find(f => f.source === 'A20').frequency, 'M')
  assert.equal(b.fields.filter(f => f.sourceLabel.includes('ABRIR GRIFOS')).length, 2)
  e.frequency = 'D'
  assert.ok(entryFields(b, e).every(f => f.frequency === 'D'))
  assert.deepEqual(validateEntry(b, e, true), [])
  const storage = store(); const result = persistEntry(storage, scope, b, e, true, null)
  assert.ok(Object.keys(result.entry.answers).every(id => entryFields(b, e).some(f => f.id === id)))
})
test('ningún control empieza aprobado y un borrador incompleto no se puede finalizar', () => {
  for (const b of bookDefinitions) {
    const e = createEntry(b, scope)
    assert.deepEqual(e.answers, {})
    e.asset = 'FICTICIO'; e.technician = 'Prueba'
    assert.deepEqual(validateEntry(b, e, false), [])
    assert.ok(validateEntry(b, e, true).length)
  }
})
test('todos los libros permiten guardar, recargar y finalizar una revisión válida en el almacén aislado', () => {
  const storage = store()
  for (const b of bookDefinitions) {
    const e = filled(b); const draft = persistEntry(storage, scope, b, e, false, null).entry
    assert.equal(loadSandbox(storage, scope).find(r => r.id === e.id).status, 'DRAFT')
    const final = persistEntry(storage, scope, b, draft, true, draft).entry
    assert.equal(final.status, 'FINAL'); assert.ok(final.finalizedAt)
    assert.deepEqual(final.template, b)
  }
  assert.equal(loadSandbox(storage, scope).length, 16)
})
test('las averías se registran sin impedir finalizar; se exige detalle y no se confunden con revisión pendiente', () => {
  const b = book('fancoils'), e = filled(b), storage = store()
  e.answers['control-5'] = { value: 'X', note: '' }
  assert.ok(validateEntry(b, e, true).some(s => s.includes('ESTADO FILTRO')))
  e.answers['control-5'].note = 'Filtro deteriorado, sustituir'
  const result = persistEntry(storage, scope, b, e, true, null).entry
  assert.equal(result.status, 'FINAL'); assert.equal(issueCount(b, result), 1)
})
test('No aplica necesita motivo; mediciones finitas, coma decimal, temperaturas negativas y fechas válidas', () => {
  assert.equal(decimal('21,5'), 21.5); assert.equal(decimal('-12.5'), -12.5)
  for (const n of ['', 'Infinity', 'NaN', '1e5', '20 grados', '1,2.3']) assert.equal(decimal(n), null)
  const b = book('fancoils'); const f = b.fields[0]
  assert.ok(fieldIssue(f, { value: 'NA', note: '' }, true)); assert.equal(fieldIssue(f, { value: 'NA', note: 'No instalado' }, true), '')
  assert.ok(fieldIssue(book('fotoluminiscentes').fields.find(f => f.kind === 'date'), { value: '2026-02-30', note: '' }, true))
  assert.ok(fieldIssue(b.fields.find(f => f.id === 'control-19'), { value: '-1', note: '' }, true))
})
test('rectificar conserva el original, exige motivo, aumenta revisión y rechaza otra rectificación paralela', () => {
  const storage = store(), b = book('fancoils')
  const original = persistEntry(storage, scope, b, filled(b), true, null).entry
  assert.throws(() => persistEntry(storage, scope, b, original, false, original), /se conserva/)
  const fix = correction(original)
  assert.throws(() => persistEntry(storage, scope, b, fix, true, null), /motivo/)
  fix.correctionReason = 'Corrección de lectura anotada'; fix.answers['control-7'].value = '22'
  const corrected = persistEntry(storage, scope, b, fix, true, null).entry
  assert.equal(corrected.revision, 2); assert.equal(corrected.supersedes, original.id)
  const rows = loadSandbox(storage, scope)
  assert.equal(rows.length, 2); assert.deepEqual(rows.find(r => r.id === original.id), original)
  const concurrent = correction(original); concurrent.correctionReason = 'Otro intento'
  assert.throws(() => persistEntry(storage, scope, b, concurrent, true, null), /rectificación/)
})
test('aislamiento por usuario y hotel, detección de datos corruptos, fallo de almacenamiento y edición concurrente', () => {
  const storage = store(), b = book('fancoils'), e = filled(b)
  const saved = persistEntry(storage, scope, b, e, false, null).entry
  assert.deepEqual(loadSandbox(storage, { ...scope, hotelId: 'otro-hotel' }), [])
  assert.deepEqual(loadSandbox(storage, { ...scope, userId: 'otro-usuario' }), [])
  assert.notEqual(sandboxKey({ userId: 'a:b', hotelId: 'c' }), sandboxKey({ userId: 'a', hotelId: 'b:c' }))
  assert.throws(() => persistEntry(storage, { ...scope, hotelId: 'otro-hotel' }, b, saved, true, saved), /otro hotel/)
  const edited = structuredClone(saved); edited.observations = 'Primera edición'
  persistEntry(storage, scope, b, edited, false, saved)
  assert.throws(() => persistEntry(storage, scope, b, saved, true, saved), /otra ventana/)
  const errorStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
  assert.throws(() => persistEntry(errorStorage, scope, b, e, false, null), /Quota/)
  const corrupt = store(); corrupt.setItem(sandboxKey(scope), '{invalid')
  assert.throws(() => loadSandbox(corrupt, scope)); assert.equal(corrupt.getItem(sandboxKey(scope)), '{invalid')
})
test('puertas exige evidencia cuando hay obstáculos y rechaza imágenes SVG o de tamaño excesivo', () => {
  const b = book('puertas-cortafuegos'), e = filled(b)
  e.answers['control-G'] = { value: 'X', note: 'Obstáculo encontrado' }
  assert.ok(validateEntry(b, e, true).some(s => s.includes('foto')))
  e.evidence = [{ name: 'foto.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }]
  assert.ok(!validateEntry(b, e, true).some(s => s.includes('foto')))
  e.evidence = [{ name: 'vector.svg', dataUrl: 'data:image/svg+xml;base64,AAAA' }]
  assert.ok(validateEntry(b, e, true).some(s => s.includes('imágenes')))
})
test('los filtros no mezclan libros, fechas, técnicos ni estados', () => {
  const a = filled(book('fancoils')), b = filled(book('bombas'))
  a.date = '2026-11-16'; a.status = 'FINAL'; b.date = '2026-11-15'
  assert.equal(filterEntries([a, b], 'fancoils', 'PRUEBAS', '2026-11-01', '2026-11-30', 'FINAL').length, 1)
  assert.equal(filterEntries([a, b], 'fancoils', '', '2026-11-17', '', 'ALL').length, 0)
})
test('PDF de cada libro conserva controles y todas las páginas están identificadas como prueba', () => {
  for (const b of bookDefinitions) {
    const e = filled(b); const pdf = buildBookPdf(b, [e], 'Hotel ficticio')
    assert.ok(pdf.getNumberOfPages() >= 1)
    const content = pdf.output()
    assert.equal((content.match(/DOCUMENTO DE PRUEBA/g) ?? []).length, pdf.getNumberOfPages())
    assert.ok(content.includes('EQUIPO-FICTICIO-001'))
    assert.doesNotMatch(content, /Excel|\.xlsx|SHA-256|Libro fuente/i)
    assert.ok(!content.includes(b.sheet + '!' + b.fields[0].source))
    pdfSave('book-' + b.id + '.pdf', pdf)
  }
})
test('PDF largo y listado de varias revisiones mantiene observaciones finales, versiones y pies', () => {
  const b = book('fancoils'), e = filled(b)
  e.observations = Array.from({ length: 240 }, (_, i) => `Observación de prueba ${i}: texto extenso para verificar paginación.`).join('\n') + '\nFINAL_NOTAS_FANCOIL'
  e.answers['control-5'].note = 'ANOTACION_FILTRO_FANCOIL'
  const next = correction({ ...e, status: 'FINAL' }); next.correctionReason = 'CORRECCION_LECTURA'
  const pdf = buildBookPdf(b, [e, next], 'Hotel ficticio')
  assert.ok(pdf.getNumberOfPages() > 5)
  assert.equal((pdf.output().match(/FINAL_NOTAS_FANCOIL/g) ?? []).length, 2)
  assert.ok(pdf.output().includes('CORRECCION_LECTURA'))
  assert.equal((pdf.output().match(/Arias Suite/g) ?? []).length, pdf.getNumberOfPages())
  pdfSave('book-long.pdf', pdf)
})
test('la validación y los PDF no realizan operaciones de red', () => {
  for (const path of ['bookModel.ts', 'bookPdf.ts', 'ReferenceCatalog.tsx']) {
    const text = readFileSync('src/features/technicalbooks/' + path, 'utf8')
    assert.equal(/supabase|\.rpc\(|fetch\(|XMLHttpRequest/.test(text), false, path)
  }
})
