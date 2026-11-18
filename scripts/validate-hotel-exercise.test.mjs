import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('El ejercicio mantiene el hotel parado hasta el arranque autorizado y conserva la periodicidad', async () => {
 const db = new PGlite()
 const hotel='9e2e3d56-25d7-41a5-8dd6-df6858e735bd', user='20b5da58-38b9-49af-88b2-9d9bfdfc3a84'
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key); create table public.hotels(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.has_suite_access() returns boolean language sql stable as $$ select true $$;
   create function public.has_hotel_access(uuid) returns boolean language sql stable as $$ select true $$;
   create table maintenance_hotel_config(hotel_id uuid primary key,ot_generation_mode text);
   create table maintenance_plans(id int primary key,hotel_id uuid,active boolean,next_due_date date,start_date date,periodicity_unit text,periodicity_value integer,updated_at timestamptz);
   create table maintenance_work_orders(hotel_id uuid,generation_mode text,scheduled_date date);
   insert into hotels values('${hotel}'); insert into auth.users values('${user}');
   insert into maintenance_hotel_config values('${hotel}','AUTO');
   insert into maintenance_plans values(1,'${hotel}',true,null,timezone('Europe/Madrid',now())::date-30,'DAY',1,null),
   (2,'${hotel}',true,timezone('Europe/Madrid',now())::date+2,null,'MONTH',3,null);`)
  await db.exec(fs.readFileSync('supabase/migrations/20261118030500_hotel_exercise_start.sql','utf8'))
  const auto = "insert into maintenance_work_orders values($1,'AUTO',timezone('Europe/Madrid',now())::date+$2::integer) returning hotel_id"
  assert.equal((await db.query(auto,[hotel,0])).rows.length,0)
  await assert.rejects(db.exec("update maintenance_hotel_config set ot_generation_mode='AUTO'"), /pendiente/)
  await db.exec('set role authenticated')
  const start=()=>db.query('select start_hotel_exercise($1)',[hotel])
  await assert.rejects(start(),/permiso/)
  await db.exec("set request.jwt.claim.sub='6d755017-7348-41ea-aad7-d1b8334fff99'")
  await assert.rejects(start(),/permiso/)
  await assert.rejects(db.exec("update maintenance_exercise_start set started_at=now()"),/permission denied/)
  await db.exec(`set request.jwt.claim.sub='${user}'`)
  await start()
  await assert.rejects(start(),/ya está iniciado/)
  await db.exec('reset role')
  assert.equal((await db.query('select ot_generation_mode from maintenance_hotel_config')).rows[0].ot_generation_mode,'AUTO')
  assert.deepEqual((await db.query("select next_due_date-timezone('Europe/Madrid',now())::date days from maintenance_plans order by id")).rows.map(r=>r.days),[0,2])
  assert.equal((await db.query(auto,[hotel,-1])).rows.length,0)
  assert.equal((await db.query(auto,[hotel,0])).rows.length,1)
 } finally { await db.close() }
})
