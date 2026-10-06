import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
test('Decision outcomes',()=>{for(const x of ['New Outcome','Add Condition','Default Outcome','outcomes:outcomes.map','[next[oi-1],next[oi]]','[next[oi+1],next[oi]]'])assert.ok(page.includes(x),x)})
test('Loop branches',()=>{for(const x of ['For Each — Next Element','After Last — Next Element','afterLastBranch:Array.isArray(c.afterLastBranch)'])assert.ok(page.includes(x),x)})
test('Freeform canvas',()=>{for(const x of ['const startPan=','branch:edge.branch',"'outcome:'+(o.id||i)","'forEach'","'afterLast'"])assert.ok(page.includes(x),x)})
test('Keyboard canvas controls',()=>{for(const x of ["event.key.toLowerCase()==='z'","event.key.toLowerCase()==='y'","event.key.toLowerCase()==='c'","event.key.toLowerCase()==='v'","event.key==='Delete'","event.key==='+'","event.key==='-'","event.key==='0'"])assert.ok(page.includes(x),x)})
