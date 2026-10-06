import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx', import.meta.url), 'utf8')
const developer = await readFile(new URL('../src/pages/developer/OneDeveloperPage.jsx', import.meta.url), 'utf8')
const routes = await readFile(new URL('../src/navigation/routes.js', import.meta.url), 'utf8')

test('GPT Builder New remains isolated from current GPT Builder', () => {
  assert.match(developer, /GPTBuilderPage/)
  assert.match(developer, /GPTBuilderNewPage/)
  assert.match(routes, /'gptbuildernew'/)
})

test('phase 1 contains all 18 audited Salesforce automation types', () => {
  for (const label of [
    'Screen Flow','Record-Triggered Flow','Schedule-Triggered Flow','Platform Event—Triggered Flow',
    'Autolaunched Flow (No Trigger)','Automation Event-Triggered Flow','User Provisioning Flow',
    'Contact Request Flow','Cart Async Flow','Recommendation Strategy','Autolaunched Orchestration (No Trigger)',
    'Record-Triggered Orchestration','Evaluation Flow','Flow Orchestration for CMS',
    'Individual-Object Linking Flow','Autolaunched Flow Approval Process (No Trigger)',
    'Record-Triggered Flow Approval Process','Identity User Registration Flow',
  ]) assert.ok(page.includes(label), `missing flow type: ${label}`)
})

test('phase 1 wires Start to OneEngine metadata and draft persistence', () => {
  assert.match(page, /apiRequest\('\/api\/platform\/objects'\)/)
  assert.match(page, /apiRequest\('\/api\/platform\/event-types'\)/)
  assert.match(page, /\/api\/platform\/rules/)
  assert.match(page, /gptBuilderNew:true/)
  assert.match(page, /lifecycleStatus:active\?'ACTIVE':'DRAFT'/)
  assert.match(page, /triggerKey:triggerKey/)
})
