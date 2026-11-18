import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { bookDefinitions } from '../src/features/technicalbooks/bookDefinitions.ts'
import { createEntry, correction } from '../src/features/technicalbooks/bookModel.ts'
import { bookPeriods } from '../src/features/technicalbooks/bookSchedule.ts'
import { waterBook, encodeSample, decodeSample } from '../src/features/waterquality/waterBooks.ts'
import { buildBookPdf } from '../src/features/technicalbooks/bookPdf.ts'
import { validateEntry } from '../src/features/technicalbooks/bookModel.ts'
const db = new PGlite()
const hotel = '10000000-0000-4000-8000-000000000001', user = '20000000-0000-4000-8000-000000000001'
await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key); create table public.hotels(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.has_suite_access() returns boolean language sql stable as $$select auth.uid() is not null$$;
 create function public.has_hotel_permission(h uuid,p text) returns boolean language sql stable as $$select h='${hotel}'::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 insert into hotels values('${hotel}'); insert into auth.users values('${user}');
 create table public.maintenance_plans(id uuid primary key,active boolean,next_due_date date,periodicity_unit text);
 create table public.maintenance_executions(id uuid default gen_random_uuid(),maintenance_plan_id uuid,executed_at timestamptz,result text);
 create table public.maintenance_work_orders(id uuid default gen_random_uuid(),work_type text,status text,scheduled_date date);
 grant select,insert,update on public.maintenance_plans,public.maintenance_executions,public.maintenance_work_orders to authenticated;`)
await db.exec(fs.readFileSync('supabase/migrations/20261117093753_technical_book_records.sql', 'utf8'))
const originalValidator = (await db.query("select prosrc from pg_proc where oid='public.validate_technical_book_record()'::regprocedure")).rows[0].prosrc
await db.exec(fs.readFileSync('supabase/migrations/20261117224212_preventive_due_access.sql', 'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20261118001000_water_book_templates.sql', 'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20261118062000_book_catalog_due_identity.sql', 'utf8'))
await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}';`)
const dates = (await db.query("select timezone('Europe/Madrid',now())::date::text today, (timezone('Europe/Madrid',now())::date-1)::text yesterday, (timezone('Europe/Madrid',now())::date+1)::text tomorrow")).rows[0]
const legionella = bookDefinitions.find(b => b.id === 'legionella')
function entry(book, frequency = 'ALL', day = dates.today) {
 const e = { ...createEntry(book, { hotelId: hotel, userId: user }), asset: 'Equipo 1', technician: 'Técnico simulado', status: 'FINAL', frequency, date: day }
 e.controlIds = book.fields.filter(f => !f.frequency || frequency === 'ALL' || f.frequency === frequency).map(f => f.id)
 for (const f of book.fields.filter(f => e.controlIds.includes(f.id))) e.answers[f.id] = { value: f.kind === 'check' ? 'V' : f.kind === 'yesno' ? 'NO' : f.kind === 'number' ? '22' : 'Dato', note: 'Control simulado' }
 return e
}
const insert = e => db.query('insert into technical_book_records(id,hotel_id,book_id,definition_hash,payload) values($1,$2,$3,$4,$5) returning payload', [e.id, e.hotelId, e.bookId, e.definitionHash, JSON.stringify(e)])
const weekly = entry(legionella, 'S', dates.yesterday)
await insert(weekly)
await assert.rejects(() => insert(entry(legionella, 'S')), /Todavía no toca/)
await assert.rejects(() => insert({ ...entry(legionella, 'S'), asset: 'Otra etiqueta' }), /Todavía no toca/)
const daily = entry(legionella, 'D'); await insert(daily)
await assert.rejects(() => insert(entry(legionella, 'D')), /Todavía no toca/)
await insert(entry(legionella, 'M'))
await insert(entry(legionella, 'V')); await insert(entry(legionella, 'V'))
await assert.rejects(() => insert(entry(legionella, 'V', dates.tomorrow)), /futura/)
await assert.rejects(() => insert({ ...entry(legionella, 'V'), controlIds: [] }), /control pendiente/)
await assert.rejects(() => insert({ ...entry(legionella, 'V'), controlIds: ['inexistente'] }), /no válidos/)
const rectification = { ...correction(weekly), status: 'FINAL', correctionReason: 'Corregir observación' }
await insert(rectification)
await assert.rejects(() => insert({ ...correction(daily), status: 'FINAL', date: dates.yesterday, correctionReason: 'Mover fecha' }), /conservar/)
assert.equal((await db.query("update technical_book_records set payload=jsonb_set(payload,'{observations}','\"Cambiar\"') where id=$1 returning id", [weekly.id])).rows.length, 0)
const pump = bookDefinitions.find(b => b.id === 'bombas')
await insert(entry(pump))
await assert.rejects(() => insert({ ...entry(pump), asset: ' EQUIPO   1 ' }), /Todavía no toca/)
await insert({ ...entry(pump), asset: 'Equipo 2' })
// Verifica que servidor y cliente utilizan los mismos intervalos para todos los libros con frecuencia fija.
for (const [book, p] of Object.entries(bookPeriods)) {
 const { rows } = await db.query("select ('2026-01-01'::date + public.technical_book_period($1,null))::date::text as due_day", [book])
 assert.equal(rows[0].due_day, p.unit === 'YEAR' ? '2027-01-01' : p.value === 6 ? '2026-07-01' : '2026-04-01')
}
const plan = '30000000-0000-4000-8000-000000000001'
await db.query('insert into maintenance_plans values($1,true,$2,\'WEEK\')', [plan, dates.tomorrow])
const exec = () => db.query("insert into maintenance_executions(maintenance_plan_id,executed_at,result) values($1,now(),'COMPLETED')", [plan])
await assert.rejects(exec, /Todavía no toca/)
await db.query('update maintenance_plans set next_due_date=$2 where id=$1', [plan, dates.today]); await exec()
await db.query('update maintenance_plans set next_due_date=null where id=$1', [plan]); await assert.rejects(exec, /Pendiente de programar/)
await db.query("update maintenance_plans set periodicity_unit='VARIABLE' where id=$1", [plan]); await exec()
await db.query('update maintenance_plans set active=false where id=$1', [plan]); await assert.rejects(exec, /desactivado/)
const order = (await db.query("insert into maintenance_work_orders(work_type,status,scheduled_date) values('PREVENTIVE','PENDING',$1) returning id", [dates.tomorrow])).rows[0].id
await assert.rejects(() => db.query("insert into maintenance_work_orders(work_type,status,scheduled_date) values('PREVENTIVE','COMPLETED',$1)", [dates.tomorrow]), /Todavía no toca/)
await assert.rejects(() => db.query("update maintenance_work_orders set status='COMPLETED' where id=$1", [order]), /Todavía no toca/)
await db.query("update maintenance_work_orders set work_type='CORRECTIVE',status='COMPLETED' where id=$1", [order])
for (const type of ['pool', 'spa']) {
  const book = waterBook(type)
  const sample = { date: dates.today, time: '08:00', temperature: '25', technician: 'Técnico',
    freeChlorine: '1', combinedChlorine: '0.2', totalChlorine: '1.20', bromine: '3', ph: '7.4',
    transparency: true, turbidity: '0.5', filteredWater: '400', filtersCleaned: false,
    notes: 'Control diario', disinfectant: type === 'pool' ? 'CHLORINE' : 'BROMINE' }
  const first = encodeSample(entry(book), sample)
  const stored = (await insert(first)).rows[0].payload
  assert.deepEqual(validateEntry(book, stored, true), [])
  assert.equal(decodeSample(stored).disinfectant, sample.disinfectant)
  assert.equal(decodeSample(stored).filtersCleaned, false)
  await insert(encodeSample(entry(book), { ...sample, time: '15:00' }))
  const fixed = { ...correction(stored), status: 'FINAL', correctionReason: 'Revisada lectura' }
  fixed.answers.ph.value = '7.5'
  await insert(fixed)
  assert.equal((await db.query('select payload from technical_book_records where id=$1', [first.id])).rows[0].payload.answers.ph.value, '7.4')
  assert.ok(buildBookPdf(book, [stored, fixed], 'Hotel de ensayo', true).getNumberOfPages() >= 2)
}
await db.exec('reset role')
await db.exec(fs.readFileSync('supabase/rollback/20261117224212_preventive_due_access.sql', 'utf8'))
assert.equal((await db.query("select prosrc from pg_proc where oid='public.validate_technical_book_record()'::regprocedure")).rows[0].prosrc, originalValidator)
assert.equal((await db.query("select count(*)::int as n from technical_book_records where book_id in ('pool','spa')")).rows[0].n, 6)
await db.close()
console.log('Validación SQL local: periodicidades, duplicados, fichas parciales, rectificaciones, equipos y acceso PAM/tickets correctos.')
