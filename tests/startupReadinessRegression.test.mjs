import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('Render listener binds only after core runtime readiness is set', () => {
  const source = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8')
  const start = source.indexOf('async function startServer')
  const ready = source.indexOf('state: "ready"', start)
  const bind = source.indexOf('app.listen(PORT, "0.0.0.0")', start)
  const packageReady = source.indexOf('package catalogue ready', start)
  assert.ok(start >= 0)
  assert.ok(packageReady > start)
  assert.ok(ready > packageReady)
  assert.ok(bind > ready, 'HTTP listener must not expose an OESB01 instance before core readiness')
  assert.equal(source.slice(start, ready).includes('app.listen(PORT, "0.0.0.0")'), false)
})

test('custom report access helpers exist before routes use them', () => {
  const source = fs.readFileSync(new URL('../server/routes/reports.js', import.meta.url), 'utf8')
  const firstRoute = source.indexOf('router.get("/reports/custom/report-types"')
  for (const helper of [
    'const canManageReports = async',
    'const canManageReportTypes = async',
    'const reportTypeIsVisible = async',
    'async function visibleFolder',
    'async function filterReportsByFolderAccess',
  ]) {
    const index = source.indexOf(helper)
    assert.ok(index >= 0, helper + ' is missing')
    assert.ok(index < firstRoute, helper + ' must be initialized before route handlers can invoke it')
  }
})
