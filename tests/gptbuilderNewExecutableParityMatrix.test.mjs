import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { executeWorkflowAction, executeWorkflowActions } from '../server/services/platformWorkflow.js'

const page=await readFile(new URL('../src/pages/developer/gptbuildernew/GPTBuilderNewPage.jsx',import.meta.url),'utf8')
const runtime=await readFile(new URL('../server/services/platformWorkflow.js',import.meta.url),'utf8')
const platformRoute=await readFile(new URL('../server/routes/platform.js',import.meta.url),'utf8')
const flowTypes=['screen','record','schedule','platform_event','autolaunched','automation_event','user_provisioning','contact_request','cart_async','recommendation_strategy','autolaunched_orchestration','record_orchestration','evaluation','cms_orchestration','individual_linking','autolaunched_approval','record_approval','identity_registration']

function ctx(extra={}){
 const db=async(sql,params=[])=>{const s=String(sql);if(s.includes('FROM role_permissions')&&s.includes('p.code = ANY'))return{rows:(params[2]||[]).map(code=>({code}))};if(s.includes('FROM platform_object_permissions'))return{rows:[{can_view:true,can_create:true,can_edit:true,can_delete:true}]};if(s.includes('FROM platform_permission_set_assignments'))return{rows:[]};return{rows:[]}}
 return {db,req:{user:{id:'u1',companyId:'c1',roleId:'r1',permissions:['workflow.execute']},_workflowEffectivePermissionSets:[]},companyId:'c1',userId:'u1',workflowVariables:{variables:{},steps:{}},...extra}
}

test('parity matrix contains all 18 captured flow types with generic capability contracts',()=>{
 for(const key of flowTypes){assert.ok(page.includes(key),key)}
 assert.ok(page.includes('FLOW_CAPABILITIES'))
})

test('decision observable contract is ordered first-match with default fallback',async()=>{
 const actions=[{id:'d',type:'CONDITION',outcomes:[
  {id:'first',label:'First',condition:{logic:'AND',conditions:[{field:'amount',operator:'greater_than',value:1}]},branch:['a']},
  {id:'second',label:'Second',condition:{logic:'AND',conditions:[{field:'amount',operator:'greater_than',value:2}]},branch:['b']}],defaultBranch:['z']},
 {id:'a',type:'ASSIGNMENT',variableName:'picked',variableType:'text',value:'FIRST'},
 {id:'b',type:'ASSIGNMENT',variableName:'picked',variableType:'text',value:'SECOND'},
 {id:'z',type:'ASSIGNMENT',variableName:'picked',variableType:'text',value:'DEFAULT'}]
 const c=ctx({record:{amount:3},fields:[{api_name:'amount',field_type:'number',active:true}]})
 const out=await executeWorkflowActions({actions,allActions:actions,...c})
 assert.equal(c.workflowVariables.variables.picked,'FIRST')
 assert.equal(out[0].result.branch.outcome,'First')
})

test('loop observable contract supports reverse iteration and restores current item',async()=>{
 const actions=[{id:'seed',type:'ASSIGNMENT',variableName:'items',variableType:'collection',value:[1,2,3]},
 {id:'loop',type:'LOOP',collection:'variables.items',itemVariable:'current',iterationOrder:'LAST_TO_FIRST',bodyBranch:['collect']},
 {id:'collect',type:'ASSIGNMENT',variableName:'seen',variableType:'collection',operator:'append',value:'variables.current'}]
 const c=ctx();c.workflowVariables.variables.current='old'
 await executeWorkflowActions({actions,allActions:actions,...c})
 assert.deepEqual(c.workflowVariables.variables.seen,[3,2,1]);assert.equal(c.workflowVariables.variables.current,'old')
})

