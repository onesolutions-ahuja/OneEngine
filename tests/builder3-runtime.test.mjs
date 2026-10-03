import {test} from 'node:test'
import assert from 'node:assert/strict'
import {compileBuilder3,validateBuilder3,compileConditions} from '../src/pages/developer/builder3Runtime.js'
import {getWorkflowActionDefinition,validateWorkflowAction} from '../server/services/platformWorkflow.js'
import {brevoMessage} from '../server/services/emailProviderConnectors.js'
const node=(type,config={},id='step')=>({id,type,label:type,apiName:id,config})
const variables=[{apiName:'Total',value:'Total',label:'Total',type:'Variable',dataType:'Number',defaultValue:'5'}]
test('Builder 3 values compile to registered actions and resource executors work',async()=>{
 const actions=compileBuilder3([node('ASSIGNMENT',{resource:'variables.Total',operator:'Add',value:3})],variables)
 for(const action of actions)validateWorkflowAction(action)
 const workflowVariables={variables:{},steps:{}}
 for(const action of actions)await getWorkflowActionDefinition(action.type).executor({action,workflowVariables})
 assert.equal(workflowVariables.variables.Total,8)
})
test('structured connector fields remain top-level and preserve dynamic resources',()=>{
 const [action]=compileBuilder3([node('ACTION',{actionKey:'SEND_EMAIL_BREVO',inputs:{recipient:'$record.email',subject:'Welcome',body:'Hello',cc:[{email:'variables.CC'}]}})])
 validateWorkflowAction(action);assert.equal(action.type,'SEND_EMAIL_BREVO');assert.equal(action.recipient,'$record.email');assert.deepEqual(action.cc,[{email:'variables.CC'}])
})
test('decision and loop compile distinct runtime branch targets',()=>{
 const decision=node('DECISION',{outcomes:[{id:'yes',label:'Yes',conditions:[{resource:'amount',operator:'Greater Than',value:0}]}]},'decision')
 const loop=node('LOOP',{collection:'variables.Items'},'loop')
 const result=compileBuilder3([decision,loop,node('ASSIGNMENT',{resource:'variables.Total',value:1},'body')],[],[{source:'decision',sourceHandle:'yes',target:'loop'},{source:'loop',sourceHandle:'body',target:'body'}])
 assert.deepEqual(result[0].outcomes[0].branch,['loop']);assert.deepEqual(result[1].bodyBranch,['body']);validateWorkflowAction(result[0]);validateWorkflowAction(result[1])
})
test('validation reports duplicate names, missing schema inputs and broken references',()=>{
 const actions=[{key:'SEND_EMAIL_BREVO',schema:getWorkflowActionDefinition('SEND_EMAIL_BREVO').schema}]
 const issues=validateBuilder3({flowType:'autolaunched',nodes:[node('ACTION',{actionKey:'SEND_EMAIL_BREVO',inputs:{subject:'variables.Missing'}}),node('ACTION',{actionKey:'SEND_EMAIL_BREVO'},'other')].map(n=>({...n,apiName:'Duplicate'})),actions})
 assert.ok(issues.some(i=>i.code==='ACTION_INPUT'&&i.node==='step'));assert.ok(issues.some(i=>i.code==='BROKEN_RESOURCE'));assert.ok(issues.some(i=>i.text.includes('Duplicate API name')))
})
test('Brevo optional fields reach documented provider payload without sending email',()=>{
 const body=brevoMessage({fromEmail:'sender@example.com'},{recipient:'to@example.com',subject:'Test',body:'Body',cc:[{email:'cc@example.com'}],bcc:[{email:'bcc@example.com'}],replyTo:'reply@example.com',attachments:[{name:'document.pdf',url:'https://example.com/document.pdf'}],headers:{'X-Test':'ok'},tags:['workflow'],params:{name:'Vishal'}})
 assert.deepEqual(body.cc,[{email:'cc@example.com',name:undefined}]);assert.equal(body.bcc[0].email,'bcc@example.com');assert.equal(body.attachment[0].name,'document.pdf');assert.equal(body.replyTo.email,'reply@example.com');assert.equal(body.headers['X-Test'],'ok')
 assert.throws(()=>brevoMessage({fromEmail:'sender@example.com'},{recipient:'to@example.com',subject:'Test',body:'Body',attachments:[{name:'bad',url:'/local'}]}),/absolute/)
})
test('record operations compile fields and wait/custom error have executable contracts',()=>{
 for(const action of compileBuilder3([node('CREATE_RECORDS',{objectKey:'Customer',fieldValues:[{field:'name',value:'$record.name'}]}),node('WAIT',{amount:2,unit:'minutes'},'wait'),node('CUSTOM_ERROR',{message:'Invalid request'},'error'),node('SCREEN',{components:[]},'screen')]))validateWorkflowAction(action)
 assert.deepEqual(compileConditions([{resource:'name',operator:'Equals',value:'A'}]),[{field:'name',operator:'equals',value:'A'}])
})

