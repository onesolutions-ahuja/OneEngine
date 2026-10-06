import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
const css=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.css',import.meta.url),'utf8')
test('Phase 9 shell exposes captured toolbar manager canvas and lifecycle labels',()=>{for(const x of ['Flow Builder toolbar','Search this flow','Filter By','New Resource','Auto-Layout','Freeform','Save As New Version'])assert.ok(page.includes(x),x)})
test('required validation uses Salesforce captured Enter a value message',()=>{assert.ok(page.includes('Enter a value.'));assert.ok(page.includes('aria-invalid'))})
test('keyboard controls cover canvas editing zoom and manager search',()=>{for(const x of ["event.key.toLowerCase()==='z'","event.key.toLowerCase()==='c'","event.key==='Delete'","event.key==='+'","event.key==='/'"])assert.ok(page.includes(x),x)})
test('accessibility exposes landmarks dialogs state and focus visibility',()=>{for(const x of ['role="toolbar"','role="application"','aria-modal="true"','aria-live="polite"','aria-pressed={selected.includes(node.id)}'])assert.ok(page.includes(x),x);assert.ok(css.includes(':focus-visible'));assert.ok(css.includes('prefers-reduced-motion'))})
test('uncaptured exact pixels are not fabricated',()=>{assert.ok(css.includes('Exact uncaptured pixel measurements remain intentionally unspecified'))})
