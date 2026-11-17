import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bookDefinitions} from '../src/features/technicalbooks/bookDefinitions.ts';
import {createEntry} from '../src/features/technicalbooks/bookModel.ts';
const db=new PGlite();
const hotel='10000000-0000-4000-8000-000000000001', otherHotel='10000000-0000-4000-8000-000000000002', user='20000000-0000-4000-8000-000000000001', demo='6d755017-7348-41ea-aad7-d1b8334fff99';
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create table public.hotels(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function public.has_suite_access() returns boolean language sql stable as $$select auth.uid() is not null$$; create function public.has_hotel_permission(h uuid,p text) returns boolean language sql stable as $$select h='${hotel}'::uuid and (p='maintenance.view' or auth.uid()<>'${demo}'::uuid)$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into public.hotels values('${hotel}'),('${otherHotel}'); insert into auth.users values('${user}'),('${demo}');`);
const migration=fs.readFileSync('supabase/migrations/20261117093753_technical_book_records.sql','utf8');
await db.exec(migration);
await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}';`);
async function insert(entry){return db.query('insert into public.technical_book_records(id,hotel_id,book_id,definition_hash,payload) values($1,$2,$3,$4,$5) returning *',[entry.id,entry.hotelId,entry.bookId,entry.definitionHash,JSON.stringify(entry)]);}
let tests=0;
for(const b of bookDefinitions){
 const e=createEntry(b,{hotelId:hotel,userId:user});e.asset='Equipo simulado';e.technician='Técnico';
 const r=await insert(e); assert.equal(r.rows[0].version,1);tests++;
 await assert.rejects(()=>db.query("update public.technical_book_records set payload=jsonb_set(payload,'{status}','\"FINAL\"') where id=$1",[e.id]));tests++;
 for(const f of b.fields)e.answers[f.id]={value:f.kind==='number'?'22':f.kind==='check'?'V':f.kind==='yesno'?'SI':f.kind==='date'?'2026-11-17':'Dato',note:'Revisión simulada'};
 e.status='FINAL';
 const updated=await db.query('update public.technical_book_records set payload=$2 where id=$1 returning *',[e.id,JSON.stringify(e)]);
 assert.equal(updated.rows[0].version,2);assert.equal(updated.rows[0].payload.userId,user);tests++;
 assert.equal((await db.query("update public.technical_book_records set version=999 where id=$1 returning id",[e.id])).rows.length,0);tests++;
 await assert.rejects(()=>db.query('delete from public.technical_book_records where id=$1',[e.id]));tests++;
 const correction={...e,id:crypto.randomUUID(),status:'DRAFT',revision:2,supersedes:e.id,correctionReason:'Corrección simulada'};
 await insert(correction);tests++;
 await assert.rejects(()=>insert({...correction,id:crypto.randomUUID()}));tests++;
}
await db.exec(`set request.jwt.claim.sub='${demo}';`);
assert.equal((await db.query('select count(*)::int n from public.technical_book_records')).rows[0].n,bookDefinitions.length*2);tests++;
let e=createEntry(bookDefinitions[0],{hotelId:hotel,userId:demo});e.asset='Prueba';e.technician='Prueba';
await assert.rejects(()=>insert(e));tests++;
assert.equal((await db.query("update public.technical_book_records set version=999 returning id")).rows.length,0);tests++;
await db.exec(`set request.jwt.claim.sub='${user}';`);
await assert.rejects(()=>insert({...e,id:crypto.randomUUID(),hotelId:otherHotel,userId:user}));tests++;
await db.exec('reset role;');
const dump=await db.dumpDataDir(); await db.close();
const restored=new PGlite({loadDataDir:dump}); await restored.waitReady;
assert.equal((await restored.query('select count(*)::int n from public.technical_book_records')).rows[0].n,bookDefinitions.length*2);tests++;
await restored.close();console.log(`${tests} database assertions passed; all ${bookDefinitions.length} templates, immutable finals, corrections, demo read-only, hotel isolation and restore.`);
