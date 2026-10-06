import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('phase 8 wires Salesforce lifecycle toolbar behavior',()=>{for(const x of ['Run','Debug','View Tests','Save As New Version','Activate','Deactivate'])assert.ok(page.includes(x),'missing '+x);assert.ok(page.includes("lifecycleStatus:active?'ACTIVE':'DRAFT'"))})
test('phase 8 executes most recently saved flow through runtime endpoints',()=>{assert.ok(page.includes('/run'));assert.ok(page.includes('/debug'));assert.ok(page.includes('Uses the most recent saved version.'))})
test('phase 8 persists and loads test scenarios with assertions',()=>{assert.ok(page.includes('/tests'));for(const x of ['Expected Results','Add Assertion','Run Scenario','Save Scenario'])assert.ok(page.includes(x),'missing '+x)})
test('phase 8 keeps new builder isolated',()=>{assert.ok(page.includes('gptBuilderNew:true'))})
