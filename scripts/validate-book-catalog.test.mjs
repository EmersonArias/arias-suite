import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { bookDefinitions } from '../src/features/technicalbooks/bookDefinitions.ts'
import { createEntry } from '../src/features/technicalbooks/bookModel.ts'

const read = name => fs.readFileSync('supabase/migrations/' + name + '.sql', 'utf8')
const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/book-catalog.json', 'utf8'))
const hotel = '9e2e3d56-25d7-41a5-8dd6-df6858e735bd'
const user = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const demo = '6d755017-7348-41ea-aad7-d1b8334fff99'

test('Catálogo y campañas conservan el histórico, validan unidades y cierran un único ticket al completar todo', async () => {
  const db = new PGlite()
  let closed = false
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key);
      create table hotels(id uuid primary key);
      create table profiles(id uuid primary key, full_name text, login_identifier text);
      create function has_suite_access() returns boolean language sql stable as $$select true$$;
      create function has_hotel_access(uuid) returns boolean language sql stable as $$select $1='${hotel}'::uuid$$;
      create function has_hotel_permission(uuid,text) returns boolean language sql stable as $$select $1='${hotel}'::uuid$$;
      create table apparatus_registry(id uuid primary key default gen_random_uuid(),hotel_id uuid,source_id int,code text default 'TEST-NEW',name text,plant text,location text,location_id uuid,active boolean default true);
      create table maintenance_plans(id uuid primary key default gen_random_uuid(),hotel_id uuid,apparatus_registry_id uuid,code text,name text,maintenance_type text,periodicity_value int,periodicity_unit text,start_date date,next_due_date date,active boolean,updated_at timestamptz default now());
      create table pam_source_groups(id uuid primary key,hotel_id uuid,source_version text,source_sheet text,source_row int,source_apparatus_expression text,maintenance_name text,plan_year int,imported_at timestamptz);
      create table pam_maintenance_plan_links(id uuid primary key default gen_random_uuid(),maintenance_plan_id uuid,source_group_id uuid,source_apparatus_id int,mark_code text,plan_year int,created_at timestamptz);
      create table pam_source_marks(id uuid primary key default gen_random_uuid(),hotel_id uuid,source_version text,source_sheet text,source_row int,source_column int,source_apparatus_id int,apparatus_registry_id uuid,plan_year int,month_number int,week_slot int,mark_code text,imported_at timestamptz);
      create table maintenance_room_fancoil_tracking(hotel_id uuid,room_code text,status text,completed_at date,technician text,notes text,updated_by uuid,updated_at timestamptz default now(),created_at timestamptz default now(),primary key(hotel_id,room_code));
      create table maintenance_exercise_start(hotel_id uuid primary key,operator_id uuid,started_at timestamptz);
      create table maintenance_hotel_config(hotel_id uuid primary key,ot_generation_mode text);
      create table maintenance_work_orders(id uuid primary key default gen_random_uuid(),hotel_id uuid,ot_number text,maintenance_plan_id uuid,scheduled_date date,status text,work_type text,completed_at timestamptz,completed_by uuid,observations text,completion_timing text,updated_at timestamptz);
      create table maintenance_executions(id uuid primary key default gen_random_uuid(),maintenance_plan_id uuid,work_order_id uuid,scheduled_date date,executed_at timestamptz,executed_by uuid,performer_name text,performer_company text,result text,observations text);
      create table assets(id uuid primary key,hotel_id uuid);
      create table electrical_panels(id uuid primary key,hotel_id uuid);
      create table maintenance_pending_items(id uuid primary key,hotel_id uuid);
      create table maintenance_blocked_rooms(id uuid primary key,hotel_id uuid);
      insert into hotels values('${hotel}'); insert into auth.users values('${user}'),('${demo}');
      insert into profiles values('${user}','Operario simulado','simulado'),('${demo}','PRUEBA','PRUEBA');
      insert into maintenance_room_fancoil_tracking(hotel_id,room_code,status,technician,notes) values
       ('${hotel}','2-01','PENDING','',''),('${hotel}','2-02','DONE','Operario anterior','Trabajo anterior sin fecha');
      insert into maintenance_exercise_start values('${hotel}','${user}',null);
      insert into maintenance_hotel_config values('${hotel}','MANUAL');
    `)
    for (const [table, rows] of Object.entries(fixture)) {
      await db.query('insert into ' + table + ' select * from jsonb_populate_recordset(null::' + table + ',$1)', [JSON.stringify(rows)])
    }
    await db.exec(read('066_hotel_location_hierarchy'))
    for (const [file, name] of [['055_operational_work_orders_and_detail', 'complete_maintenance_work_order'], ['051_work_order_execution_timing', 'complete_work_order_from_maintenance_execution']]) {
      const sql = read(file), start = sql.toLowerCase().indexOf('create or replace function public.' + name + '(')
      await db.exec(sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start) + 5) + 3))
    }
    await db.exec('create trigger execution_close after insert on maintenance_executions for each row execute function complete_work_order_from_maintenance_execution()')
    for (const file of ['20261117093753_technical_book_records','20261117224212_preventive_due_access','20261118001000_water_book_templates','20261118034500_book_ticket_workflow',
      '20261118060000_technical_book_catalog','20261118061000_technical_book_campaigns','20261118062000_book_catalog_due_identity','20261118063000_book_pam_equipment_scopes','20261118064000_book_campaign_calendar']) await db.exec(read(file))
    assert.equal((await db.query("select count(*)::int n from hotel_locations where location_type='HABITACION'")).rows[0].n, 2)
    assert.equal((await db.query('select count(*)::int n from technical_book_units')).rows[0].n, 229)
    assert.equal((await db.query("select count(*)::int n from technical_book_units where verified")).rows[0].n, 0)
    assert.equal((await db.query("select count(*)::int n from technical_book_units where book_id='extintores' and code='106'")).rows[0].n, 1)
    assert.equal((await db.query("select metadata->>'previous_code' previous from technical_book_units where book_id='extintores' and code='177' and metadata->>'plate'='64304'")).rows[0].previous, '106')
    assert.deepEqual((await db.query("select a.source_id from technical_book_plan_bindings b join apparatus_registry a on a.id=b.equipment_id where b.book_id='fancoils-comunes' order by a.source_id")).rows.map(row=>row.source_id), [25,159,160,319])
    const plans = (await db.query("select a.source_id,p.id from maintenance_plans p join apparatus_registry a on a.id=p.apparatus_registry_id where a.source_id in(340,341)")).rows
    const makeTicket = async (asset, number) => (await db.query("insert into maintenance_work_orders(hotel_id,maintenance_plan_id,ot_number,scheduled_date,status,work_type) values($1,$2,$3,timezone('Europe/Madrid',now())::date,'PENDING','PREVENTIVE') returning id", [hotel, plans.find(p => p.source_id === asset).id, number])).rows[0].id
    await makeTicket(340, 'BEFORE-START')
    assert.equal((await db.query('select count(*)::int n from technical_book_campaigns')).rows[0].n, 0)
    await db.exec(`grant usage on schema auth to authenticated;grant select on all tables in schema public to authenticated;grant insert,update on maintenance_work_orders,maintenance_plans,maintenance_room_fancoil_tracking to authenticated;set request.jwt.claim.sub='${user}'`)
    await db.query('select start_hotel_exercise($1)',[hotel])
    await assert.rejects(db.query('select start_hotel_exercise($1)',[hotel]),/ya está iniciado/)
    const ticket = await makeTicket(340, 'FANCOIL-GLOBAL')
    const members = (await db.query('select * from technical_book_campaign_targets where ticket_id=$1 order by label', [ticket])).rows
    assert.equal(members.length, 2)
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select complete_technical_book_campaign($1,'COMPLETED','')", [ticket]), /pendientes/)
    await assert.rejects(db.query("update maintenance_work_orders set status='COMPLETED' where id=$1", [ticket]), /campaña global/)
    await assert.rejects(db.query("update maintenance_room_fancoil_tracking set status='DONE' where room_code='2-01'"), /Finaliza la ficha/)
    const save = async (member, patch = {}) => {
      const book = bookDefinitions.find(b => b.id === member.book_id)
      const entry = { ...createEntry(book,{hotelId:hotel,userId:user}),status:'FINAL',asset:member.label,location:member.location,
        locationId:member.location_id,assetId:member.equipment_id || undefined,unitId:member.unit_id || undefined,targetKey:member.target_key,
        campaignTicketId:member.ticket_id,campaignTargetId:member.id }
      for (const field of book.fields) entry.answers[field.id] = { value: field.kind === 'check' ? 'V' : field.kind === 'yesno' ? (field.adverse === 'SI' ? 'NO' : 'SI') : field.kind === 'number' ? '21.5' : field.kind === 'date' ? '2030-01-01' : 'Comprobado', note:'' }
      Object.assign(entry, patch)
      return db.query('insert into technical_book_records(id,hotel_id,book_id,definition_hash,payload) values($1,$2,$3,$4,$5) returning payload',[entry.id,hotel,book.id,book.sha256,JSON.stringify(entry)])
    }
    await assert.rejects(save(members[0], { controlIds: ['control-5'] }), /Completa todos/)
    await assert.rejects(save(members[0], { locationId: crypto.randomUUID() }), /ubicación/)
    await save(members[0])
    await assert.rejects(save(members[0]), /ya tiene/)
    await assert.rejects(db.query("select complete_technical_book_campaign($1,'COMPLETED','')",[ticket]),/pendientes/)
    assert.equal(members[1].previous_work.status,'DONE')
    assert.equal(members[1].previous_work.completed_at,null)
    await db.query('select confirm_previous_fancoil_work($1,$2)',[ticket,[members[1].id]])
    await db.exec('reset role')
    const floor = (await db.query("select id from hotel_locations where code='P02'")).rows[0].id
    await db.query("insert into hotel_locations(hotel_id,parent_location_id,location_type,code,name) values($1,$2,'HABITACION','2-03','Habitación 2-03')",[hotel,floor])
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select complete_technical_book_campaign($1,'COMPLETED','')",[ticket]),/catálogo ha cambiado/)
    await db.query('select refresh_technical_book_campaign($1)',[ticket])
    const added = (await db.query("select * from technical_book_campaign_targets where ticket_id=$1 and label='2-03'",[ticket])).rows[0]
    await save(added)
    await db.query("select complete_technical_book_campaign($1,'COMPLETED','Confirmado por operario')",[ticket])
    assert.equal((await db.query('select status from maintenance_work_orders where id=$1',[ticket])).rows[0].status,'COMPLETED')
    assert.equal((await db.query("select technician from maintenance_room_fancoil_tracking where room_code='2-01'")).rows[0].technician,'Operario simulado')
    assert.equal((await db.query("select completed_at from maintenance_room_fancoil_tracking where room_code='2-02'")).rows[0].completed_at,null)
    await db.exec('reset role')
    await db.query('select recalculate_maintenance_plan_due_date($1)',[plans.find(p=>p.source_id===340).id])
    assert.equal((await db.query("select next_due_date=make_date(extract(year from timezone('Europe/Madrid',now()))::int+1,1,1) ok from maintenance_plans where id=$1",[plans.find(p=>p.source_id===340).id])).rows[0].ok,true)
    await db.exec('set role authenticated')
    const fire = await makeTicket(341,'PCI-GLOBAL')
    const fireTargets = (await db.query('select * from technical_book_campaign_targets where ticket_id=$1',[fire])).rows
    assert.equal(fireTargets.length,231)
    for (const member of fireTargets) await save(member)
    await assert.rejects(db.query("select complete_technical_book_campaign($1,'COMPLETED','')",[fire]),/listado vigente/)
    await db.exec('reset role;update technical_book_units set verified=true;set role authenticated')
    await db.query("select complete_technical_book_campaign($1,'COMPLETED','Cuatro apartados revisados')",[fire])
    const pciRecord = (await db.query("select payload from technical_book_records where book_id='pci'")).rows[0].payload
    assert.equal(pciRecord.answers['control-B36'].value,'NA')
    assert.equal((await db.query('select count(*)::int n from maintenance_executions')).rows[0].n,2)
    await db.exec('reset role')
    await db.query('select recalculate_maintenance_plan_due_date($1)',[plans.find(p=>p.source_id===341).id])
    assert.equal((await db.query("select next_due_date=(date_trunc('quarter',timezone('Europe/Madrid',now()))+interval '3 months')::date ok from maintenance_plans where id=$1",[plans.find(p=>p.source_id===341).id])).rows[0].ok,true)
    const accumulator = (await db.query('select * from apparatus_registry where source_id in(168,169) order by source_id')).rows
    const legionella = bookDefinitions.find(book=>book.id==='legionella')
    const legionellaPlan = (await db.query("select p.id from maintenance_plans p where p.apparatus_registry_id=$1",[accumulator[0].id])).rows[0].id
    await db.query("update maintenance_plans set next_due_date=timezone('Europe/Madrid',now())::date where id=$1",[legionellaPlan])
    const legionellaTicket = (await db.query("insert into maintenance_work_orders(hotel_id,maintenance_plan_id,ot_number,scheduled_date,status,work_type) values($1,$2,'LEGIONELLA-M',timezone('Europe/Madrid',now())::date,'PENDING','PREVENTIVE') returning id",[hotel,legionellaPlan])).rows[0].id
    await db.exec('set role authenticated')
    const saveLegionella = (asset, frequency, controlIds, extra={}) => {
      const entry={...createEntry(legionella,{hotelId:hotel,userId:user}),status:'FINAL',assetId:asset.id,locationId:asset.location_id,
        frequency,controlIds,controlEquipmentIds:{},answers:{},...extra}
      for(const field of legionella.fields.filter(field=>controlIds.includes(field.id))) entry.answers[field.id]={value:field.kind==='check'?'V':field.kind==='number'?'65':'Revisado',note:''}
      return db.query('insert into technical_book_records(id,hotel_id,book_id,definition_hash,payload) values($1,$2,$3,$4,$5) returning id,payload',[entry.id,hotel,legionella.id,legionella.sha256,JSON.stringify(entry)])
    }
    await assert.rejects(saveLegionella(accumulator[0],'D',['activity-9']),/Selecciona el acumulador/)
    await assert.rejects(saveLegionella(accumulator[0],'D',['activity-9'],{controlEquipmentIds:{'activity-9':crypto.randomUUID()}}),/catálogo del hotel/)
    const daily=await saveLegionella(accumulator[0],'D',['activity-9'],{controlEquipmentIds:{'activity-9':accumulator[0].id},controlEquipmentLabels:{'activity-9':'Etiqueta manipulada'}})
    assert.equal(daily.rows[0].payload.controlEquipmentLabels['activity-9'],'168 · ACUMULADOR ACS 1 (5)')
    await assert.rejects(saveLegionella(accumulator[1],'D',['activity-9'],{controlEquipmentIds:{'activity-9':accumulator[0].id}}),/Todavía no toca/)
    await saveLegionella(accumulator[1],'D',['activity-9'],{controlEquipmentIds:{'activity-9':accumulator[1].id}})
    await assert.rejects(saveLegionella(accumulator[0],'D',['activity-8'],{pamTicketId:legionellaTicket,pamOutcome:'COMPLETED'}),/requiere los controles mensuales/)
    await assert.rejects(saveLegionella(accumulator[0],'M',['activity-20'],{pamTicketId:legionellaTicket,pamOutcome:'COMPLETED'}),/todos los controles mensuales/)
    const monthly=await saveLegionella(accumulator[0],'M',legionella.fields.filter(field=>field.frequency==='M').map(field=>field.id),{pamTicketId:legionellaTicket,pamOutcome:'COMPLETED'})
    const executions=(await db.query('select * from technical_book_control_executions where record_id=$1',[monthly.rows[0].id])).rows
    assert.ok(executions.length>0 && executions.every(row=>row.equipment_id===accumulator[0].id && row.plan_id===legionellaPlan && row.frequency==='M'))
    assert.equal((await db.query('select status from maintenance_work_orders where id=$1',[legionellaTicket])).rows[0].status,'COMPLETED')
    await db.exec(`set request.jwt.claim.sub='${demo}'`)
    await assert.rejects(db.query("select complete_technical_book_campaign($1,'COMPLETED','')",[ticket]),/permiso/)
    assert.equal((await db.query("update technical_book_units set name='PRUEBA' where id=$1 returning id",[fireTargets.find(t=>t.unit_id).unit_id])).rows.length,0)
    await db.exec('reset role')
    const backup = await db.dumpDataDir()
    await db.close()
    closed = true
    const restored = new PGlite({loadDataDir:backup})
    assert.equal((await restored.query('select count(*)::int n from technical_book_records')).rows[0].n,236)
    await restored.close()
  } finally { if (!closed) await db.close() }
})
