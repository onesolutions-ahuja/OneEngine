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


test('GPT Builder phase 2 implements Salesforce Start configuration and first-save semantics', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  for (const text of [
    'Configure Start',
    'Select Object',
    'Trigger the Flow When',
    'Set Entry Conditions',
    'When to Run the Flow for Updated Records',
    'Optimize the Flow for',
    'Fast Field Updates',
    'Actions and Related Records',
    'Set a Schedule',
    'Select Platform Event',
    'Flow Label',
    'Flow API Name',
    'How to Run the Flow',
  ]) assert.ok(page.includes(text), text)
  assert.match(page, /apiNameFromLabel\(label\)/)
  assert.match(page, /disabled=\{saved\}/)
  assert.match(page, /The API name can’t be edited after the flow is saved/)
  assert.match(page, /workflowId \? `\/api\/platform\/rules\//)
  assert.match(page, /method: workflowId \? 'PUT' : 'POST'/)
})

test('GPT Builder toolbar gates run debug and activate against the latest saved design', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /disabled=\{!workflowId \|\| dirty\}><Play/)
  assert.match(page, /disabled=\{!workflowId \|\| dirty\}><Eye/)
  assert.match(page, /disabled=\{!workflowId \|\| dirty \|\| issues\.some/)
  assert.match(page, /Errors and Warnings/)
  assert.match(page, /Unsaved changes/)
})
