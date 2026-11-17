import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as router from 'react-router-dom'
import { suiteAreas, suiteLinks, shortcutCatalog, hubs, normalizeFavorites, defaultFavorites,
  favoriteStorageKey, areaForPath, breadcrumbsForPath } from '../src/shared/navigation/suiteNavigation.ts'

const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const jsx = await import('react/jsx-runtime')
const mockPages = new Map()
function loadApp() {
  const mod = { exports: {} }
  vm.runInNewContext(compile('src/App.tsx'), { module: mod, exports: mod.exports,
    require: name => {
      if (name === 'react/jsx-runtime') return jsx
      if (name === 'react-router-dom') return { ...router, useLocation: () => ({ pathname: '/' }) }
      if (!mockPages.has(name)) mockPages.set(name, function MockPage() { return null })
      return { __esModule: true, default: mockPages.get(name) }
    },
  })
  const root = mod.exports.default()
  const routes = root.props.children.find(child => child?.type === router.Routes)
  return router.createRoutesFromElements(routes.props.children)
}
const routes = loadApp()

test('todos los destinos del menú, favoritos y hubs existen y mantienen las dos capas de acceso', () => {
  for (const link of [...suiteAreas, ...suiteLinks, ...Object.values(hubs)]) {
    const matches = router.matchRoutes(routes, link.href)
    assert.ok(matches, link.href)
    const elements = matches.map(match => match.route.element?.type)
    assert.ok(elements.includes(mockPages.get('./features/auth/components/ProtectedRoute')), link.href)
    assert.ok(elements.includes(mockPages.get('./shared/navigation/SuiteLayout')), link.href)
  }
})
test('las rutas públicas de sesión y fichaje no reciben el menú interno', () => {
  for (const path of ['/login', '/activate', '/forgot-password', '/update-password', '/fichaje', '/mi-horario']) {
    const elements = router.matchRoutes(routes, path).map(match => match.route.element?.type)
    assert.ok(!elements.includes(mockPages.get('./shared/navigation/SuiteLayout')), path)
  }
})
test('los enlaces antiguos siguen resolviendo y las redirecciones conservan filtros y anclas', () => {
  for (const path of ['/maintenance/room-projects', '/maintenance/fancoil-preventives', '/fancoils', '/maintenance/audit', '/pam'])
    assert.ok(router.matchRoutes(routes, path), path)
  assert.equal(router.matchRoutes(routes, '/fancoils').at(-1).route.element.props.to, '/registros-tecnicos/libros/fancoils')
  assert.equal(router.matchRoutes(routes, '/registros-tecnicos/anteriores/fancoils').at(-1).route.element.type, mockPages.get('./features/fancoils/pages/FancoilsPage'))
  const mod = { exports: {} }
  vm.runInNewContext(compile('src/shared/navigation/LegacyRedirect.tsx'), { module: mod, exports: mod.exports,
    require: name => name === 'react/jsx-runtime' ? jsx : { ...router, useLocation: () => ({ search: '?status=PENDING', hash: '#rooms' }) },
  })
  const element = mod.exports.default({ to: '/maintenance/proyectos/led-armario' })
  assert.deepEqual(JSON.parse(JSON.stringify(element.props.to)), { pathname: '/maintenance/proyectos/led-armario', search: '?status=PENDING', hash: '#rooms' })
  assert.equal(element.props.replace, true)
})
test('proyectos, preventivos, controles y personal tienen familias y migas coherentes', () => {
  const cases = [['/maintenance/proyectos/led-armario', 'maintenance'], ['/maintenance/preventivos/fancoils', 'maintenance'],
    ['/pools', 'records'], ['/fancoils', 'records'], ['/maintenance/record', 'records'], ['/electricalpanels/123', 'records'],
    ['/apparatusregistry/123', 'equipment'], ['/maintenance/structure', 'equipment'], ['/materials', 'materials'],
    ['/providers', 'companies'], ['/planificador-horario', 'people'], ['/registro-jornada', 'people'], ['/reports', 'documents']]
  for (const [path, area] of cases) assert.equal(areaForPath(path), area, path)
  assert.deepEqual(breadcrumbsForPath('/maintenance/proyectos/led-armario').map(item => item.label), ['Mantenimiento', 'Proyectos y mejoras', 'LED de armario'])
  assert.deepEqual(breadcrumbsForPath('/maintenance/preventivos/fancoils').map(item => item.label), ['Mantenimiento', 'Preventivos', 'Preventivos de fancoils'])
})
test('favoritos: elimina duplicados y destinos desconocidos, respeta vacío y limita a ocho', () => {
  assert.deepEqual(normalizeFavorites(['led', 'led', 'unknown', null, 'schedule']), ['led', 'schedule'])
  assert.deepEqual(normalizeFavorites([]), [])
  assert.deepEqual(normalizeFavorites(null), defaultFavorites)
  assert.equal(normalizeFavorites(shortcutCatalog.map(item => item.id)).length, 8)
  assert.equal(new Set(shortcutCatalog.map(item => item.id)).size, shortcutCatalog.length)
})
test('la selección de accesos distingue usuarios, hoteles y delimitadores', () => {
  const keys = [favoriteStorageKey('a', 'b'), favoriteStorageKey('b', 'a'), favoriteStorageKey('a:b', 'c'), favoriteStorageKey('a', 'b:c')]
  assert.equal(new Set(keys).size, keys.length)
})
test('iconos y referencias de los hubs apuntan a recursos reales', () => {
  for (const item of [...suiteAreas, ...suiteLinks]) assert.ok(fs.existsSync('public' + item.icon), item.icon)
  for (const hub of Object.values(hubs))
    for (const id of [...hub.links, ...(hub.related ?? [])]) assert.ok(shortcutCatalog.some(link => link.id === id), id)
})
test('el menú respeta la cancelación de navegación por cambios sin guardar', () => {
  let cleanup
  let accept = false
  const target = new EventTarget()
  target.confirm = () => accept
  const mod = { exports: {} }
  vm.runInNewContext(compile('src/shared/hooks/useBeforeUnloadGuard.ts'), { module: mod, exports: mod.exports, window: target,
    require: name => name === 'react' ? { useEffect: fn => { cleanup = fn() } } : { SUITE_NAVIGATION_EVENT: 'arias:before-navigate' },
  })
  mod.exports.useBeforeUnloadGuard(true)
  assert.equal(target.dispatchEvent(new Event('arias:before-navigate', { cancelable: true })), false)
  accept = true
  assert.equal(target.dispatchEvent(new Event('arias:before-navigate', { cancelable: true })), true)
  cleanup()
  accept = false
  assert.equal(target.dispatchEvent(new Event('arias:before-navigate', { cancelable: true })), true)
})

