import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('new builder is isolated from old builder modules',()=>{assert.ok(page.includes("from './GPTBuilderNewFormulaBuilder'"));assert.ok(!page.includes("from '../gptbuilder/"))})
test('resource rename uses token aware references',()=>{assert.ok(page.includes('escapeRegExp'));assert.ok(page.includes("'\\\\bvariables\\\\.'"));assert.ok(!page.includes("replaceAll(oldApi,newApi)"))})
test('Roll Back Records is exposed through the real generic runtime primitive',()=>{assert.ok(page.includes("['rollback','Roll Back Records']"));assert.ok(page.includes("key:'ROLLBACK_RECORDS'"))})
test('assignment supports multiple rows and loop exposes generated current item',()=>{assert.ok(page.includes('Add Assignment'));assert.ok(page.includes('generatedLoopResources'));assert.ok(page.includes("'Current Item from '+n.label"))})
test('nonfunctional templates and pixel notes do not contaminate functional parity state',()=>{assert.ok(!page.includes("parityAudit:{status:'SFDC BASELINE NOT CAPTURED'"));assert.ok(!page.includes("template:{baselineStatus:'SFDC BASELINE NOT CAPTURED'"));assert.ok(!page.includes('SFDC BASELINE NOT CAPTURED'))})