test('dynamic action inputs resolve nested typed resources before executor validation',async()=>{
 const {executeWorkflowAction}=await import('../server/services/platformWorkflow.js')
 const action=compileBuilder3([node('ACTION',{actionKey:'CUSTOM_ERROR',inputs:{errorMessage:'variables.Message'}})])[0]
 validateWorkflowAction(action)
 const context={action,workflowVariables:{variables:{Message:'Resource-backed message'},steps:{}},req:{user:{id:'user',companyId:'tenant',roleId:'role',permissions:['workflow.execute']},_workflowEffectivePermissionSets:[]},db:async(sql,params)=>({rows:String(sql).includes('p.code = ANY')?(params[2]||[]).map(code=>({code})):[{ok:1}]})}
 await assert.rejects(executeWorkflowAction(context),/Resource-backed message/)
 await assert.rejects(executeWorkflowAction({...context,workflowVariables:{variables:{},steps:{}}}),/was not produced/)
})
test('date and condition waits use the existing durable runtime registrations',()=>{
 const actions=compileBuilder3([node('WAIT',{waitType:'date',dateResource:'variables.When'}),node('WAIT',{waitType:'conditions',conditions:[{resource:'status',operator:'Equals',value:'Ready'}]},'conditionWait')])
 assert.equal(actions[0].type,'WAIT_UNTIL_DATE');assert.equal(actions[1].type,'WAIT_FOR_CONDITIONS')
 actions.forEach(validateWorkflowAction)
})

test('choice and stage resources compile to their existing resource executors',async()=>{
 const resources=[{type:'Choice',apiName:'Yes',label:'Yes',defaultValue:'yes',dataType:'Text'},{type:'Stage',apiName:'First',label:'First',defaultValue:1}]
 const context={workflowVariables:{variables:{},steps:{}}}
 for(const action of compileBuilder3([],resources)){validateWorkflowAction(action);await getWorkflowActionDefinition(action.type).executor({...context,action})}
 assert.equal(context.workflowVariables.variables.Yes.value,'yes');assert.equal(context.workflowVariables.variables.First.order,1)
})
test('recurring schedules respect a future local start date',async()=>{
 const {calculateNextFire}=await import('../server/services/platformSchedules.js')
 const next=calculateNextFire('DAILY',{time:'09:00',startDate:'2026-10-10'},'UTC',new Date('2026-10-03T12:00:00Z'))
 assert.equal(next.toISOString(),'2026-10-10T09:00:00.000Z')
})

test('condition-based mutations compose secured queries and existing mutation actions',async()=>{
 const {executeBuilder3Data}=await import('../server/services/builder3DataAdapter.js')
 const calls=[]
 const action=compileBuilder3([node('UPDATE_RECORDS',{objectKey:'Customer',conditionLogic:'all',conditions:[{resource:'status',operator:'Equals',value:'Open'}],fieldValues:[{field:'status',value:'Closed'}]})])[0]
 const result=await executeBuilder3Data({action,context:{},resolve:()=>null,writableFields:async()=>new Set(['status']),execute:async a=>{calls.push(a);return a.type==='GET_RECORDS'?{records:[{id:'r1'},{id:'r2'}]}:{status:'completed',record:{id:a.recordId}}}})
 assert.deepEqual(calls[0].filters,[{field:'status',operator:'equals',value:'Open'}]);assert.deepEqual(calls.slice(1).map(a=>a.recordId),['r1','r2']);assert.equal(result.count,2);assert.ok(calls.slice(1).every(a=>!a.builder3Data&&a.fieldValues.status==='Closed'))
})
test('collection create excludes IDs and non-writable metadata fields',async()=>{
 const {executeBuilder3Data}=await import('../server/services/builder3DataAdapter.js')
 const calls=[];const action=compileBuilder3([node('CREATE_RECORDS',{objectKey:'Customer',valueMode:'collection',sourceRecord:'variables.Customers'})])[0]
 await executeBuilder3Data({action,context:{},resolve:()=>[{id:'old',name:'A',secret:'restricted'},{name:'B'}],writableFields:async()=>new Set(['name']),execute:async a=>{calls.push(a);return {status:'completed'}}})
 assert.deepEqual(calls.map(a=>a.fieldValues),[{name:'A'},{name:'B'}]);assert.ok(calls.every(a=>a.type==='CREATE_RECORD'&&!a.builder3Data))
})
test('Get Records projections and advanced output assignments preserve collection values',async()=>{
 const {executeBuilder3Data}=await import('../server/services/builder3DataAdapter.js')
 const records=[{id:'one',name:'A',email:'a@example.com'},{id:'two',name:'B',email:'b@example.com'}];const execute=async()=>({record:records[0],records})
 const context={workflowVariables:{variables:{},steps:{}}}
 await executeBuilder3Data({action:{type:'GET_RECORDS',store:'all',builder3Data:{mode:'advanced',assignments:[{field:'name',resource:'variables.Names'}]}},context,execute})
 assert.deepEqual(context.workflowVariables.variables.Names,['A','B'])
 const result=await executeBuilder3Data({action:{type:'GET_RECORDS',builder3Data:{mode:'choose',fields:['name']}},context,execute})
 assert.deepEqual(result.record,{id:'one',name:'A'});assert.deepEqual(result.records.map(r=>Object.keys(r)),[['id','name'],['id','name']])
})