test('Mis accesos permite quitar, recargar y separar selecciones sin tocar datos del hotel', () => {
  const storage = new Map()
  let currentKey = favoriteStorageKey('user-a', 'hotel-a')
  let state = [], cursor = 0
  const navigation = { suiteAreas, shortcutCatalog, defaultFavorites, normalizeFavorites }
  const mod = { exports: {} }
  vm.runInNewContext(compile('src/shared/navigation/HomeFavorites.tsx'), { module: mod, exports: mod.exports,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    require: name => name === 'react' ? { useState: initial => {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    } } : name === 'react/jsx-runtime' ? jsx : name === './suiteNavigation' ? navigation : {},
  })
  const render = () => { cursor = 0; return mod.exports.default({ storageKey: currentKey }) }
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const remove = label => nodes(render()).find(node => node.props?.['aria-label'] === label).props.onClick()
  remove('Quitar LED de armario de Mis accesos')
  assert.deepEqual(JSON.parse(storage.get(currentKey)), ['fancoils', 'records', 'schedule'])
  state = []
  assert.ok(!nodes(render()).some(node => node.props?.['aria-label'] === 'Abrir LED de armario'))
  currentKey = favoriteStorageKey('user-a', 'hotel-b'); state = []
  assert.ok(nodes(render()).some(node => node.props?.['aria-label'] === 'Abrir LED de armario'))
  for (const label of ['LED de armario', 'Preventivos de fancoils', 'Registros técnicos', 'Planificador horario']) remove('Quitar ' + label + ' de Mis accesos')
  assert.deepEqual(JSON.parse(storage.get(currentKey)), [])
  state = []
  assert.ok(!nodes(render()).some(node => node.props?.['aria-label']?.startsWith('Abrir ')))
})

test('Registros técnicos abre cada libro directamente y conserva piscina, SPA y los registros anteriores', async () => {
  const { technicalBookRecords } = await import('../src/features/technicalbooks/bookLinks.ts')
  const { bookDefinitions } = await import('../src/features/technicalbooks/bookDefinitions.ts')
  const destinations = new Set(technicalBookRecords.map(record => record[3]))
  for (const book of bookDefinitions) assert.ok(destinations.has('/registros-tecnicos/libros/' + book.id), book.id)
  for (const [, , icon, path] of technicalBookRecords) {
    assert.ok(fs.existsSync('public/assets/record-icons-3d/' + icon + '.webp'), icon)
    const matches = router.matchRoutes(routes, path)
    assert.equal(matches.at(-1).route.element.type, mockPages.get('./features/technicalbooks/TechnicalBooksRoute'), path)
    assert.ok(matches.some(match => match.route.element?.type === mockPages.get('./features/auth/components/ProtectedRoute')), path)
  }
  assert.ok(!destinations.has('/registros-tecnicos/libros/piscina'))
  const renderRecords = path => {
    const mod = { exports: {} }
    vm.runInNewContext(compile('src/features/maintenance/pages/MaintenanceRecordsPage.tsx'), { module: mod, exports: mod.exports,
      require: name => name === 'react/jsx-runtime' ? jsx : name === 'react-router-dom' ? { Link: router.Link, useNavigate: () => () => {}, useLocation: () => ({ pathname: path }) } : name === '../../technicalbooks/bookLinks' ? { technicalBookRecords } : {},
    })
    return mod.exports.default()
  }
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const main = nodes(renderRecords('/registros-tecnicos'))
  const previous = nodes(renderRecords('/registros-tecnicos/anteriores'))
  for (const title of ['Piscina exterior', 'Piscina SPA', 'Preventivo diario']) {
    const label = 'Abrir registro de ' + title
    assert.ok(main.some(n => n.props?.['aria-label'] === label))
    assert.ok(previous.some(n => n.props?.['aria-label'] === label))
  }
  for (const book of bookDefinitions) assert.ok(main.some(n => n.props?.['aria-label'] === 'Abrir registro de ' + book.title), book.id)
  assert.ok(previous.some(n => n.props?.['aria-label'] === 'Abrir registro de PCI'))
  assert.ok(router.matchRoutes(routes, '/registros-tecnicos/pruebas/fancoils'))
})
