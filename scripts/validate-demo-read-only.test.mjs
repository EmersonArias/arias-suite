import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_USER_ID, DEMO_READ_ONLY_MESSAGE, createDemoReadOnlyFetch, demoRequestBlocked, isDemoMutationLabel } from '../src/core/access/demoReadOnly.ts'
import { bookDefinitions } from '../src/features/technicalbooks/bookDefinitions.ts'
import { createEntry, persistEntry } from '../src/features/technicalbooks/bookModel.ts'
import { buildBookPdf } from '../src/features/technicalbooks/bookPdf.ts'
const base='https://demo.supabase.co'
const jwt = userId => 'header.' + btoa(JSON.stringify({sub:userId})).replaceAll('=','') + '.signature'

test('PRUEBA no envía ninguna mutación de tablas, almacenamiento ni funciones al servidor', async () => {
  let calls=0
  const guarded=createDemoReadOnlyFetch(base,async()=>{calls++;return new Response('{}')},()=>DEMO_USER_ID)
  for(const [path,method] of [['/rest/v1/maintenance_plans','POST'],['/rest/v1/maintenance_work_orders','PATCH'],['/rest/v1/maintenance_pending_items','DELETE'],['/rest/v1/profiles','PATCH'],['/storage/v1/object/evidence/photo.jpg','POST'],['/functions/v1/send-material-request','POST'],['/auth/v1/user','PUT']]){
    const result=await guarded(base+path,{method})
    assert.equal(result.status,403,path)
    assert.equal((await result.json()).message,DEMO_READ_ONLY_MESSAGE)
  }
  assert.equal(calls,0)
})
test('el token identifica PRUEBA antes de que se restaure la sesión y no altera a otros usuarios',async()=>{
  let calls=0
  const guarded=createDemoReadOnlyFetch(base,async()=>{calls++;return new Response('{}')},()=>null)
  const result=await guarded(new Request(base+'/rest/v1/maintenance_plans',{method:'POST',headers:{authorization:'Bearer '+jwt(DEMO_USER_ID)}}))
  assert.equal(result.status,403);assert.equal(calls,0)
  assert.equal((await guarded(base+'/rest/v1/maintenance_plans',{method:'POST',headers:{authorization:'Bearer '+jwt('otro-usuario')}})).status,200)
  assert.equal(calls,1)
})
test('consulta, permisos, sesión y descargas siguen disponibles; RPC de escritura se bloquea con POST y GET',async()=>{
  let calls=0
  const guarded=createDemoReadOnlyFetch(base,async()=>{calls++;return new Response('{}')},()=>DEMO_USER_ID)
  for(const [path,method] of [['/rest/v1/maintenance_work_orders','GET'],['/rest/v1/rpc/has_suite_access','POST'],['/rest/v1/rpc/has_hotel_permission','POST'],['/rest/v1/rpc/get_active_hotel','POST'],['/storage/v1/object/public/photo.jpg','GET'],['/auth/v1/token','POST'],['/auth/v1/logout','POST'],['/functions/v1/auth-login','POST']])assert.equal((await guarded(base+path,{method})).status,200,path)
  assert.equal(calls,8)
  for(const name of ['set_active_hotel','create_operational_work_order','complete_maintenance_work_order','count_maintenance_material_stock','refresh_maintenance_due_alerts','staff_clock_punch'])for(const method of ['GET','POST'])assert.equal(demoRequestBlocked(new URL(base+'/rest/v1/rpc/'+name),method),true,name)
})
test('los guardados de libros fallan antes de escribir, pero se puede generar el PDF sin guardarlo',()=>{
  let writes=0
  const storage={getItem:()=>null,setItem:()=>writes++}
  const scope={userId:DEMO_USER_ID,hotelId:'hotel-demo'}
  for(const book of bookDefinitions){
    const entry=createEntry(book,scope)
    for(const finalize of [false,true])assert.throws(()=>persistEntry(storage,scope,book,entry,finalize,null),/Usuario de prueba/)
    assert.ok(buildBookPdf(book,[entry],'Hotel demo').getNumberOfPages()>0)
  }
  assert.equal(writes,0)
})
test('las acciones de guardado muestran el aviso mientras navegación, filtros y PDF quedan disponibles',()=>{
  for(const label of ['Guardar','Guardar borrador','Crear ticket','Finalizar prueba','Rectificar','Eliminar fotografía','Enviar petición','Generar código','Confirmar cambio','Aceptar'])assert.equal(isDemoMutationLabel(label),true,label)
  for(const label of ['PDF de la ficha','Generar PDF','PDF del listado','Exportar PDF','Imprimir','Volver','Abrir registro de Bombas','Buscar','Nueva revisión','Entendido','Cerrar sesión'])assert.equal(isDemoMutationLabel(label),false,label)
})
