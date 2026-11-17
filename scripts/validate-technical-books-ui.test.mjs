import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as model from '../src/features/technicalbooks/bookModel.ts'
import * as demoAccess from '../src/core/access/demoReadOnly.ts'
import * as bookSchedule from '../src/features/technicalbooks/bookSchedule.ts'
import * as preventiveSchedule from '../src/shared/maintenance/preventiveSchedule.ts'
import { bookDefinitions, sourceCatalog } from '../src/features/technicalbooks/bookDefinitions.ts'
const b = bookDefinitions.find(b => b.id === 'fancoils')
const scope = { hotelId: 'hotel-simulado', userId: 'usuario-simulado' }
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
const words = node => node === null || node === undefined || typeof node === 'boolean' ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : words(node.props?.children)
function harness(userId = scope.userId, selectedBook = b, seed = []) {
  const b = selectedBook
  const data = new Map(); let state = [], cursor = 0, beforeUnload = false, effectStarted = false
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
  if (seed.length) storage.setItem(model.sandboxKey({ ...scope, userId }), JSON.stringify({ version: 1, entries: seed }))
  const mod = { exports: {} }; const react = {
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }] },
    useEffect: fn => { if (!effectStarted) { effectStarted = true; fn() } },
    useMemo: fn => fn(), lazy: () => () => null, Suspense: ({ children }) => children,
  }
  const dependencies = {
    react, 'react/jsx-runtime': jsx, 'react-router-dom': { Link: ({ children }) => children, useParams: () => ({ bookId: b.id }), useNavigate: () => () => {} },
    './bookRepository': { loadBookRecords: async () => model.loadSandbox(storage, { ...scope, userId }), saveBookRecord: async (s, b, e, f, expected) => model.persistEntry(storage, s, b, e, f, expected).entry },
    './bookModel': model, './bookDefinitions': { bookDefinitions, sourceCatalog },
    './bookSchedule': bookSchedule, '../../shared/maintenance/preventiveSchedule': preventiveSchedule,
    '../../shared/maintenance/useHotelDay': { useHotelDay: () => preventiveSchedule.hotelDay() },
    '../../core/access/demoReadOnly': demoAccess,
    '../../shared/components/dialogs/SystemDialogProvider': { useSystemDialog: () => ({ confirm: async () => true, alert: async () => {} }) },
    '../../shared/hooks/useBeforeUnloadGuard': { useBeforeUnloadGuard: value => { beforeUnload = value } },
    '../../shared/navigation/navigationGuard': { canNavigateInSuite: () => true },
  }
  vm.runInNewContext(compile('src/features/technicalbooks/TechnicalBooksPage.tsx') + '\nexports.BookForm = BookForm; exports.FieldCard = FieldCard; exports.BookIndex = BookIndex; exports.TrialNotice = TrialNotice;', {
    module: mod, exports: mod.exports, structuredClone, crypto, localStorage: storage, Error,
    window: { addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: fn => fn(), document: { querySelector: () => null },
    require: name => dependencies[name] ?? (name === 'lucide-react' ? new Proxy({}, { get: () => () => null }) : {}),
  })
  function render() { cursor = 0; return mod.exports.BookForm({ book: b, scope: { ...scope, userId }, hotelName: 'Hotel simulado' }) }
  function click(label, prefix = false) { const node = nodes(render()).find(n => n.type === 'button' && (prefix ? words(n).replace(/\s+/g, ' ').trim().startsWith(label) : words(n).replace(/\s+/g, ' ').trim() === label)); assert.ok(node, label); assert.ok(!node.props.disabled, label + ' habilitado'); return node.props.onClick() }
  function fill(label, value) { const parent = nodes(render()).find(n => n.type === 'label' && words(n).startsWith(label)); assert.ok(parent, label); nodes(parent).find(n => n.type === 'input').props.onChange({ target: { value } }) }
  return { index: () => mod.exports.BookIndex(), notice: () => mod.exports.TrialNotice(), render, click, fill, storage, get beforeUnload() { return beforeUnload }, reload: () => { state = []; effectStarted = false; return render() }, ready: async () => { render(); await new Promise(resolve => setImmediate(resolve)) } }
}

