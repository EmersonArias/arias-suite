import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { validActivity, boundedActivityBody, TRACKED_USER_ID } from '../supabase/functions/record-demo-activity/contract.ts'
import {createActivityReporter} from '../src/core/access/demoActivityModel.ts'
import {createDemoReadOnlyFetch,DEMO_USER_ID,demoRequestBlocked} from '../src/core/access/demoReadOnly.ts'
const event={client_event_id:'10000000-0000-4000-8000-000000000001',event_type:'MODULE_OPEN',route:'/registros-tecnicos/libros/bombas'}

test('solo acepta señales acotadas, nunca datos de formularios, identidad o rutas con consultas',async()=>{
  assert.equal(TRACKED_USER_ID,DEMO_USER_ID)
  assert.deepEqual(validActivity(event),event)
  for(const invalid of [{...event,user_id:'forged'},{...event,password:'secret'},{...event,event_type:'SAVE'},{...event,route:'/login'},{...event,route:'/maintenance?password=x'},{...event,route:'https://example.invalid'},{...event,client_event_id:'wrong'}])assert.equal(validActivity(invalid),null)
  assert.equal(await boundedActivityBody(new Request('https://example.invalid',{method:'POST',body:'x'.repeat(3000)})),null)
})
test('recarga inicial y apertura de módulos se deduplican sin eventos periódicos',async()=>{
  const sent=[];let time=1000
  const r=createActivityReporter(async e=>{sent.push(e)},()=>time,()=>event.client_event_id)
  r.routeOpened('/login',true);r.routeOpened('/registros-tecnicos',true);r.routeOpened('/registros-tecnicos',true)
  r.routeOpened('/registros-tecnicos/libros/bombas',true)
  r.report('WRITE_BLOCKED','/registros-tecnicos/libros/bombas');r.report('WRITE_BLOCKED','/registros-tecnicos/libros/bombas')
  r.report('PDF_REQUEST','/registros-tecnicos/libros/bombas')
  assert.deepEqual(sent.map(e=>e.event_type),['PAGE_REFRESH','MODULE_OPEN','WRITE_BLOCKED','PDF_REQUEST'])
  time+=1200;r.report('WRITE_BLOCKED','/registros-tecnicos/libros/bombas');assert.equal(sent.length,5)
  const failing=createActivityReporter(async()=>{throw Error('network')});failing.report('PAGE_OPEN','/');await new Promise(resolve=>setImmediate(resolve))
})
test('la única excepción nueva del bloqueo es la telemetría; tablas y RPC siguen cerradas',async()=>{
  let calls=0
  const guarded=createDemoReadOnlyFetch('https://example.invalid',async()=>{calls++;return new Response('{}')},()=>DEMO_USER_ID)
  assert.equal((await guarded('https://example.invalid/functions/v1/record-demo-activity',{method:'POST',body:JSON.stringify(event)})).status,200)
  for(const path of ['/rest/v1/maintenance_work_orders','/rest/v1/demo_activity_events','/rest/v1/rpc/create_operational_work_order','/functions/v1/admin-create-user','/functions/v1/send-material-request'])assert.equal(demoRequestBlocked(new URL('https://example.invalid'+path),'POST'),true,path)
  assert.equal(calls,1)
})
async function invoke({identity=DEMO_USER_ID,active=true,validToken=true,count=0,payload=event,duplicate=false}={}){
  let handler;const rows=[]
  const admin={auth:{getUser:async()=>({data:{user:validToken?{id:identity}:null},error:null})},rpc:async()=>({data:true,error:null}),from:table=>table==='profiles'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{active,account_status:'ACTIVE'},error:null})})})}:{select:()=>({eq:()=>({gte:async()=>({count,error:null})})}),insert:async row=>{rows.push(row);return{error:duplicate?{code:'23505'}:null}}}}
  const source=ts.transpileModule(fs.readFileSync('supabase/functions/record-demo-activity/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(source,{exports:{},Date,Request,Response,console,Deno:{env:{get:()=> 'synthetic-config'},serve:fn=>{handler=fn}},require:name=>name==='./contract.ts'?{TRACKED_USER_ID,boundedActivityBody}:{createClient:()=>admin}})
  const result=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-token','user-agent':'Android Chrome/1.0'},body:JSON.stringify(payload)}))
  return{result,rows}
}
test('verifica identidad y cuenta en servidor; otras cuentas y cuerpos falsificados se rechazan',async()=>{
  for(const options of [{identity:'otro'},{active:false},{validToken:false},{payload:{...event,user_id:'forged'}}]){const r=await invoke(options);assert.ok([400,401,403].includes(r.result.status));assert.equal(r.rows.length,0)}
  const ok=await invoke();assert.equal(ok.result.status,202);assert.equal(ok.rows[0].user_id,DEMO_USER_ID);assert.equal(ok.rows[0].event_type,'MODULE_OPEN');assert.ok(!('occurred_at' in ok.rows[0]))
})
test('reintentos con el mismo evento no duplican filas y el abuso se limita',async()=>{
  assert.equal((await invoke({duplicate:true})).result.status,202)
  const limited=await invoke({count:120});assert.equal(limited.result.status,429);assert.equal(limited.rows.length,0)
})

test('el rastreador ignora renovaciones de sesión y solo añade navegación/visibilidad',()=>{
  const sent=[];const callbacks=new Map();let lastDeps,cleanup
  let user=DEMO_USER_ID,path='/registros-tecnicos'
  const doc={visibilityState:'visible',addEventListener:(name,fn)=>callbacks.set(name,fn),removeEventListener:(name)=>callbacks.delete(name)}
  const mod={exports:{}}
  const source=ts.transpileModule(fs.readFileSync('src/shared/components/DemoActivityTracker.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  vm.runInNewContext(source,{module:mod,exports:mod.exports,document:doc,performance:{getEntriesByType:()=>[{type:'reload'}]},require:name=>name==='react'?{useEffect:(fn,deps)=>{if(!lastDeps||deps.some((d,i)=>d!==lastDeps[i])){cleanup?.();cleanup=fn();lastDeps=deps}}}:name==='react-router-dom'?{useLocation:()=>({pathname:path})}:name.endsWith('AuthProvider')?{useAuth:()=>({session:{user:{id:user},accessToken:'synthetic-refreshed'}})}:name.endsWith('demoReadOnly')?{isDemoUser:id=>id===DEMO_USER_ID}:{demoActivity:{routeOpened:(...a)=>sent.push(['route',...a]),report:(...a)=>sent.push(['report',...a]),reset:()=>sent.push(['reset'])}}})
  mod.exports.default();mod.exports.default()
  assert.equal(sent.length,1,'token refresh cannot emit a route event')
  assert.deepEqual(sent[0],['route','/registros-tecnicos',true])
  path='/registros-tecnicos/libros/bombas';mod.exports.default();assert.equal(sent.length,2)
  doc.visibilityState='hidden';callbacks.get('visibilitychange')();assert.equal(sent.length,2)
  doc.visibilityState='visible';callbacks.get('visibilitychange')();assert.deepEqual(sent[2],['report','APP_RESUME',path])
  user='otro';mod.exports.default();assert.deepEqual(sent[3],['reset']);assert.equal(callbacks.size,0)
})
