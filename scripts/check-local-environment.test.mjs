import test from 'node:test'
import assert from 'node:assert/strict'
import { isLocalSupabaseUrl } from './check-local-environment.mjs'

test('acepta los endpoints locales habituales', () => {
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321']) assert.equal(isLocalSupabaseUrl(url), true)
})
test('rechaza Supabase alojado y hosts que imitan localhost', () => {
  for (const url of ['https://eqxcuwrfestwqelnucmv.supabase.co', 'http://localhost.example.com:54321', 'http://127.0.0.1.example.com', 'http://example.com']) assert.equal(isLocalSupabaseUrl(url), false)
})
test('rechaza URL con credenciales, redirecciones y protocolos no HTTP', () => {
  for (const url of ['http://user:password@localhost:54321', 'http://localhost:54321/?redirect=https://example.com', 'file:///tmp/database', '', undefined]) assert.equal(isLocalSupabaseUrl(url), false)
})
