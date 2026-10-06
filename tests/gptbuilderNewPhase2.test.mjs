import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx', import.meta.url), 'utf8')

test('phase 2 supports Auto-Layout and Freeform without touching legacy builder', () => {
  assert.match(page, />Auto-Layout</)
  assert.match(page, />Freeform</)
  assert.match(page, /layout==='free'\?'FREE_FORM':'AUTO'/)
})

test('phase 2 provides core canvas editing operations', () => {
  for (const token of ['addNode','deleteSelected','copySelected','paste','undo','redo','beginConnect','finishConnect','startDrag','moveDrag'])
    assert.ok(page.includes(token), `missing canvas operation: ${token}`)
})

test('phase 2 persists nodes, positions and connectors as workflow metadata', () => {
  assert.match(page, /gptBuilderElements:nodes\.map/)
  assert.match(page, /goToConnections:edges\.map/)
  assert.match(page, /position/)
})

test('phase 2 exposes audited element picker inventory for later configuration phases', () => {
  for (const label of ['Screen','Action','Subflow','Assignment','Decision','Loop','Transform','Collection Sort','Collection Filter','Wait for Conditions','Wait for Amount of Time','Wait Until Date','Create Records','Update Records','Get Records','Delete Records','Roll Back Records'])
    assert.ok(page.includes(label), `missing element picker entry: ${label}`)
})
