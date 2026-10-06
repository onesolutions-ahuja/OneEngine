import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('phase 5 uses metadata action catalogue and flow catalogue',()=>{assert.ok(page.includes("/api/platform/workflow-actions"));assert.ok(page.includes("/api/platform/rules"))})
test('phase 5 implements Action and Subflow runtime contracts',()=>{assert.ok(page.includes("element.key==='action'"));assert.ok(page.includes("element.key==='subflow'"));assert.ok(page.includes("key:'RUN_SUBFLOW'"));assert.match(page,/runtimeAction\|\|dataRuntimeAction/)})
test('phase 5 maps action inputs outputs and subflow inputs outputs',()=>{for(const x of ['Set Input Values','Store Output Values','Select Input Values','inputContract','outputContract','manualOutputMappings'])assert.ok(page.includes(x),'missing '+x)})
test('phase 5 exposes HTTP Callout through workflow action metadata',()=>{assert.ok(page.includes('HTTP Callout'));assert.ok(page.includes('request schema'))})
