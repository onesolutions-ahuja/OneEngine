import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {listRegisteredPlatformActions} from '../server/services/platformActionRegistry.js'
const root=path.resolve(import.meta.dirname,'..')
const out=path.join(root,'test-results/builder3')
await fs.mkdir(out,{recursive:true})
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4186','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']})
const ready=new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('Local:'))resolve()});server.on('exit',code=>reject(new Error(`Preview exited ${code}`)));server.stderr.on('data',data=>process.stderr.write(data))})
let browser
const checks=[],panels=[],errors=[]
const check=(name,fn)=>async()=>{await fn();checks.push(name);console.log('PASS',name)}
try {
 await ready
 browser=await chromium.launch({headless:true,args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 page.on('pageerror',e=>errors.push(e.message))
 const registry=listRegisteredPlatformActions().map(({executor,validation,...a})=>a)
 const actions=registry.filter(a=>a.workflowSupported!==false)
 let persisted
 await page.route('**/api/**',async route=>{
   const pathname=new URL(route.request().url()).pathname
   const method=route.request().method()
   let data=[]
   if(pathname.endsWith('/action-registry'))data=registry
   else if(pathname.endsWith('/objects'))data=[{id:'object-1',object_key:'Customer',label:'Customer'}]
   else if(pathname.endsWith('/fields'))data=[{id:'field-1',api_name:'email',label:'Email',field_type:'email',active:true},{id:'field-2',api_name:'name',label:'Name',field_type:'text',active:true}]
   else if(method==='POST'&&pathname.endsWith('/rules')){persisted=route.request().postDataJSON();data={...persisted,id:'saved-fixture-flow'}}
   else if(pathname.endsWith('/rules'))data=persisted?[persisted]:[]
   await route.fulfill({json:{success:true,data}})
 })
 await page.goto('http://127.0.0.1:4186/tests/fixtures/builder3.html')
 await check('Chooser requires searchable record object and footer stays reachable',async()=>{
   await page.getByRole('button',{name:'New Flow',exact:true}).click()
   await page.getByRole('button',{name:/Record-Triggered Flow/}).click()
   assert.equal(await page.getByRole('button',{name:'Create',exact:true}).isEnabled(),false)
   await page.getByRole('combobox',{name:'Search objects'}).fill('cust')
   await page.getByRole('option',{name:/Customer/}).click()
   assert.equal(await page.getByRole('button',{name:'Create',exact:true}).isEnabled(),true)
   await page.getByRole('button',{name:'Create',exact:true}).click()
   await page.locator('.b3-start-panel header button').click()
 })()
 await check('Brevo structured inputs, independent scrolling, record-field resource lookup',async()=>{
   await page.locator('.b3-toolbox .b3-search input').fill('Brevo')
   await page.locator('.b3-palette-group button').first().click()
   assert.equal(await page.locator('.b3-properties').getByText('Input Values',{exact:true}).count(),0)
   assert.equal(await page.locator('.b3-properties').getByLabel('To *').count(),1)
   const to=page.locator('.b3-schema-field').filter({has:page.locator('.b3-field-heading label').filter({hasText:/^To/})})
   await to.getByRole('button',{name:'Insert a Resource'}).click()
   await to.getByRole('button',{name:'Select a resource…'}).click()
   await to.getByRole('button',{name:/Current Record/}).click()
   await to.getByRole('button',{name:/Email/}).click()
   assert.ok((await to.innerText()).includes('$record.email'))
   await page.locator('.b3-properties').getByLabel('Subject',{exact:true}).fill('Welcome')
   await page.locator('.b3-properties').getByLabel('Text Body',{exact:true}).fill('Hello')
   await page.locator('.b3-properties').getByRole('button',{name:'Add CC',exact:true}).click()
   await page.locator('.b3-schema-array').filter({has:page.locator('legend').filter({hasText:/^CC/})}).getByLabel('Email *').fill('cc@example.com')
   await page.locator('.b3-properties').evaluate(e=>e.scrollTop=0)
   const geometry=await page.locator('.b3-workspace').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,columns:getComputedStyle(e).gridTemplateColumns}))
   assert.equal(geometry.width,geometry.scroll);assert.equal(geometry.columns,'280px 760px 400px')
   await page.screenshot({path:path.join(out,'brevo-desktop.png')})
   await page.locator('.b3-properties').getByLabel('Text Body',{exact:true}).scrollIntoViewIfNeeded()
   const box=await page.locator('.b3-properties').getByLabel('Text Body',{exact:true}).boundingBox()
   assert.ok(box.y+box.height<=922)
   await page.screenshot({path:path.join(out,'brevo-scrolled.png')})
 })()
 await check('Rich text formatting and source switching preserve HTML content',async()=>{
   const html=page.locator('.b3-properties').getByRole('textbox',{name:'HTML Body',exact:true})
   await html.fill('Rich content');await html.press('Control+a')
   await page.locator('.b3-properties').getByRole('button',{name:'Bold',exact:true}).click()
   await page.locator('.b3-properties').getByRole('button',{name:'Toggle rich text source',exact:true}).click()
   assert.match(await page.locator('.b3-properties').getByRole('textbox',{name:'HTML Body',exact:true}).inputValue(),/<(b|strong)>Rich content/)
   await page.locator('.b3-properties').getByRole('button',{name:'Toggle rich text source',exact:true}).click()
 })()
 await check('Save submits registered execution fields and separate editable definition',async()=>{
   await page.locator('.b3-save-wrap').getByRole('button',{name:/Save/}).first().click()
   await page.getByText('Flow saved.',{exact:true}).waitFor()
   assert.equal(persisted.action.actions[0].type,'SEND_EMAIL_BREVO')
   assert.equal(persisted.action.actions[0].recipient,'$record.email')
   assert.equal(persisted.action.actions[0].cc[0].email,'cc@example.com')
   assert.equal(persisted.action.editorDefinition.nodes[0].type,'ACTION')
 })()
 await check('Middle insertion and undo/redo keep node order',async()=>{
   await page.getByRole('button',{name:'Insert before Send Email - Brevo'}).click()
   await page.locator('.b3-selector-search input').fill('Decision')
   await page.locator('.b3-selector-body button').first().click()
   assert.ok((await page.locator('[data-node-id]').first().innerText()).includes('Decision'))
   await page.getByRole('button',{name:'Undo',exact:true}).click()
   assert.equal(await page.locator('[data-node-id]').count(),1)
   await page.getByRole('button',{name:'Redo',exact:true}).click()
   assert.equal(await page.locator('[data-node-id]').count(),2)
 })()
 await check('Decision paths and branch insertion render separately',async()=>{
   await page.getByRole('button',{name:'Add to Outcome 1'}).click()
   await page.locator('.b3-selector-search input').fill('Assignment')
   await page.locator('.b3-selector-body button').first().click()
   assert.equal(await page.locator('.b3-branch').filter({hasText:'Outcome 1'}).locator('[data-node-id]').count(),1)
   await page.locator('.b3-properties header button').click()
   await page.screenshot({path:path.join(out,'decision-branches.png')})
 })()
 await check('Keyboard copy/paste does not intercept text fields',async()=>{
   await page.locator('[data-node-id]').first().click()
   const label=page.locator('.b3-properties').getByLabel('Label',{exact:true}).first()
   await label.fill('Typed label');await label.press('Control+a');await label.press('Control+c')
   assert.equal(await label.inputValue(),'Typed label')
 })()
 await check('Cancel restores the element configuration before opening the panel',async()=>{
   await page.locator('.b3-panel-footer').getByRole('button',{name:'Done',exact:true}).click()
   await page.locator('[data-node-id]').first().click()
   const input=page.locator('.b3-properties').getByLabel('Label',{exact:true}).first()
   const original=await input.inputValue();await input.fill('Discard this edit')
   await page.locator('.b3-panel-footer').getByRole('button',{name:'Cancel',exact:true}).click()
   await page.locator('[data-node-id]').first().click()
   assert.equal(await page.locator('.b3-properties').getByLabel('Label',{exact:true}).first().inputValue(),original)
 })()
 await check('Resource creation, search and edit preserve metadata',async()=>{
   await page.getByRole('button',{name:'Manager',exact:true}).click()
   await page.getByRole('button',{name:'New Resource',exact:true}).click()
   await page.locator('.b3-modal').getByLabel('API Name',{exact:true}).fill('Total')
   await page.locator('.b3-modal').getByLabel('Data Type',{exact:true}).selectOption('Number')
   await page.locator('.b3-modal').getByLabel('Default Value',{exact:true}).fill('5')
   await page.locator('.b3-modal').getByRole('button',{name:'Done',exact:true}).click()
   await page.getByRole('textbox',{name:'Search resources'}).fill('Total')
   await page.locator('.b3-manager-row').filter({hasText:'Total'}).click()
   assert.equal(await page.locator('.b3-modal').getByLabel('Default Value',{exact:true}).inputValue(),'5')
   await page.locator('.b3-modal').getByLabel('Default Value',{exact:true}).fill('7')
   await page.locator('.b3-modal').getByRole('button',{name:'Done',exact:true}).click()
 })()
 await page.getByRole('button',{name:'Elements',exact:true}).click()
 // Validate every registered schema is actually rendered, not just present in source.
 for(const action of actions) {
   await page.locator('.b3-toolbox .b3-search input').fill(action.displayName||action.key)
   const button=page.locator(`[data-action-key="${action.key}"]`)
   if(!await button.count()){panels.push({key:action.key,status:'unavailable_for_record_flow'});continue}
   await button.click()
   const panel=page.locator('.b3-properties')
   if(action.schema?.properties){
     for(const [key,field] of Object.entries(action.schema.properties))assert.ok((await panel.innerText()).includes(field.title||key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())),`${action.key}.${key} field must render`)
     panels.push({key:action.key,status:'schema_rendered',fieldCount:Object.keys(action.schema.properties).length})
   }else {assert.ok((await panel.innerText()).includes('no registered input schema'));panels.push({key:action.key,status:'missing_registry_schema'})}
 }
 await check('Canvas menu delete, undo and zoom perform their visible operations',async()=>{
   const count=await page.locator('[data-node-id]').count()
   await page.locator('.b3-canvas-menu summary').first().click()
   await page.locator('.b3-canvas-menu').first().getByRole('button',{name:'Delete Element',exact:true}).click()
   assert.equal(await page.locator('[data-node-id]').count(),count-1)
   await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.locator('[data-node-id]').count(),count)
   await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.equal(await page.locator('.b3-zoom span').innerText(),'110%')
   await page.getByRole('button',{name:'Reset zoom',exact:true}).click();assert.equal(await page.locator('.b3-zoom span').innerText(),'100%')
 })()
 await check('Responsive panel remains reachable at tablet and phone widths',async()=>{
   for(const width of [1024,768,390]) {
     await page.setViewportSize({width,height:900})
     await page.locator('.b3-properties').evaluate(e=>e.scrollTop=e.scrollHeight)
     const done=page.locator('.b3-panel-footer').getByRole('button',{name:'Done',exact:true})
     await done.scrollIntoViewIfNeeded();const box=await done.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=822)
     await page.screenshot({path:path.join(out,`panel-${width}.png`)})
   }
 })()
 assert.deepEqual(errors,[])
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({baseline:'50caac5d99b23e6455ea021664b7b9d387ced949',checks,panels,excludedCapabilities:registry.filter(a=>a.workflowSupported===false).map(a=>a.key),errors,liveTenantVerified:false},null,2))
 console.log(`Passed ${checks.length} interaction checks; examined ${panels.length} registered action panels.`)
 console.log(`Missing schemas: ${panels.filter(p=>p.status==='missing_registry_schema').length}. Live tenant verification remains pending.`)
} finally {await browser?.close();server.kill()}