test('Builder 3 conditional update executes through tenant/store-scoped canonical runtime',async()=>{
 const {executeWorkflowAction}=await import('../server/services/platformWorkflow.js')
 const writes=[];const object={id:'obj',object_key:'Customer',source_table:'customers',active:true,company_scoped:true,store_scoped:true};const fields=[{id:'field',object_id:'obj',api_name:'status',source_column:'status',field_type:'text',active:true,writable:true,readable:true}]
 const db=async(sql,params=[])=>{
  if(sql.includes('FROM platform_objects'))return {rows:[object]};if(sql.includes('FROM platform_fields'))return {rows:fields};
  if(sql.includes('p.code = ANY'))return {rows:(params[2]||[]).map(code=>({code}))};if(sql.includes('FROM platform_object_permissions'))return {rows:[{can_view:true,can_create:true,can_edit:true,can_delete:true}]};
  if(sql.includes('FROM platform_permission_set_assignments')||sql.includes('FROM platform_duplicate_rules')||sql.includes('FROM platform_matching_rules'))return {rows:[]};if(sql.includes('p.code=$2'))return {rows:[{ok:1}]};
  if(sql.startsWith('SELECT')&&sql.includes('FROM "customers"'))return {rows:[{id:'r1',status:'Open'}]};
  if(sql.trimStart().startsWith('INSERT INTO platform_events'))return {rows:[{id:'event',company_id:'tenant',event_type:'platform.object.record.updated'}]};
  if(sql.startsWith('UPDATE "customers"')){writes.push({sql,params});return {rows:[{id:'r1',status:'Closed'}]}};
  return {rows:[]};
 }
 const action=compileBuilder3([node('UPDATE_RECORDS',{objectKey:'Customer',conditions:[{resource:'status',operator:'Equals',value:'Open'}],fieldValues:[{field:'status',value:'Closed'}]})])[0]
 const result=await executeWorkflowAction({action,db,req:{user:{id:'user',roleId:'role',companyId:'tenant',storeId:'store'},_workflowEffectivePermissionSets:[]},companyId:'tenant',workflowVariables:{variables:{},steps:{}}})
 assert.equal(result.count,1);assert.ok(writes[0].sql.includes('company_id='));assert.ok(writes[0].sql.includes('store_id='));assert.deepEqual(writes[0].params,['Closed','r1','tenant','store'])
})

test('Brevo native transactional templates and UTC scheduling reach provider payloads',()=>{
 const body=brevoMessage({fromEmail:'sender@example.com'},{recipient:'to@example.com',providerTemplateId:42,params:{name:'Vishal'},scheduledAt:'2026-10-10T09:30'})
 assert.equal(body.templateId,42);assert.equal(body.subject,undefined);assert.deepEqual(body.params,{name:'Vishal'});assert.equal(body.scheduledAt,'2026-10-10T09:30:00.000Z')
 assert.throws(()=>brevoMessage({fromEmail:'sender@example.com'},{recipient:'to@example.com',providerTemplateId:-1}),/positive integer/)
})
