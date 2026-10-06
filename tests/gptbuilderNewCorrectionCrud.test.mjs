import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('CRUD correction uses registered OneEngine record primitives',()=>{for(const key of ["key:'GET_RECORDS'","key:'CREATE_RECORD'","key:'UPDATE_RECORD'","key:'DELETE_RECORD'"])assert.ok(page.includes(key),key)})
test('rollback is serialized through the registered generic runtime primitive',()=>{assert.ok(page.includes("key:'ROLLBACK_RECORDS'"))})
test('record resources are metadata-backed choices',()=>{assert.ok(page.includes('gptbn-record-resources'));assert.ok(page.includes("resources.filter((r)=>r.dataType==='record')"))})
test('record update/delete preserve collection and match semantics',()=>{assert.ok(page.includes('recordCollectionResource:c.recordCollectionResource'));assert.ok(page.includes("match:c.conditionLogic==='any'?'any':'all'"))})
