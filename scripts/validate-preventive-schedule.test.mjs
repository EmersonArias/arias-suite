import test from 'node:test'
import assert from 'node:assert/strict'
import { addPeriod, hotelDay, planAccess } from '../src/shared/maintenance/preventiveSchedule.ts'
import { controlSchedule } from '../src/features/technicalbooks/bookSchedule.ts'
import { bookDefinitions } from '../src/features/technicalbooks/bookDefinitions.ts'
import { createEntry, entryFields } from '../src/features/technicalbooks/bookModel.ts'
const scope = { hotelId: 'hotel-1', userId: 'tecnico-1' }
const book = bookDefinitions.find(b => b.id === 'legionella')
const entry = () => ({ ...createEntry(book, scope), date: '2026-11-17', asset: 'Instalación del hotel' })

test('calendario de Barcelona y suma de días/meses/años, incluidos DST y fin de mes', () => {
  assert.equal(hotelDay(new Date('2026-11-17T23:30:00Z')), '2026-11-18')
  assert.equal(addPeriod('2026-10-24', { value: 1, unit: 'WEEK' }), '2026-10-31')
  assert.equal(addPeriod('2026-01-31', { value: 1, unit: 'MONTH' }), '2026-02-28')
  assert.equal(addPeriod('2024-02-29', { value: 1, unit: 'YEAR' }), '2025-02-28')
})
test('semanal de ayer bloqueada hasta siete días después; diarios y mensuales independientes', () => {
  const done = { ...entry(), status: 'FINAL', id: 'anterior', date: '2026-11-16', answers: { 'activity-19': { value: 'V', note: '' } } }
  let schedule = controlSchedule(book, entry(), [done], '2026-11-17')
  assert.equal(schedule.find(s => s.field.id === 'activity-19').due, false)
  assert.equal(schedule.find(s => s.field.id === 'activity-19').nextDue, '2026-11-23')
  assert.equal(schedule.find(s => s.field.id === 'activity-8').due, true)
  assert.equal(schedule.find(s => s.field.id === 'activity-20').due, true)
  schedule = controlSchedule(book, { ...entry(), date: '2026-11-23' }, [done], '2026-11-23')
  assert.equal(schedule.find(s => s.field.id === 'activity-19').due, true)
})
test('borrador, otro hotel, no aplica y rectificación no cuentan como nueva ejecución', () => {
  for (const overrides of [{ status: 'DRAFT' }, { hotelId: 'otro' }, { supersedes: 'original' }, { answers: { 'activity-19': { value: 'NA', note: 'No existe' } } }]) {
    const record = { ...entry(), id: 'otro', status: 'FINAL', date: '2026-11-16', answers: { 'activity-19': { value: 'V', note: '' } }, ...overrides }
    assert.equal(controlSchedule(book, entry(), [record], '2026-11-17').find(s => s.field.id === 'activity-19').due, true)
  }
})
test('el bloqueo de un equipo no bloquea otro; normaliza espacios y mayúsculas', () => {
  const pump = bookDefinitions.find(b => b.id === 'bombas')
  const current = { ...createEntry(pump, scope), date: '2026-11-17', asset: 'BOMBA  1' }
  const done = { ...current, id: 'done', status: 'FINAL', asset: ' bomba 1 ', answers: { body: { value: 'V', note: '' } } }
  assert.equal(controlSchedule(pump, current, [done], '2026-11-17').find(s => s.field.id === 'body').due, false)
  assert.equal(controlSchedule(pump, { ...current, asset: 'Bomba 2' }, [done], '2026-11-17').find(s => s.field.id === 'body').due, true)
})
test('PAM sin fecha requiere programar; pendientes y vencidos siguen habilitados', () => {
  const plan = { active: true, next_due_date: '2026-11-18', periodicity_unit: 'WEEK' }
  assert.equal(planAccess(plan, '2026-11-17').allowed, false)
  assert.equal(planAccess(plan, '2026-11-18').allowed, true)
  assert.equal(planAccess(plan, '2026-11-19').allowed, true)
  assert.equal(planAccess({ ...plan, next_due_date: null }).allowed, false)
  assert.equal(planAccess({ ...plan, active: false }).allowed, false)
  assert.equal(planAccess({ ...plan, next_due_date: null, periodicity_unit: 'VARIABLE' }).allowed, true)
})
test('los controles seleccionados quedan en la ficha/PDF históricos aunque cambie el vencimiento', () => {
  const stored = { ...entry(), controlIds: ['activity-8'], answers: { 'activity-8': { value: '72', note: '' } } }
  assert.deepEqual(entryFields(book, stored).map(f => f.id), ['activity-8'])
})
