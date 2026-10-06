import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('new builder is isolated from old builder modules',()=>{assert.ok(page.includes("from './GPTBuilderNewFormulaBuilder'"));assert.ok(!page.includes("from '../gptbuilder/"))})
test('resource rename uses token aware references',()=>{assert.ok(page.includes('escapeRegExp'));assert.ok(page.includes("'\\\\bvariables\\\\.'"));assert.ok(!page.includes("replaceAll(oldApi,newApi)"))})
test('unsupported Roll Back Records is not exposed as fake runtime',()=>{assert.ok(!page.includes("['rollback','Roll Back Records']"))})
test('assignment supports multiple rows and loop exposes generated current item',()=>{assert.ok(page.includes('Add Assignment'));assert.ok(page.includes('generatedLoopResources'));assert.ok(page.includes("'Current Item from '+n.label"))})
test('unknown Salesforce baselines stay explicitly unknown',()=>{assert.ok(page.includes("parityAudit:{status:'SFDC BASELINE NOT CAPTURED'"));assert.ok(page.includes("template:{baselineStatus:'SFDC BASELINE NOT CAPTURED'"))})
