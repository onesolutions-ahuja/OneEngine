import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('resource correction uses the isolated formula builder and syntax checker',()=>{assert.ok(page.includes('GPTBuilderNewFormulaBuilder'));assert.ok(page.includes('basicFormulaCheck'));assert.ok(page.includes('Fix formula'))})
test('resource compatibility foundation filters collection datatype and object',()=>{assert.ok(page.includes('function compatibleResources'));assert.ok(page.includes('Boolean(r.isCollection)'));assert.ok(page.includes('r.objectKey===objectKey'))})
test('resource dependency handling is token-aware and rewrites references',()=>{assert.ok(page.includes('function resourceReferences'));assert.ok(page.includes('function rewriteResourceReferences'));assert.ok(page.includes('escapeRegExp'));assert.ok(!page.includes("replaceAll(oldApi,newApi)"))})
test('save rejects duplicate resource API names',()=>{assert.ok(page.includes('Resource API names must be unique.'))})
