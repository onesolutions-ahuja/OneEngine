import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('metadata workspace renders cached rows before background record synchronization completes', async () => {
  const source = await read('../src/pages/workspace/WorkspacePage.jsx')
  assert.match(source, /hasCachedSnapshot/)
  assert.match(source, /applyRows\(cachedRows\)[\s\S]*setLoadingRows\(false\)[\s\S]*void syncWorkspaceRecordCache/)
})

test('record history loads only after the History tab is selected', async () => {
  const source = await read('../src/pages/workspace/WorkspacePage.jsx')
  assert.match(source, /detailTab !== 'history'/)
  assert.match(source, /\[selectedId, selectedKey, detailTab\]/)
})

test('Express route modules that instantiate Router import express explicitly', async () => {
  const routesDir = fileURLToPath(new URL('../server/routes/', import.meta.url))
  for (const entry of await readdir(routesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const file = join(routesDir, entry.name)
    const source = await readFile(file, 'utf8')
    if (!/\bexpress\.Router\s*\(/.test(source)) continue
    assert.match(source, /import\s+express\s+from\s+["']express["']/, entry.name)
  }
})
