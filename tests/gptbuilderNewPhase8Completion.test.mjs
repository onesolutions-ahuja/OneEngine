import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('Phase 8 Run Debug Tests use saved workflow endpoints',()=>{for(const x of ["/run`","/debug`","/tests`"])assert.ok(page.includes(x),x)})
test('execution settings persist and include inputs rollback skip start waits assertions',()=>{for(const x of ['sessionStorage.setItem(`gptbuildernew.execution.','Input Variables','Skip start condition requirements','Debug wait paths','assertions'])assert.ok(page.includes(x),x)})
test('version lifecycle uses backend versions and restore endpoints',()=>{for(const x of ["+'/versions'","+'/versions/'+encodeURIComponent(version)+'/restore'",'Edit History','Restored save '])assert.ok(page.includes(x),x)})
test('activation sends complete workflow definition when activating',()=>{assert.ok(page.includes("lifecycleStatus:'ACTIVE'"));assert.ok(page.includes("gptBuilderElements:nodes,resources,goToConnections"))})
