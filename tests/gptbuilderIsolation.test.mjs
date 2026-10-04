import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('GPT Builder is isolated from the existing Workflow Builder implementation', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /Builder2|OneBuilder|builder2Model|builder2Runtime/)
  assert.match(page, /GPT Builder/)
})

test('OneDeveloper exposes GPT Builder as a separate developer section', async () => {
  const developer = await readFile(new URL('../src/pages/developer/OneDeveloperPage.jsx', import.meta.url), 'utf8')
  assert.match(developer, /key: 'gptbuilder'/)
  assert.match(developer, /current\.key === 'gptbuilder' \? <GPTBuilderPage/)
})