test('screen observable contract validates metadata and persists a resumable wait',async()=>{
 const inserts=[]
 const c=ctx({runId:'run1',stepRunId:'step1'})
 c.db=async(sql,params=[])=>{const s=String(sql);if(s.includes('FROM role_permissions')&&s.includes('p.code = ANY'))return{rows:(params[2]||[]).map(code=>({code}))};if(s.includes('FROM platform_permission_set_assignments'))return{rows:[]};if(s.includes('platform_workflow_screen_sessions')&&s.startsWith('SELECT'))return{rows:[]};if(s.includes('INSERT INTO platform_workflow_screen_sessions')){inserts.push(params);return{rows:[{id:'ss1',screen:JSON.parse(params[3]),values:JSON.parse(params[4])}]}};return{rows:[]}}
 c.workflowVariables.variables.rows=[{id:'1',name:'A'}]
 const action={id:'screen',type:'SCREEN',screen:{label:'Review',apiName:'Review',components:[
  {type:'TEXT',name:'name',label:'Name',input:true,width:12,verticalAlignment:'top'},
  {type:'DATA_TABLE',name:'table',label:'Rows',input:false,width:12,verticalAlignment:'top',dataResource:'variables.rows'},
  {type:'SECTION',name:'section',label:'Section',input:false,width:12,verticalAlignment:'top',columns:2,columnWidths:[6,6]}
 ]}}
 const result=await executeWorkflowAction({action,...c})
 assert.equal(result.status,'waiting');assert.equal(inserts.length,1)
 const saved=JSON.parse(inserts[0][3]);assert.deepEqual(saved.components.find(x=>x.name==='table').rows,[{id:'1',name:'A'}])
})

test('captured core elements are backed by runtime primitives, not picker-only stubs',()=>{
 for(const key of ['SCREEN','ASSIGNMENT','CONDITION','LOOP','TRANSFORM','COLLECTION_SORT','COLLECTION_FILTER','GET_RECORDS','CREATE_RECORD','UPDATE_RECORD','DELETE_RECORD','ROLLBACK_RECORDS','WAIT']) assert.ok(runtime.includes('key: "'+key+'"'),key)
})

test('activation preserves record-entry runtime semantics',()=>{
 assert.ok(page.includes("entryFormula:start.conditionMode==='formula'"))
 assert.ok(page.includes("entryTransition:start.updatedRequirement==='newly_meets'?'UPDATED_TO_MEET':'EVERY_TIME'"))
 assert.ok(page.includes("flowCapabilities:FLOW_CAPABILITIES[flow.key]||{}"))
})

test('run debug and saved tests coerce declared input resource types',()=>{
 assert.ok(page.includes('function executionInputValue(resource,raw)'))
 assert.ok(page.includes("['number','currency'].includes(type)"))
 assert.ok(page.includes("type==='boolean'"))
 assert.ok(page.includes('resource?.isCollection'))
 assert.ok(page.includes("['record','apex-defined'].includes(type)"))
 assert.ok(page.includes('inputs:Object.fromEntries(resources.filter((r)=>r.availableForInput)'))
})

test('Save As New Version uses the implemented generic workflow lifecycle contract',()=>{
 assert.ok(page.includes("forceNewVersion:true,active:false,lifecycleStatus:'DRAFT'"))
 assert.ok(!page.includes("/versions`,{method:'POST'"))
})

test('manual Run evaluates Start formulas through the same bounded formula runtime as automation',()=>{
 const start=platformRoute.indexOf('async function runSavedWorkflowRequest')
 const end=platformRoute.indexOf('router.post("/platform/rules/:ruleId/debug"',start)
 const runRuntime=platformRoute.slice(start,end)
 assert.ok(runRuntime.includes('evaluateWorkflowFormula('))
 assert.ok(runRuntime.includes('normalizeStartFormula(workflow.action.startFormula)'))
 assert.ok(runRuntime.includes('startFormulaInputs(fields, record, null)'))
})

test('Subflow resolution executes active definition or latest saved snapshot when none is active',()=>{
 const start=runtime.indexOf('key: "RUN_SUBFLOW"')
 const end=runtime.indexOf('key: "CALL_WEBHOOK"',start)
 const subflow=runtime.slice(start,end)
 assert.ok(subflow.includes("row.active === true"))
 assert.ok(subflow.includes('FROM platform_workflow_versions'))
 assert.ok(subflow.includes('ORDER BY version DESC LIMIT 1'))
 assert.ok(subflow.includes('latest.rows[0]?.definition'))
 assert.ok(subflow.includes("action->>'type'='workflow'"))
 assert.ok(subflow.includes("r.company_id=$2"))
})
