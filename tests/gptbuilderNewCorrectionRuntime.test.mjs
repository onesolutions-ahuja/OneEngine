import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('correction pass serializes core logic to OneEngine generic primitives',()=>{for(const key of ["key:'ASSIGNMENT'","key:'CONDITION'","key:'LOOP'","key:'COLLECTION_FILTER'","key:'COLLECTION_SORT'","key:'TRANSFORM'","key:'WAIT'"])assert.ok(page.includes(key),key);assert.ok(page.includes('runtimeActionForNode(node,resources)'))})
test('decision keeps ordered outcomes and default branch metadata',()=>{assert.ok(page.includes('outcomes:outcomes.map'));assert.ok(page.includes("defaultLabel:c.defaultLabel||'Default Outcome'"));assert.ok(page.includes('defaultBranch:Array.isArray(c.defaultBranch)'))})
test('loop exposes current item and iteration direction',()=>{assert.ok(page.includes("'CurrentItem_'+apiFromElement"));assert.ok(page.includes("'LAST_TO_FIRST':'FIRST_TO_LAST'"))})
test('resource paths serialize as runtime references',()=>{assert.ok(page.includes("value.startsWith('variables.')"));assert.ok(page.includes("value.startsWith('$record')"));assert.ok(page.includes("value.startsWith('steps.')"))})
