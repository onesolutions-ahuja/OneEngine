import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('Phase 6 keeps captured Screen component catalogue',()=>{assert.ok(page.includes('Advanced CSV Import'));assert.ok(page.includes('Visual Picker'));assert.ok(page.includes('Repeater'));assert.ok(page.includes('Section'))})
test('Screen components support order duplicate delete and reactive metadata',()=>{for(const x of ['const move=(delta)=>','const duplicate=()=>','Duplicate component','React to resource changes'])assert.ok(page.includes(x),x)})
test('choice file record and container components have structured properties',()=>{for(const x of ['Choice Resource','Accepted File Types','Record Collection','Child Component API Names'])assert.ok(page.includes(x),x)})
test('visibility supports multiple conditions and custom logic',()=>{for(const x of ['Visibility Conditions','Add Condition','Custom Condition Logic Is Met','visibilityLogic'])assert.ok(page.includes(x),x)})
test('input validation uses formula builder and Screen generates resources',()=>{assert.ok(page.includes('GPTBuilderFormulaBuilder object={null} value={current.validateFormula'));assert.ok(page.includes("generatedByElementKey:'screen'"));assert.ok(page.includes("key:'SCREEN'"))})
