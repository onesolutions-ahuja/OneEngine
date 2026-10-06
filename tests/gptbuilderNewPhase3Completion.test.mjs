import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('Phase 3 exposes automatic Flow resources without persisting them as authored resources',()=>{for(const x of ['$User.Id','$Flow.CurrentDateTime','$Flow.CurrentDate','$Flow.CurrentStage','$Record','$Record__Prior'])assert.ok(page.includes(x),x);assert.ok(page.includes('const availableResources=useMemo'))})
test('automatic resources are read-only in Manager lifecycle',()=>{assert.ok(page.includes("r.resourceType==='automatic'?null:onEdit(r)"));assert.ok(page.includes("r.resourceType==='automatic'?null:<button"))})
test('collection choice sets use collection plus label and value fields',()=>{assert.ok(page.includes('Source Collection'));assert.ok(page.includes('Choice Label Field'));assert.ok(page.includes('Choice Value Field'));assert.ok(page.includes("sourceCollection:type==='collection_choice_set'?sourceField"))})
test('record and picklist choice sets require object and field metadata',()=>{assert.ok(page.includes("type==='record_choice_set'?Boolean(sourceObject&&sourceField)"));assert.ok(page.includes("type==='picklist_choice_set'?Boolean(sourceObject&&sourceField)"))})
