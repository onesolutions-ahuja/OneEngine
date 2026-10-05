import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('desktop navigation does not force permission reloads for privileged apps', async () => {
  const source = await read('../src/App.jsx')
  assert.equal(source.includes("loadSessionPermissions({ force: requiresEnginePermission"), false)
  assert.match(source, /loadSessionPermissions\(\{ force: permissionRetry > 0/)
})

test('developer content is not blocked by client discovery', async () => {
  const source = await read('../src/pages/developer/OneDeveloperPage.jsx')
  assert.equal(source.includes('Resolving client context…'), false)
  assert.equal(source.includes("clientsLoading ? <div className=\"settings-state-card\""), false)
})

test('session bootstrap preserves cached context and hydrates permissions in one round trip', async () => {
  const client = await read('../src/services/api.js')
  const server = await read('../server/server.js')
  assert.match(client, /export function hasSessionContext\(\)/)
  assert.match(client, /if \(!force && hasSessionContext\(\)\) return existingCompanyId/)
  assert.match(server, /app\.get\("\/api\/auth\/bootstrap"/)
  assert.match(server, /permissions: \{ permissions \}/)
})

test('settings navigation uses its scoped session cache', async () => {
  const source = await read('../src/services/settings.js')
  assert.match(source, /loadSettingsContext\(\{ force = false \} = \{\}\)/)
  assert.match(source, /const cachedContext = !force \? readSettingsContextCache\(\) : null/)
  assert.match(source, /if \(cachedContext\) return cachedContext/)
})


test('shared API client deduplicates concurrent GET loaders by session context', async () => {
  const source = await read('../src/services/api.js')
  assert.match(source, /const apiRequestInFlight = new Map\(\)/)
  assert.match(source, /method === 'GET'.*options\.dedupe !== false/)
  assert.match(source, /apiRequestInFlight\.get\(key\)/)
})

test('login resolves central and tenant identity reads in parallel', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const \[centralIdentity, tenantIdentity\] = await Promise\.all/)
  assert.equal(source.includes('const centralIdentity = await pool.query(identitySql'), false)
})

test('session bootstrap resolves identity and RBAC reads in parallel', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const \[result, rolePermissions, permissionSets\] = await Promise\.all/)
})
