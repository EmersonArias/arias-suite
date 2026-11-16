// Run against a separate embedded PostgreSQL instance with synthetic users only.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const root=process.env.ARIAS_AUDIT_TEST_NODE_MODULES
if(!root)throw Error('Set ARIAS_AUDIT_TEST_NODE_MODULES to an isolated installation of @electric-sql/pglite')
const {PGlite}=await import(pathToFileURL(root+'/\x40electric-sql/pglite/dist/index.js').href)
process.on('uncaughtException',e=>{console.error(e.message);process.exit(1)})
const db=new PGlite()
const admin='00000000-0000-4000-8000-000000000001', viewer='00000000-0000-4000-8000-000000000002'
const s1='10000000-0000-4000-8000-000000000001',s2='10000000-0000-4000-8000-000000000002'
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid primary key,last_sign_in_at timestamptz);
CREATE TABLE auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,updated_at timestamptz,refreshed_at timestamp,ip inet,user_agent text);
CREATE TABLE public.profiles(id uuid primary key,login_identifier text,full_name text,active boolean,account_status text);
CREATE TABLE public.platform_admins(user_id uuid,active boolean);
GRANT SELECT ON public.profiles TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=auth.uid() AND active)$$;
INSERT INTO auth.users VALUES('${admin}',now()-interval '2 hours'),('${viewer}',now()-interval '1 hour');
INSERT INTO public.profiles VALUES('${admin}','ADMIN','Admin simulado',true,'ACTIVE'),('${viewer}','PRUEBA','Prueba simulada',true,'ACTIVE');
INSERT INTO public.platform_admins VALUES('${admin}',true);
INSERT INTO auth.sessions VALUES('${s1}','${viewer}',now()-interval '1 hour',now()-interval '10 minutes',null,'198.51.100.8','Mozilla Windows Edg/1.0');
`)
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_user_access_log.sql'))
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'))
const params=[new Date(Date.now()-86400000).toISOString(),new Date(Date.now()+86400000).toISOString()]
const query='SELECT * FROM public.list_user_access_log($1,$2,$3,$4,$5)'
async function caller(role,id){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE '+role)}
await caller('authenticated',viewer)
await assert.rejects(db.query(query,[...params,null,100,0]),/reservada/)
assert.equal((await db.query('SELECT * FROM public.user_access_events')).rows.length,0)
await assert.rejects(db.query("INSERT INTO public.user_access_events(login_identifier) VALUES('FORGED')"),/permission denied/)
await caller('anon','')
await assert.rejects(db.query(query,[...params,null,100,0]),/permission denied/)
await caller('service_role','')
await db.query('INSERT INTO public.user_access_events(user_id,session_id,login_identifier,occurred_at,ip_address,user_agent) VALUES($1,$2,$3,now()-interval \'1 hour\',$4,$5)',[viewer,s1,'PRUEBA','198.51.100.8','Android Chrome/1.0'])
await caller('authenticated',admin)
let rows=(await db.query(query,[...params,null,100,0])).rows
assert.equal(rows.length,2)
assert.equal(rows.filter(r=>r.user_id===viewer).length,1,'recorded session is not duplicated')
assert.ok(rows.find(r=>r.user_id===viewer).renewed_at,'recorded sign-in retains session renewal metadata')
assert.ok(rows.some(r=>r.event_kind==='LAST_SIGN_IN'&&r.user_id===admin))
assert.equal((await db.query(query,[...params,viewer,100,0])).rows.length,1)
assert.equal((await db.query(query,[...params,null,1,1])).rows.length,1)
await assert.rejects(db.query(query,[params[1],params[0],null,100,0]),/intervalo/)
await db.exec('RESET ROLE; UPDATE public.profiles SET active=false WHERE id=\''+admin+'\'')
await caller('authenticated',admin)
await assert.rejects(db.query(query,[...params,null,100,0]),/reservada/)
await db.close()
console.log('PASS: separate PostgreSQL migration, RLS, anonymous/viewer denial, active admin guard, filters, pagination and session deduplication')
