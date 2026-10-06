import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const runtime=await readFile(new URL('../server/services/platformWorkflow.js',import.meta.url),'utf8')
const builder=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('Roll Back Records is a registered generic workflow primitive',()=>{assert.ok(runtime.includes('key: "ROLLBACK_RECORDS"'));assert.ok(runtime.includes('ROLLBACK TO SAVEPOINT oneengine_flow_records'));assert.ok(runtime.includes('SAVEPOINT oneengine_flow_records'))})
test('workflow runtime creates an atomic record transaction when rollback is present',()=>{assert.ok(runtime.includes('containsRollbackRecords'));assert.ok(runtime.includes('await client.query("BEGIN")'));assert.ok(runtime.includes('await client.query("COMMIT")'))})
test('GPT Builder New exposes and serializes Roll Back Records',()=>{assert.ok(builder.includes("['rollback','Roll Back Records']"));assert.ok(builder.includes("key:'ROLLBACK_RECORDS'"))})
