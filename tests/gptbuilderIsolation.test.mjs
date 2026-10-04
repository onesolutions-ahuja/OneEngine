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


test('GPT Builder phase 2 shell follows Salesforce flow-creation and canvas chrome rules', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  for (const text of ['New Automation','Start From Scratch','Use a Template','Record-Triggered Flow','Screen Flow','Autolaunched Flow (No Trigger)','Schedule-Triggered Flow','Platform Event-Triggered Flow','Auto-Layout','Free-Form','Canvas zoom']) assert.ok(page.includes(text), text)
  assert.match(page, /aria-label="Start"/)
  assert.match(page, /aria-label="Add element"/)
  assert.match(page, />End</)
})

test('GPT Builder keeps auto-layout and free-form toolbox behavior separate', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /layout === 'free' \? <button/)
  assert.match(page, /layout === 'auto' \? 'manager' : tab/)
  assert.match(page, /setToolboxOpen/)
})
