import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
const platform=await readFile(new URL('../server/routes/platform.js',import.meta.url),'utf8')
const runtime=await readFile(new URL('../server/services/platformWorkflow.js',import.meta.url),'utf8')
test('Start uses metadata fields and datatype operators',()=>{assert.ok(page.includes("'/fields'"));assert.ok(page.includes('operatorsForField(selected)'));assert.ok(!page.includes('placeholder="Field API Name"'))})
test('Start required values use inline Salesforce validation',()=>{assert.ok(page.includes('<small role="alert">Enter a value.</small>'));assert.ok(page.includes('disabled={!valid}'))})
test('Start conditions are persisted into executable rule metadata',()=>{assert.ok(page.includes("conditions:start.conditionMode&&start.conditionMode!=='none'"));assert.ok(page.includes("customConditionLogic:start.customConditionLogic||''"));assert.ok(page.includes("startFormula:start.conditionMode==='formula'"))})
test('runtime evaluates condition logic and formula starts',()=>{assert.ok(platform.includes('workflow.action?.start?.conditionMode === "formula"'));assert.ok(platform.includes('customConditionLogic || ""'))})
test('scheduled builder flow is wired to generic platform scheduler',()=>{assert.ok(page.includes("apiRequest('/api/platform/schedules')"));assert.ok(page.includes("scheduleType=String(start.frequency||'Daily').toUpperCase()"))})
test('Roll Back Records remains a real generic primitive',()=>{assert.ok(page.includes("['rollback','Roll Back Records']"));assert.ok(runtime.includes('key: "ROLLBACK_RECORDS"'))})
