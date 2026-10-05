import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), clear: () => values.clear() }
}
globalThis.localStorage = storage()
globalThis.sessionStorage = storage()
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail } }
globalThis.window = { location: { origin: 'https://app.test', hostname: 'app.test' }, dispatchEvent() {}, setTimeout, clearTimeout }
globalThis.testRoute = { app: 'till' }
let developerSource = await readFile(new URL('../src/services/developerContext.js', import.meta.url), 'utf8')
developerSource = developerSource.replace(/import .*\r?\n/, 'const readRoute = () => globalThis.testRoute\n')
const developer = await import(`data:text/javascript;base64,${Buffer.from(developerSource).toString('base64')}`)
globalThis.developerMetadataHeaders = developer.developerMetadataHeaders
let source = await readFile(new URL('../src/services/api.js', import.meta.url), 'utf8')
source = source.replace(/\r\n/g, '\n').replace(/^import .*$/gm, '').replace('import.meta.env.VITE_API_BASE', "'https://api.test'")
source = `const developerMetadataHeaders = globalThis.developerMetadataHeaders; const clearLazyCache = async () => {}; const validateTrustedRuntime = () => ({}); const isPrivilegedMutation = () => false; const resolveTrustedCapability = () => null; const trustedRuntimeHeaders = () => ({});\n${source}`
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const requests = []
let stores = []
let serverPermissions = []
globalThis.fetch = async (url, options) => {
  requests.push({ url, options })
  const body = url.endsWith('/login') ? { success: true, token: 'token', user: { id: 'u', company_id: 'home' }, permissions: { permissions: serverPermissions }, stores, actingCompanyId: 'other' }
    : url.includes('/me/permissions') ? { data: { permissions: serverPermissions } }
    : url.endsWith('/bootstrap') ? { user: { id: 'u', company_id: 'home' }, stores, permissions: { permissions: serverPermissions } }
    : url.endsWith('/me') ? { user: { id: 'u', company_id: 'home' } } : { data: stores }
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

test('forced permission checks refresh both stale denials and revoked grants', async () => {
  sessionStorage.setItem('onepos_token', 'token')
  api.setStoredSessionPermissions({ permissions: [] })
  serverPermissions = ['oneengine.manage']
  assert.deepEqual((await api.loadSessionPermissions()).permissions, [])
  assert.deepEqual((await api.loadSessionPermissions({ force: true })).permissions, ['oneengine.manage'])
  serverPermissions = []
  assert.deepEqual((await api.loadSessionPermissions({ force: true })).permissions, [])
  assert.deepEqual(api.getStoredSessionPermissions().permissions, [])
})

test('complete cached session context avoids duplicate bootstrap, stores and permission requests', async () => {
  sessionStorage.clear()
  localStorage.clear()
  requests.length = 0
  sessionStorage.setItem('onepos_token', 'token')
  sessionStorage.setItem('onepos_user', JSON.stringify({ id: 'u', companyId: 'home', storeId: 's1' }))
  sessionStorage.setItem(api.AVAILABLE_STORES_STORAGE_KEY, JSON.stringify([{ id: 's1', company_id: 'home', is_primary: true }]))
  api.setStoredSessionPermissions({ permissions: ['oneengine.manage'] })
  localStorage.setItem(api.ACTIVE_STORE_STORAGE_KEY, 's1')

  assert.equal(api.hasSessionContext(), true)
  assert.equal(await api.ensureActingCompanyContext(), 'home')
  assert.equal((await api.ensureActiveStoreContext()).activeStoreId, 's1')
  assert.deepEqual((await api.loadSessionPermissions()).permissions, ['oneengine.manage'])
  assert.equal(requests.length, 0)
})

test('normal requests ignore remembered and supplied acting-company context', async () => {
  api.setActingCompanyId('other')
  sessionStorage.setItem(api.SESSION_PERMISSIONS_STORAGE_KEY, JSON.stringify({ permissions: ['oneengine.manage'] }))
  for (const app of ['till', 'workspace', 'dashboard', 'settings']) {
    globalThis.testRoute = { app }
    await api.apiFetch('/api/platform/objects', { headers: { 'x-acting-company-id': 'other' } })
    await api.apiRequest('/api/platform/objects', { headers: new Headers({ 'X-Acting-Company-Id': 'other' }) })
    for (const request of requests.slice(-2)) assert.equal(request.options.headers['X-Acting-Company-Id'], undefined)
  }
  globalThis.testRoute = { app: 'developer', section: 'objects' }
  await api.apiRequest('/api/platform/objects')
  assert.equal(requests.at(-1).options.headers['X-Acting-Company-Id'], 'other')
  await api.apiRequest('/api/auth/me/stores')
  assert.equal(requests.at(-1).options.headers['X-Acting-Company-Id'], undefined)
})

test('login and refresh use company binding and permitted stores', async () => {
  globalThis.testRoute = { app: 'till' }
  stores = [{ id: 'only', company_id: 'home' }, { id: 'foreign', company_id: 'other' }]
  localStorage.setItem(api.ACTIVE_STORE_STORAGE_KEY, 'foreign')
  const result = await api.login('user', 'password')
  assert.equal(result.user.companyId, 'home')
  assert.equal(api.getActiveStoreId(), 'only')
  assert.equal(JSON.parse(requests.find(r => r.url.endsWith('/login')).options.body).actingCompanyId, undefined)
  api.setActingCompanyId('other')
  sessionStorage.setItem('onepos_user', JSON.stringify({ id: 'u', companyId: 'other' }))
  assert.equal(await api.ensureActingCompanyContext({ force: true }), 'home')
  assert.equal(api.getStoredUser().companyId, 'home')
  stores = [{ id: 'a', is_primary: true }, { id: 'b' }]
  localStorage.setItem(api.ACTIVE_STORE_STORAGE_KEY, 'b')
  await api.ensureActiveStoreContext({ force: true })
  assert.equal(api.getActiveStoreId(), 'b')
  localStorage.setItem(api.ACTIVE_STORE_STORAGE_KEY, 'foreign')
  await api.ensureActiveStoreContext()
  assert.equal(api.getActiveStoreId(), 'a')
  api.setActiveStoreId('foreign')
  assert.equal(api.getActiveStoreId(), '')
  api.logout()
  assert.deepEqual(api.getAvailableStores(), [])
  assert.equal(api.getActingCompanyId(), '')
})

test('OAuth clears old contexts and hydrates the company-bound user', async () => {
  sessionStorage.setItem('onepos_user', JSON.stringify({ id: 'old', companyId: 'other' }))
  sessionStorage.setItem(api.AVAILABLE_STORES_STORAGE_KEY, JSON.stringify([{ id: 'foreign' }]))
  api.setActingCompanyId('other')
  window.location.hash = '#google_token=oauth-token'
  window.location.pathname = '/'
  window.location.search = ''
  window.history = { replaceState() {} }
  assert.equal(api.consumeGoogleOAuthCallback().token, 'oauth-token')
  assert.equal(api.getActingCompanyId(), '')
  assert.deepEqual(api.getAvailableStores(), [])
  stores = [{ id: 'home-store' }]
  assert.equal(await api.ensureActingCompanyContext(), 'home')
  assert.equal(api.getActiveStoreId(), 'home-store')
  globalThis.testRoute = { app: 'developer', section: 'objects' }
  api.setActingCompanyId('other')
  sessionStorage.setItem(api.SESSION_PERMISSIONS_STORAGE_KEY, JSON.stringify({ permissions: ['platform.manage'] }))
  await api.apiRequest('/api/platform/objects')
  assert.equal(requests.at(-1).options.headers['X-Acting-Company-Id'], undefined)
})
