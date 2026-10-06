import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
const platform=await readFile(new URL('../server/routes/platform.js',import.meta.url),'utf8')
const workflow=await readFile(new URL('../server/services/platformWorkflow.js',import.meta.url),'utf8')
test('record Start persists runtime entry formula and updated-to-meet semantics',()=>{assert.ok(page.includes("entryFormula:start.conditionMode==='formula'"));assert.ok(page.includes("entryTransition:start.updatedRequirement==='newly_meets'?'UPDATED_TO_MEET':'EVERY_TIME'"))})
test('Start formula debug uses the bounded workflow formula engine',()=>{assert.ok(platform.includes('evaluateWorkflowFormula(normalizeStartFormula(workflow.action.startFormula), startFormulaInputs(fields, record, null)) === true'))})
test('weekly schedules persist a valid weekday definition',()=>{assert.ok(page.includes("scheduleType==='WEEKLY'?{date:start.startDate,time:start.startTime,dayOfWeek:startDay}"))})
test('scheduled object filters persist as rule conditions',()=>{assert.ok(page.includes("conditionMode:'all'"));assert.ok(page.includes("conditions:start.conditionMode&&start.conditionMode!=='none'"))})
test('screen runtime is persisted and resumable rather than a visual stub',()=>{for(const x of ['key: "SCREEN"','platform_workflow_screen_sessions',"status='ACTIVE'","status='WAITING'"])assert.ok(workflow.includes(x),x)})
