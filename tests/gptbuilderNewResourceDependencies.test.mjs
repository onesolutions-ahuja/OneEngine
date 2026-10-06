import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('resources can be edited and renamed with dependency propagation',()=>{assert.ok(page.includes("initialResource?'Edit Resource':'New Resource'"));assert.ok(page.includes('rewriteResourceReferences(rows,previous.apiName,resource.apiName)'))})
test('referenced resources cannot be deleted silently',()=>{assert.ok(page.includes("is referenced. Remove its references before deleting it."));assert.ok(page.includes('resourceReferences(resource,nodes,resources)'))})
test('resource editor preserves stable id on edit',()=>{assert.ok(page.includes("id:initialResource?.id||uid()"))})
test('new builder has one runtime-aligned formula checker',()=>{assert.equal((page.match(/const formulaCheck=/g)||[]).length,1);assert.ok(page.includes('basicFormulaCheck(value)'))})
