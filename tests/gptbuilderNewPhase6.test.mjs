import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('phase 6 contains exactly the nine audited Salesforce resource types',()=>{for(const x of ['Variable','Constant','Formula','Text Template','Choice','Collection Choice Set','Record Choice Set','Picklist Choice Set','Stage'])assert.ok(page.includes("['"+x+"'"),'missing '+x)})
test('phase 6 supports audited variable data types and collection IO flags',()=>{for(const x of ['Text','Record','Number','Currency','Boolean','Date','Date/Time','Time','Picklist','Multi-Select Picklist','Apex-Defined'])assert.ok(page.includes("['"+x+"'"),'missing '+x);for(const x of ['isCollection','availableForInput','availableForOutput'])assert.ok(page.includes(x))})
test('phase 6 persists resources into flow metadata',()=>{assert.ok(page.includes('resources:resources'));assert.ok(page.includes("source:'manager'"))})
test('phase 6 validates formula shape and unique resource API names',()=>{assert.ok(page.includes('formulaCheck'));assert.ok(page.includes('API Name must be unique in the flow.'))})
