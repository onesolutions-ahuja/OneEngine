import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('phase 4 implements Salesforce data elements',()=>{for(const key of ['get_records','create_records','update_records','delete_records','rollback'])assert.ok(page.includes("element.key==='"+key+"'"),'missing '+key)})
test('phase 4 uses OneEngine object field metadata',()=>{assert.match(page,/api\/platform\/objects\/.*\/fields/);assert.ok(page.includes('fieldType'));assert.ok(page.includes('operatorsForField'))})
test('phase 4 persists generic runtime actions',()=>{for(const key of ['GET_RECORDS','CREATE_RECORD','UPDATE_RECORD','DELETE_RECORD','ROLLBACK_RECORDS'])assert.ok(page.includes("'"+key+"'"),'missing runtime '+key);assert.match(page,/map\(\(node\)=>runtimeActionForNode\(node,resources\)\)\.filter\(Boolean\)/)})
test('phase 4 exposes Salesforce CRUD controls',()=>{for(const label of ['How Many Records to Store','How to Store Record Data','How to Set Record Field Values','How to Find Records to Update','How to Find Records to Delete','Filter Records','Set Field Values'])assert.ok(page.includes(label),'missing '+label)})
