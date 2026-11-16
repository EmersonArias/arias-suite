import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { accessAuditRow } from '../supabase/functions/auth-login/accessAudit.ts'
import { accessDevice, madridMidnight, accessDate } from '../src/features/accesslog/accessLogModel.ts'
const uid='00000000-0000-4000-8000-000000000002', sid='10000000-0000-4000-8000-000000000002'
const token='test.'+btoa(JSON.stringify({session_id:sid}))+'.test'
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText

test('auditoría guarda metadatos acotados, nunca contraseña/tokens, y no acepta identidad desde JSON',()=>{
  const row=accessAuditRow(new Request('https://example.invalid',{headers:{'user-agent':'x'.repeat(700),'x-forwarded-for':'198.51.100.8, 192.0.2.1'}}),uid,'PRUEBA',token)
  assert.equal(row.user_id,uid);assert.equal(row.session_id,sid);assert.equal(row.ip_address,'198.51.100.8');assert.equal(row.user_agent.length,512)
  assert.deepEqual(Object.keys(row).sort(),['ip_address','ip_source','login_identifier','session_id','user_agent','user_id'].sort())
  const unknown=accessAuditRow(new Request('https://example.invalid',{headers:{'x-forwarded-for':'invalid request data'}}),uid,'PRUEBA','invalid')
  assert.equal(unknown.ip_address,null);assert.equal(unknown.ip_source,'unavailable');assert.equal(unknown.session_id,null)
})
test('fechas Madrid distinguen invierno/verano y el límite final es exclusivo',()=>{
  assert.equal(madridMidnight('2026-11-16'),'2026-11-15T23:00:00.000Z')
  assert.equal(madridMidnight('2026-07-16'),'2026-07-15T22:00:00.000Z')
  assert.equal(madridMidnight('2026-03-29',true),'2026-03-29T22:00:00.000Z')
  assert.throws(()=>madridMidnight('2026-02-30'))
  assert.equal(accessDate(null),'—')
})
test('clasifica Edge/Windows y servidor sin atribuir a una persona ni inventar ubicación',()=>{
  assert.equal(accessDevice('Mozilla Windows Chrome/1.0 Edg/1.0'),'Windows · Edge')
  assert.equal(accessDevice('Deno/2.1.4 (SupabaseEdgeRuntime)'),'Servidor de autenticación')
  assert.equal(accessDevice(null),'No disponible')
})
async function login({valid=true,auditFails=false}={}){
  let handler;const inserted=[],warnings=[]
  const admin={from:table=>table==='profiles'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:uid,active:true,account_status:'ACTIVE',login_identifier:'PRUEBA'},error:null})})})}:{insert:async row=>{inserted.push(row);return {error:auditFails?{code:'XX000'}:null}}},rpc:async()=>({data:true,error:null}),auth:{admin:{getUserById:async()=>({data:{user:{email:'test@example.invalid'}},error:null})}}}
  const client={auth:{signInWithPassword:async()=>valid?{data:{session:{access_token:token,refresh_token:'synthetic-refresh'},user:{email_confirmed_at:'2026-01-01'}},error:null}:{data:{session:null,user:null},error:new Error('invalid')}}}
  let clients=0
  vm.runInNewContext(compile('supabase/functions/auth-login/index.ts'),{exports:{},Request,Response,atob,console:{warn:x=>warnings.push(x)},Deno:{env:{get:()=> 'synthetic-config'},serve:fn=>{handler=fn}},require:name=>name==='./accessAudit.ts'?{accessAuditRow}:{createClient:()=>clients++%2===0?admin:client}})
  const result=await handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json','user-agent':'Android Chrome/1.0'},body:JSON.stringify({identifier:'PRUEBA',password:'synthetic-only',user_id:'forged'})}))
  return{result,inserted,warnings}
}
test('login correcto se registra; login denegado no registra un éxito',async()=>{
  const good=await login();assert.equal(good.result.status,200);assert.equal(good.inserted.length,1);assert.equal(good.inserted[0].user_id,uid)
  const bad=await login({valid:false});assert.equal(bad.result.status,401);assert.equal(bad.inserted.length,0)
})
test('un fallo de auditoría no bloquea login ni imprime credenciales',async()=>{
  const result=await login({auditFails:true});assert.equal(result.result.status,200);assert.deepEqual(result.warnings,['access_audit_write_failed'])
})
test('pantalla deniega usuarios no administradores sin consultar el historial',()=>{
  let requests=0;const mod={exports:{}}
  vm.runInNewContext(compile('src/features/accesslog/AccessLogPage.tsx'),{module:mod,exports:mod.exports,Date,Intl,require:name=>name==='react/jsx-runtime'?jsx:name==='react'?{useEffect:()=>{},useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]}:name==='react-router-dom'?{Link:({children})=>children}:name.endsWith('HotelScopeContext')?{useHotelScope:()=>({isPlatformAdmin:false,loading:false})}:name==='./accessLogModel'?{madridDay:()=> '2026-11-16'}:{supabase:{rpc:()=>{requests++;throw Error('unexpected')}}}})
  const html=renderToStaticMarkup(mod.exports.default())
  assert.match(html,/reservada al administrador/);assert.doesNotMatch(html,/Filtrar accesos/);assert.equal(requests,0)
})
