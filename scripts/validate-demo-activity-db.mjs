import fs from 'node:fs'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
process.on('uncaughtException',e=>{console.error(e.message);process.exit(1)})
const root=process.env.ARIAS_AUDIT_TEST_NODE_MODULES
if(!root)throw Error('Set ARIAS_AUDIT_TEST_NODE_MODULES to an isolated PGlite installation')
const {PGlite}=await import(pathToFileURL(root+'/\x40electric-sql/pglite/dist/index.js').href)
const db=new PGlite()
const admin='00000000-0000-4000-8000-000000000001',viewer='00000000-0000-4000-8000-000000000002'
await db.exec(`
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,active boolean,account_status text);
CREATE TABLE public.platform_admins(user_id uuid,active boolean);
GRANT SELECT ON public.profiles TO authenticated;GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=auth.uid() AND active)$$;
INSERT INTO auth.users VALUES('${admin}'),('${viewer}');
INSERT INTO public.profiles VALUES('${admin}',true,'ACTIVE'),('${viewer}',true,'ACTIVE');
INSERT INTO public.platform_admins VALUES('${admin}',true);
`)
const name=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_demo_activity_events.sql'))
await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'))
async function caller(role,id){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE '+role)}
const insert="INSERT INTO public.demo_activity_events(user_id,client_event_id,event_type,route) VALUES($1,$2,$3,$4)"
const values=[viewer,'10000000-0000-4000-8000-000000000001','MODULE_OPEN','/registros-tecnicos']
await caller('authenticated',viewer)
await assert.rejects(db.query(insert,values),/permission denied/)
assert.equal((await db.query('SELECT * FROM public.demo_activity_events')).rows.length,0)
await assert.rejects(db.query('UPDATE public.demo_activity_events SET route=\'/\''),/permission denied/)
await caller('service_role','')
await db.query(insert,values)
await assert.rejects(db.query(insert,values),/unique constraint/)
await assert.rejects(db.query(insert,[viewer,'10000000-0000-4000-8000-000000000002','SAVE','/']),/check constraint/)
await assert.rejects(db.query('UPDATE public.demo_activity_events SET route=\'/\''),/permission denied/)
await caller('authenticated',viewer)
assert.equal((await db.query('SELECT * FROM public.demo_activity_events')).rows.length,0)
await caller('authenticated',admin)
assert.equal((await db.query('SELECT * FROM public.demo_activity_events')).rows.length,1)
await assert.rejects(db.query('DELETE FROM public.demo_activity_events'),/permission denied/)
await caller('anon','')
await assert.rejects(db.query('SELECT * FROM public.demo_activity_events'),/permission denied/)
await db.close()
console.log('PASS: isolated PostgreSQL activity schema, service-only inserts, idempotency, admin-only reads, no writes for PRUEBA or anonymous access')
