import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateMaterialDraft } from '../src/features/materials/materialRequestValidation.ts'
import { buildMaterialRequestPdf } from '../src/features/materials/materialRequestPdf.ts'
import { minutesInShift, plannedMinutes, vacationStage, vacationOriginYear, vacationCode,
  weekendHistory, isoWeek, staffReportDaysForOperator, matchesStaffState } from '../src/features/staff/staffModel.ts'

const materials = [{ id: 'a' }, { id: 'b' }]
const line = (id = 'a', quantity = '1') => ({ key: id || 'empty', material_id: id, query: id ? 'Material ficticio' : '', quantity })
const day = (patch = {}) => ({ id: 'test', hotel_id: 'test-hotel', operator_id: 'op-a', work_date: '2026-11-14', state: 'SHIFT',
  start_time: '09:00', end_time: '19:00', planned_minutes: 600, actual_minutes: null, actual_confirmed: false,
  justification: 'PENDING', source_kind: 'MANUAL', source_code: null, vacation_origin_year: null,
  vacation_taken_confirmed: false, vacation_confirmed_at: null, vacation_confirmed_by: null, ...patch })

test('petición: dos artículos y una línea vacía no bloquean el guardado', () => {
  const result = validateMaterialDraft([line('a', '2'), line('b'), line('')], materials)
  assert.equal(result.error, ''); assert.equal(result.lines.length, 2)
})
test('petición: no permite una solicitud vacía', () => {
  assert.notEqual(validateMaterialDraft([line('')], materials).error, '')
})
test('petición: no ignora artículos escritos sin seleccionar ni cantidades huérfanas', () => {
  for (const item of [{ ...line(''), query: 'No seleccionado' }, line('', '2'), line('desconocido')])
    assert.notEqual(validateMaterialDraft([line('a'), item], materials).error, '')
})
test('petición: rechaza cero, negativos, cantidades no numéricas y precisión excesiva', () => {
  for (const quantity of ['0', '-1', '', 'NaN', 'Infinity', '1.001', '10000000000'])
    assert.notEqual(validateMaterialDraft([line('a', quantity)], materials).error, '', quantity)
})
test('petición: admite cantidades decimales válidas sin errores de coma flotante', () => {
  for (const quantity of ['0.01', '1.10', '1.23', '9999999999.99'])
    assert.equal(validateMaterialDraft([line('a', quantity)], materials).error, '', quantity)
})
test('horarios: turno partido equivale a 8 horas, también con segundos', () => {
  assert.equal(minutesInShift('09:00', '19:00'), 480)
  assert.equal(minutesInShift('09:00:00', '19:00:00'), 480)
})
test('horarios: turnos continuos y nocturnos', () => {
  assert.equal(minutesInShift('08:00', '16:00'), 480)
  assert.equal(minutesInShift('22:00', '06:00'), 480)
  assert.equal(minutesInShift('08:00', '08:00'), 0)
})
test('horas previstas: recalcula el turno sin confundir fichajes ni descansos', () => {
  assert.equal(plannedMinutes(day({ actual_minutes: 720, actual_confirmed: true })), 480)
  assert.equal(plannedMinutes(day({ state: 'REST' })), 0)
})
test('vacaciones: pasado sin confirmar no equivale a disfrutadas', () => {
  const value = day({ state: 'VACATION', work_date: '2026-08-01' })
  assert.equal(vacationStage(value, '2026-11-15'), 'UNVERIFIED')
  assert.equal(vacationStage({ ...value, vacation_taken_confirmed: true }, '2026-11-15'), 'TAKEN')
  assert.equal(vacationStage({ ...value, work_date: '2026-12-01' }, '2026-11-15'), 'UPCOMING')
})
test('vacaciones: respeta el año de origen y no inventa uno cuando falta', () => {
  assert.equal(vacationOriginYear(day({ state: 'VACATION_PREVIOUS' })), null)
  assert.equal(vacationCode(day({ state: 'VACATION_PREVIOUS', vacation_origin_year: 2025, vacation_taken_confirmed: true }), '2026-11-15'), 'A25')
})
test('fines de semana: cuenta semanas completas y mantiene la confirmación independiente', () => {
  const map = weekendHistory([
    day(), day({ work_date: '2026-11-15', actual_confirmed: true }),
    day({ work_date: '2026-11-21', actual_confirmed: true }), day({ work_date: '2026-11-22', state: 'REST' }),
  ], 2026).get('op-a')
  assert.equal(map.size, 2); assert.equal(map.get('2026-11-09').saturday, true)
  assert.equal(map.get('2026-11-09').sunday, true); assert.equal(map.get('2026-11-09').confirmed, false)
})
test('calendario: semanas ISO al cambiar de año', () => {
  assert.equal(isoWeek('2020-12-31'), 53); assert.equal(isoWeek('2021-01-01'), 53); assert.equal(isoWeek('2021-01-04'), 1)
})
test('informe: el filtro de vacaciones no suma turnos ocultos de otro trabajador el mismo día', () => {
  const rows = [day({ state: 'VACATION' }), day({ operator_id: 'op-b' }), day({ state: 'VACATION_PREVIOUS', work_date: '2026-11-15' })]
  assert.equal(staffReportDaysForOperator(rows, 'op-b', 'VACATION').length, 0)
  assert.equal(staffReportDaysForOperator(rows, 'op-a', 'VACATION').length, 2)
  assert.equal(matchesStaffState('VACATION_PREVIOUS', 'VACATION'), true)
  assert.equal(staffReportDaysForOperator(rows, 'op-b', 'ALL').length, 1)
})

const request = { request_number: 'PRUEBA-001', department: 'MANTENIMIENTO', cause: 'Reposición de material',
  requester_name: 'Técnico de pruebas', confirmed_at: '2026-11-15', notes: 'Material necesario para una reparación.' }
const pdfLine = { quantity: 2, unit_of_measure: 'ud', description: 'Material ficticio de mantenimiento',
  order_code: 'TEST-01', reference_code: null, provider_name: 'Proveedor de pruebas', purchase_url: 'https://example.com/material' }
const directory = process.env.ARIAS_VALIDATION_DIR
function save(name, pdf) {
  if (!directory) return
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, name), Buffer.from(pdf.output('arraybuffer')))
}
test('PDF: petición corta en una hoja y sin fecha de entrega', () => {
  const pdf = buildMaterialRequestPdf(request, [pdfLine], 'Hotel de pruebas')
  assert.equal(pdf.getNumberOfPages(), 1)
  assert.equal(pdf.output().includes('FECHA ENTREGA'), false)
  save('request-short.pdf', pdf)
})
test('PDF: tablas extensas y observaciones largas se paginan con el texto final y pies en todas las páginas', () => {
  const pdf = buildMaterialRequestPdf({ ...request, notes: Array.from({ length: 120 }, (_, i) =>
    'Observación ' + i + ': comprobar el suministro del material solicitado.').join('\n') + '\nFIN_NOTAS_PRUEBA' },
  Array.from({ length: 35 }, (_, i) => ({ ...pdfLine, description: 'Material ficticio ' + (i + 1) })), 'Hotel de pruebas')
  assert.ok(pdf.getNumberOfPages() > 2)
  assert.ok(pdf.output().includes('FIN_NOTAS_PRUEBA'))
  assert.equal((pdf.output().match(/Arias Suite/g) ?? []).length, pdf.getNumberOfPages())
  save('request-long.pdf', pdf)
})
