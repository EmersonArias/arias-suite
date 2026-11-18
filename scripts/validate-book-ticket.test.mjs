import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createEntry } from '../src/features/technicalbooks/bookModel.ts'
import { waterBook, encodeSample } from '../src/features/waterquality/waterBooks.ts'
import { resolveChlorine } from '../src/features/waterquality/chlorine.ts'
const read = name => fs.readFileSync('supabase/migrations/' + name + '.sql','utf8')

test('Las tres parejas de cloro conservan las medidas y calculan el tercer valor', () => {
 for (const key of ['freeChlorine','combinedChlorine','totalChlorine']) {
   const raw={freeChlorine:'1.20',combinedChlorine:'0.30',totalChlorine:'1.50'}
   const expected=raw[key]; raw[key]=''
   const got=resolveChlorine(raw)
   assert.equal(got.calculated,key);assert.equal(got.values[key],expected);assert.equal(raw[key],'')
 }
 assert.ok(resolveChlorine({freeChlorine:'2',combinedChlorine:'',totalChlorine:'1'}).error)
 assert.equal(resolveChlorine({freeChlorine:'0',combinedChlorine:'',totalChlorine:'0'}).values.combinedChlorine,'0.00')
})
test('Finalizar enlaza solo el ticket elegido, con sello del servidor, y revierte errores de forma atómica', async () => {
 const db=new PGlite()
 const user=crypto.randomUUID(),hotel='9e2e3d56-25d7-41a5-8dd6-df6858e735bd',other=crypto.randomUUID()
 const plan=crypto.randomUUID(),asset=crypto.randomUUID(),ticket=crypto.randomUUID(), group=crypto.randomUUID()
 try {
 await db.exec(`create role anon;create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key);create table hotels(id uuid primary key);
 create table profiles(id uuid primary key,full_name text, login_identifier text);
 create function has_suite_access() returns boolean language sql stable as $$select true$$;
 create function has_hotel_permission(uuid,text) returns boolean language sql stable as $$select $1='${hotel}'::uuid$$;
 create table apparatus_registry(id uuid primary key,hotel_id uuid,active boolean,source_id int,name text,location text);
 create table maintenance_plans(id uuid primary key,hotel_id uuid,active boolean,apparatus_registry_id uuid,next_due_date date,periodicity_unit text,name text);
 create table pam_maintenance_plan_links(maintenance_plan_id uuid,source_group_id uuid,source_apparatus_id int,plan_year int);
 create table pam_source_groups(id uuid,hotel_id uuid,source_row int);
 create table maintenance_exercise_start(hotel_id uuid,started_at timestamptz);
 create table maintenance_work_orders(id uuid primary key,hotel_id uuid,ot_number text,maintenance_plan_id uuid,scheduled_date date,status text,work_type text,completed_at timestamptz,completed_by uuid,observations text,completion_timing text,updated_at timestamptz);
 create table maintenance_executions(id uuid primary key default gen_random_uuid(),maintenance_plan_id uuid,work_order_id uuid,scheduled_date date,executed_at timestamptz,executed_by uuid,performer_name text,performer_company text,result text,observations text);
 insert into auth.users values('${user}');insert into hotels values('${hotel}'),('${other}');
 insert into profiles values('${user}','Operario de ensayo','tecnico');
 insert into apparatus_registry values('${asset}','${hotel}',true,334,'Piscina exterior','P17');
 insert into maintenance_plans values('${plan}','${hotel}',true,'${asset}',current_date-1,'DAY','Piscina');
 insert into pam_source_groups values('${group}','${hotel}',7);
 insert into pam_maintenance_plan_links values('${plan}','${group}',334,2026);
 insert into maintenance_exercise_start values('${hotel}',null);
 insert into maintenance_work_orders(id,hotel_id,ot_number,maintenance_plan_id,scheduled_date,status,work_type) values
 ('${ticket}','${hotel}','OT-1','${plan}',timezone('Europe/Madrid',now())::date,'PENDING','PREVENTIVE');
 grant usage on schema auth to authenticated;grant select on all tables in schema public to authenticated;
 grant update on maintenance_work_orders,maintenance_plans to authenticated;`)
 for(const [file,name] of [['055_operational_work_orders_and_detail','complete_maintenance_work_order'],['051_work_order_execution_timing','complete_work_order_from_maintenance_execution']]){
   const src=read(file), start=src.toLowerCase().indexOf('create or replace function public.'+name+'(')
   assert.ok(start>=0);await db.exec(src.slice(start,src.indexOf('$$;',src.indexOf('AS $$',start)+5)+3))
 }
 await db.exec('create trigger complete_ot after insert on maintenance_executions for each row execute function complete_work_order_from_maintenance_execution()')
 for(const file of ['20261117093753_technical_book_records','20261117224212_preventive_due_access','20261118001000_water_book_templates','20261118034500_book_ticket_workflow'])await db.exec(read(file))
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}'`)
 const book=waterBook('pool')
 const sample={date:'2000-01-01',time:'00:00',technician:'Nombre manual',notes:'Lectura',disinfectant:'CHLORINE',temperature:'20',ph:'7.3',freeChlorine:'1',totalChlorine:'1.2',combinedChlorine:'0.2',transparency:true,turbidity:'1',filteredWater:'120',filtersCleaned:false}
 const make=(h=hotel)=>({...encodeSample(createEntry(book,{hotelId:h,userId:user}),sample),status:'FINAL',pamTicketId:ticket,pamOutcome:'COMPLETED'})
 const save=e=>db.query('insert into technical_book_records(id,hotel_id,book_id,definition_hash,payload) values($1,$2,$3,$4,$5) returning payload',[e.id,e.hotelId,e.bookId,e.definitionHash,JSON.stringify(e)])
 await assert.rejects(save(make()),/Ticket no disponible/)
 await db.exec("reset role;update maintenance_exercise_start set started_at=now();set role authenticated")
 await assert.rejects(save(make(other)),/Ticket no disponible/)
 await assert.rejects(save({...make(),pamOutcome:null}),/resultado del ticket/)
 const saved=(await save(make())).rows[0].payload
 assert.equal(saved.pamPlanId,plan);assert.equal(saved.pamEquipmentId,asset);assert.equal(saved.pamTicketNumber,'OT-1')
 assert.equal(saved.technician,'Operario de ensayo');assert.notEqual(saved.date,sample.date)
 await assert.rejects(save(make()),/Ticket no disponible/)
 const counts=await db.query("select (select count(*)::int from technical_book_records) books,(select count(*)::int from maintenance_executions) executions,(select status from maintenance_work_orders) status")
 assert.deepEqual(counts.rows[0],{books:1,executions:1,status:'COMPLETED'})
 } finally {await db.close()}
})
