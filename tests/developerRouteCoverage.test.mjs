import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('every Developer surface has a fixed direct route', async () => {
  const developer = await readFile(new URL('../src/pages/developer/OneDeveloperPage.jsx', import.meta.url), 'utf8')
  const routes = await readFile(new URL('../src/navigation/routes.js', import.meta.url), 'utf8')

  const itemBlock = developer.match(/const DEVELOPER_ITEMS = \[([\s\S]*?)\n\]/)?.[1] || ''
  const routeBlock = routes.match(/DEVELOPER_SETTINGS_KEYS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || ''
  const itemKeys = [...itemBlock.matchAll(/key:\s*'([^']+)'/g)].map((match) => match[1])
  const routeKeys = new Set([...routeBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]))

  assert.ok(itemKeys.length > 0, 'Developer item list must be discoverable')
  const missing = itemKeys.filter((key) => !routeKeys.has(key))
  assert.deepEqual(missing, [], `Developer routes missing from fixed route registry: ${missing.join(', ')}`)
})
