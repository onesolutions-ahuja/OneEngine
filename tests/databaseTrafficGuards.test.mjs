import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('routine health endpoint does not query PostgreSQL', () => {
  const source = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8')
  const start = source.indexOf('app.get("/api/health"')
  const end = source.indexOf('app.get("/api/health/deep"', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const health = source.slice(start, end)
  assert.equal(/await\s+db\s*\(/.test(health), false)
  assert.equal(/platformBootstrapIsCurrent\s*\(/.test(health), false)
  assert.equal(/verifyPublicPackageRegistry\s*\(/.test(health), false)
})

test('connectivity polling is hidden-tab aware and defaults to at least two minutes', () => {
  const source = fs.readFileSync(new URL('../src/services/connectivity.js', import.meta.url), 'utf8')
  assert.match(source, /intervalMs\s*=\s*120000/)
  assert.match(source, /document\.visibilityState\s*===\s*'visible'/)
  assert.match(source, /visibilitychange/)
})

test('platform job worker no longer polls every five seconds by default', () => {
  const source = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8')
  assert.match(source, /PLATFORM_JOB_POLL_MS\s*\|\|\s*60_000/)
  assert.doesNotMatch(source, /setInterval\(drain,\s*5000\)/)
})
