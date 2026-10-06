import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('typed action inputs',()=>{for(const x of ["Don't Include",'Include with Specified Value','Formula Mode','Transform Mode','__flowInputMode'])assert.ok(page.includes(x),x)})
test('action outputs',()=>{for(const x of ['Automatically store all fields','Manually assign variables','Add Output Mapping','automaticOutputVariable','manualOutputMappings'])assert.ok(page.includes(x),x)})
test('subflow contracts',()=>{for(const x of ['const eligibleFlows=','hasWait(flow)','select a compatible resource','inputContract','outputContract'])assert.ok(page.includes(x),x)})
test('subflow and fault runtime',()=>{assert.ok(page.includes("key:'RUN_SUBFLOW'"));assert.ok(page.includes('faultBranch:cfg.faultBranch||[]'))})

test('fault paths use runtime ROUTE contract and graphical fault connector',()=>{assert.ok(page.includes("faultMode:(cfg.faultBranch||[]).length?'ROUTE'"));assert.ok(page.includes("edge.branch==='fault'"));assert.ok(page.includes("beginConnect(node.id,e,'fault')"))})
test('HTTP action schema renders enums booleans and structured metadata inputs',()=>{assert.ok(page.includes('Array.isArray(schema && schema.enum)'));assert.ok(page.includes("schema && schema.type==='boolean'"));assert.ok(page.includes("['headers','query','body','variables'].includes(name)"))})
test('subflow stores explicit active/latest version semantics',()=>{assert.ok(page.includes("versionMode:(x?.active||x?.runtime_active)?'active':'latest'"));assert.ok(page.includes("versionMode:cfg.versionMode||'active'"))})
