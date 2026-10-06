import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')

test('phase 3 implements core logic element editors',()=>{
  for(const name of ['assignment','decision','loop','transform','collection_sort','collection_filter','wait_conditions','wait_amount','wait_date'])
    assert.ok(page.includes("element.key==='"+name+"'"),'missing editor '+name)
})
test('phase 3 stores editable logic in element metadata',()=>{
  assert.ok(page.includes('configured:true'))
  assert.ok(page.includes('gptBuilderElements:nodes.map'))
})
test('phase 3 exposes required logic controls',()=>{
  for(const label of ['Default Outcome','Condition Requirements','Collection Variable','First item to last item','Maximum Number of Items','Resume When'])
    assert.ok(page.includes(label),'missing control '+label)
})
