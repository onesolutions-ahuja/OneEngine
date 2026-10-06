import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('typed action inputs',()=>{for(const x of ["Don't Include",'Include with Specified Value','Formula Mode','Transform Mode','__flowInputMode'])assert.ok(page.includes(x),x)})
test('action outputs',()=>{for(const x of ['Automatically store all fields','Manually assign variables','Add Output Mapping','automaticOutputVariable','manualOutputMappings'])assert.ok(page.includes(x),x)})
test('subflow contracts',()=>{for(const x of ['const eligibleFlows=','hasWait(flow)','select a compatible resource','inputContract','outputContract'])assert.ok(page.includes(x),x)})
test('subflow and fault runtime',()=>{assert.ok(page.includes("key:'RUN_SUBFLOW'"));assert.ok(page.includes('faultBranch:cfg.faultBranch||[]'))})
