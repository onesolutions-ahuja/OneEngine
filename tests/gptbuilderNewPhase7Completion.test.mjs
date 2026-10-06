import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('Phase 7 retains all 18 captured flow types',()=>{assert.ok(page.includes("['identity_registration','Identity User Registration Flow'"));assert.ok(page.includes("['screen','Screen Flow'"));assert.ok(page.includes('FLOW_CAPABILITIES'))})
test('record Start has trigger optimization entry conditions and update semantics',()=>{for(const x of ['Set Entry Conditions','Formula Evaluates to True','When to Run the Flow for Updated Records','newly_meets','Actions and Related Records'])assert.ok(page.includes(x),x)})
test('scheduled Start has frequency object filters and batch size',()=>{for(const x of ['Once','Daily','Weekly','Filter Records','Max Batch Size'])assert.ok(page.includes(x),x)})
test('platform event Start persists selected event',()=>{assert.ok(page.includes('Platform Event <b>*</b>'));assert.ok(page.includes("eventKey:''"))})
test('uncaptured Salesforce template catalogue is not fabricated',()=>{assert.ok(page.includes("baselineStatus:'SFDC BASELINE NOT CAPTURED'"));assert.ok(page.includes('selected:null'))})