test('interacción completa: ficha nueva, controles, borrador, recarga, finalización y rectificación sin red', async () => {
  const h = harness(); await h.ready()
  h.fill('Habitación', 'HAB-PRUEBA-201'); h.fill('Técnico responsable', 'Técnico simulado')
  for (const field of nodes(h.render()).filter(n => n.props?.field)) field.props.update(field.props.field.kind === 'number' ? '22,5' : 'V')
  h.click('Guardar borrador'); await new Promise(resolve => setImmediate(resolve))
  assert.equal(model.loadSandbox(h.storage, scope).length, 1)
  assert.match(words(h.render()), /Borrador guardado/)
  assert.equal(h.beforeUnload, false)
  h.reload(); await h.ready(); h.click('Historial (1)')
  h.click('HAB-PRUEBA-201', true); await new Promise(resolve => setImmediate(resolve))
  h.click('Finalizar revisión'); await new Promise(resolve => setImmediate(resolve))
  assert.equal(model.loadSandbox(h.storage, scope)[0].status, 'FINAL')
  assert.ok(nodes(h.render()).filter(n => n.props?.field).every(n => n.props.disabled))
  h.click('Rectificar')
  assert.match(words(h.render()), /Motivo de rectificación/)
  assert.ok(nodes(h.render()).filter(n => n.props?.field).every(n => !n.props.disabled))
})
test('formulario vacío informa del error y no simula que ha guardado', async () => {
  const h = harness(); await h.ready(); h.click('Guardar borrador'); await new Promise(resolve => setImmediate(resolve))
  assert.equal(model.loadSandbox(h.storage, scope).length, 0)
  assert.match(words(h.render()), /No se ha guardado/)
  assert.match(words(h.render()), /técnico responsable/)
})
test('semanal ya realizada oculta controles y desactiva guardar; historial y controles diarios accesibles', async () => {
  const legionella = bookDefinitions.find(b => b.id === 'legionella')
  const done = { ...model.createEntry(legionella, scope), status: 'FINAL', asset: 'Hotel', technician: 'Técnico', date: preventiveSchedule.hotelDay() }
  for (const f of legionella.fields.filter(f => f.frequency === 'S')) done.answers[f.id] = { value: 'V', note: '' }
  const h = harness(scope.userId, legionella, [done]); await h.ready()
  const selector = nodes(h.render()).find(n => n.type === 'select' && nodes(n).some(o => o.props?.value === 'S'))
  await selector.props.onChange({ target: { value: 'S' } })
  assert.equal(nodes(h.render()).filter(n => n.props?.field).length, 0)
  assert.match(words(h.render()), /Todavía no toca esta revisión. Próxima fecha/)
  assert.ok(nodes(h.render()).filter(n => n.type === 'button' && words(n).includes('Guardar borrador')).every(n => n.props.disabled))
  await selector.props.onChange({ target: { value: 'D' } })
  assert.equal(nodes(h.render()).filter(n => n.props?.field).length, 14)
  await h.click('Historial (1)')
  assert.match(words(h.render()), /Hotel/)
})
test('los controles del formulario generan HTML etiquetado, sin resultados preseleccionados', () => {
  const h = harness(); const tree = h.render()
  const html = renderToStaticMarkup(tree)
  assert.match(html, /ESTADO FILTRO/); assert.match(html, /DECIBELIOS V3/)
  assert.match(html, /Selecciona resultado/); assert.doesNotMatch(html, /value="V" selected/)
  assert.equal((html.match(/<label[^>]+for="book-field-/g) ?? []).length, b.fields.length * 2)
})

test('Escape respeta la cancelación al salir de una ficha sin guardar', () => {
  const target = new EventTarget(), navigation = []; let allowed = false
  const mod = { exports: {} }
  vm.runInNewContext(compile('src/shared/components/navigation/GlobalEscapeNavigation.tsx'), { module: mod, exports: mod.exports,
    window: target, document: { querySelector: () => null },
    require: name => name === 'react' ? { useEffect: fn => fn() } : name === 'react-router-dom' ? { useLocation: () => ({ pathname: '/registros-tecnicos/pruebas/fancoils' }), useNavigate: () => path => navigation.push(path) } : { canNavigateInSuite: () => allowed },
  })
  mod.exports.default()
  function escape() { const event = new Event('keydown', { cancelable: true }); event.key = 'Escape'; target.dispatchEvent(event) }
  escape(); assert.deepEqual(navigation, [])
  allowed = true; escape(); assert.deepEqual(navigation, [-1])
})

 test('el índice muestra 01-01 a 01-03 y las pantallas no exponen archivos ni celdas', async () => {
  const h = harness(); await h.ready()
  const index = words(h.index())
  for (const code of ['R-SSTT-01-01', 'R-SSTT-01-02', 'R-SSTT-01-03']) assert.ok(index.includes(code))
  assert.match(index, /Se mantienen los módulos actuales/)
  const content = index + words(h.notice()) + renderToStaticMarkup(h.render())
  assert.doesNotMatch(content, /Excel|\.xlsx|Referencia del Excel|SHA-256|Hoja1/i)
  assert.doesNotMatch(content, /Referencia del Excel/)
 })

test('PRUEBA puede previsualizar PDF sin guardar; guardar muestra error y no persiste', async () => {
  const h = harness(demoAccess.DEMO_USER_ID); await h.ready()
  const pdf = nodes(h.render()).find(n => n.type === 'button' && words(n).trim() === 'PDF de la ficha')
  assert.ok(pdf && !pdf.props.disabled)
  h.click('Guardar borrador'); await new Promise(resolve => setImmediate(resolve))
  assert.match(words(h.render()), /Usuario de prueba/)
  assert.equal(model.loadSandbox(h.storage, { ...scope, userId: demoAccess.DEMO_USER_ID }).length, 0)
})
