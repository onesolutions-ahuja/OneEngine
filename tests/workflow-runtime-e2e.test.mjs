import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkflowAction, executeWorkflowActions, workflowResultsContainStatus } from '../server/services/platformWorkflow.js';

function makeContext(extra={}) {
  const db = async (sql, params=[]) => {
    const s = String(sql);
    if (s.includes('FROM role_permissions') && s.includes('p.code = ANY')) {
      const required = params[2] || [];
      return { rows: required.map((code)=>({code})) };
    }
    if (s.includes('FROM platform_object_permissions')) {
      return { rows: [{can_view:true,can_create:true,can_edit:true,can_delete:true}] };
    }
    if (s.includes('FROM platform_permission_set_assignments')) return { rows: [] };
    if (s.includes('FROM role_permissions') && s.includes('p.code=$2')) return { rows: [{ok:1}] };
    return { rows: [] };
  };
  const req = { user: { id:'u1', companyId:'c1', roleId:'r1', permissions:['workflow.execute'] }, _workflowEffectivePermissionSets: [] };
  return { db, req, companyId:'c1', userId:'u1', workflowVariables:{variables:{},steps:{}}, ...extra };
}

test('decision executes only selected branch and skips branch targets at top level', async () => {
  const actions = [
    {id:'decision',type:'CONDITION',outcomes:[
      {id:'yes',label:'High',condition:{logic:'AND',conditions:[{field:'amount',operator:'greater_than_or_equal',value:10}]},branch:['yesStep']},
      {id:'no',label:'Low',condition:{logic:'AND',conditions:[{field:'amount',operator:'less_than',value:10}]},branch:['noStep']},
    ],defaultBranch:['defaultStep']},
    {id:'yesStep',type:'ASSIGNMENT',variableName:'path',variableType:'text',operator:'set',value:'YES'},
    {id:'noStep',type:'ASSIGNMENT',variableName:'path',variableType:'text',operator:'set',value:'NO'},
    {id:'defaultStep',type:'ASSIGNMENT',variableName:'path',variableType:'text',operator:'set',value:'DEFAULT'},
  ];
  const ctx=makeContext({record:{amount:10},fields:[{api_name:'amount',field_type:'number',active:true}]});
  const results = await executeWorkflowActions({actions,allActions:actions,...ctx});
  assert.equal(ctx.workflowVariables.variables.path,'YES');
  assert.equal(results.find(r=>r.stepId==='decision').result.branch.outcome,'High');
  assert.equal(results.filter(r=>['yesStep','noStep','defaultStep'].includes(r.stepId)).length,0);
});

test('builder API names expose stable step outputs while retaining original identifiers', async () => {
  const ctx = makeContext();
  await executeWorkflowActions({ actions: [{ id: 'generated-id', apiName: 'Choose_Channel', key: 'ASSIGNMENT', variableName: 'channel', variableType: 'text', value: 'SMS' }], ...ctx });
  assert.equal(ctx.workflowVariables.steps.Choose_Channel, ctx.workflowVariables.steps['generated-id']);
});

test('loop executes body exactly once per item in reverse order and restores prior current item', async () => {
  const actions=[
    {id:'items',type:'ASSIGNMENT',variableName:'items',variableType:'collection',operator:'set',value:[1,2,3]},
    {id:'loop',type:'LOOP',collection:'variables.items',itemVariable:'current',iterationOrder:'LAST_TO_FIRST',bodyBranch:['collect']},
    {id:'collect',type:'ASSIGNMENT',variableName:'seen',variableType:'collection',operator:'append',value:'variables.current'},
  ];
  const ctx=makeContext();
  ctx.workflowVariables.variables.current='before';
  await executeWorkflowActions({actions,allActions:actions,...ctx});
  assert.deepEqual(ctx.workflowVariables.variables.seen,[3,2,1]);
  assert.equal(ctx.workflowVariables.variables.current,'before');
});

test('fault branch handles a custom error and exposes fault resource', async () => {
  const actions=[
    {id:'explode',type:'CUSTOM_ERROR',errorMessage:'Bad thing',faultMode:'ROUTE',faultBranch:['recover']},
    {id:'recover',type:'ASSIGNMENT',variableName:'recovered',variableType:'text',operator:'set',value:'variables.fault.message'},
  ];
  const ctx=makeContext();
  const results=await executeWorkflowActions({actions,allActions:actions,...ctx});
  const entry=results.find(r=>r.stepId==='explode');
  assert.equal(entry.result.faultHandled,true);
  assert.equal(ctx.workflowVariables.variables.recovered,'Bad thing');
});

test('waiting nested branch is detected recursively', () => {
  const entries=[{result:{status:'completed',branch:{results:[{result:{status:'waiting'}}]}}}];
  assert.equal(workflowResultsContainStatus(entries,'waiting'),true);
});

test('record CRUD respects tenant and store scope and maps workflow resources', async () => {
  const object = { id:'obj1', object_key:'case', source_table:'case_records', company_id:'c1', company_scoped:true, store_scoped:true, active:true };
  const fields = [
    { id:'f1', object_id:'obj1', api_name:'name', source_column:'name', active:true, writable:true, readable:true },
    { id:'f2', object_id:'obj1', api_name:'status', source_column:'status', active:true, writable:true, readable:true },
  ];
  const writes=[];
  const db=async(sql,params=[])=>{
    const s=String(sql);
    if (s.includes('FROM platform_objects')) return {rows:[object]};
    if (s.includes('FROM platform_fields')) return {rows:fields};
    if (s.includes('FROM role_permissions') && s.includes('p.code = ANY')) return {rows:(params[2]||[]).map(code=>({code}))};
    if (s.includes('FROM platform_object_permissions')) return {rows:[{can_view:true,can_create:true,can_edit:true,can_delete:true}]};
    if (s.includes('FROM platform_permission_set_assignments')) return {rows:[]};
    if (s.includes('FROM role_permissions') && s.includes('p.code=$2')) return {rows:[{ok:1}]};
    if (s.includes('FROM platform_duplicate_rules') || s.includes('FROM platform_matching_rules')) return {rows:[]};
    if (s.includes('information_schema.columns')) return {rows:[{one:1}]};
    if (/^(INSERT INTO|UPDATE |DELETE FROM)/.test(s.trim())) {
      writes.push({sql:s,params:[...params]});
      return {rows:[{id:'r1',name:params[0],status:params[1] ?? 'open',company_id:'c1',store_id:'s1'}]};
    }
    return {rows:[]};
  };
  const req={user:{id:'u1',companyId:'c1',storeId:'s1',roleId:'r1',permissions:['workflow.execute','records.create','records.update','records.delete']},_workflowEffectivePermissionSets:[]};
  const workflowVariables={variables:{newName:'Created',newStatus:'closed'},steps:{}};
  const actions=[
    {id:'create',type:'CREATE_RECORD',objectKey:'case',fieldValues:{name:'variables.newName',status:'open'}},
    {id:'update',type:'UPDATE_RECORD',objectKey:'case',recordId:'r1',fieldValues:{status:'variables.newStatus'}},
    {id:'delete',type:'DELETE_RECORD',objectKey:'case',recordId:'r1'},
  ];
  await executeWorkflowActions({actions,allActions:actions,db,req,companyId:'c1',userId:'u1',workflowVariables});
  const createWrite=writes.find(x=>x.sql.includes('INSERT INTO "case_records"'));
  const updateWrite=writes.find(x=>x.sql.includes('UPDATE "case_records" SET "status"'));
  const deleteWrite=writes.find(x=>x.sql.includes('UPDATE "case_records" SET active=false'));
  assert.ok(createWrite);
  assert.match(createWrite.sql,/"company_id"/);
  assert.match(createWrite.sql,/"store_id"/);
  assert.deepEqual(createWrite.params,['Created','open','c1','s1']);
  assert.ok(updateWrite);
  assert.match(updateWrite.sql,/company_id=\$3/);
  assert.match(updateWrite.sql,/store_id=\$4/);
  assert.deepEqual(updateWrite.params,['closed','r1','c1','s1']);
  assert.ok(deleteWrite);
  assert.match(deleteWrite.sql,/company_id=\$2/);
  assert.match(deleteWrite.sql,/store_id=\$3/);
  assert.deepEqual(deleteWrite.params,['r1','c1','s1']);
});


test('screen runtime prefills revisited inputs from workflow variables', async () => {
  const inserts=[];
  const db=async(sql,params=[])=>{
    const s=String(sql);
    if (s.includes('FROM role_permissions') && s.includes('p.code = ANY')) return {rows:(params[2]||[]).map(code=>({code}))};
    if (s.includes('FROM platform_permission_set_assignments')) return {rows:[]};
    if (s.includes('platform_workflow_screen_sessions') && s.startsWith('SELECT')) return {rows:[]};
    if (s.includes('INSERT INTO platform_workflow_screen_sessions')) {
      inserts.push({sql:s,params:[...params]});
      return {rows:[{id:'ss1',screen:JSON.parse(params[3]),values:JSON.parse(params[4])}]};
    }
    if (s.includes('UPDATE platform_workflow_step_runs') || s.includes('UPDATE platform_workflow_runs')) return {rows:[]};
    return {rows:[]};
  };
  const req={user:{id:'u1',companyId:'c1',roleId:'r1',permissions:['workflow.execute']},_workflowEffectivePermissionSets:[]};
  const workflowVariables={variables:{customerName:'Kept value',other:'x'},steps:{}};
  const result=await executeWorkflowAction({
    action:{id:'screen2',type:'SCREEN',allowNext:true,screen:{label:'Details',apiName:'Details',components:[{type:'TEXT',name:'customerName',label:'Customer',input:true},{type:'DISPLAY_TEXT',name:'intro',input:false}]}},
    db,req,companyId:'c1',runId:'run1',stepRunId:'step1',workflowVariables,
  });
  assert.equal(result.status,'waiting');
  assert.equal(inserts.length,1);
  assert.deepEqual(JSON.parse(inserts[0].params[4]),{customerName:'Kept value'});
});

test('collection filter formula and transform target resource execute end to end', async () => {
  const ctx=makeContext({workflowVariables:{variables:{rows:[{name:'A',amount:2},{name:'B',amount:-1}]},steps:{}}});
  const filtered=await executeWorkflowAction({
    ...ctx,
    action:{id:'positive',key:'COLLECTION_FILTER',collection:{path:'variables.rows'},formula:'amount > 0'},
  });
  assert.deepEqual(filtered.collection,[{name:'A',amount:2}]);

  ctx.workflowVariables.variables.positive=filtered.collection;
  const transformed=await executeWorkflowAction({
    ...ctx,
    action:{id:'map',key:'TRANSFORM',collection:{path:'variables.positive'},targetResource:'variables.payloads',transformMappings:{displayName:'item.name',total:'item.amount'}},
  });
  assert.deepEqual(transformed.value,[{displayName:'A',total:2}]);
  assert.deepEqual(ctx.workflowVariables.variables.payloads,[{displayName:'A',total:2}]);
  assert.equal(transformed.resourceName,'payloads');
});

test('subflow resolves tenant-scoped API name and maps declared outputs', async () => {
  const queries=[];
  const childRule={
    id:'child-flow-id',
    company_id:'c1',
    name:'Appointment Child',
    active:true,
    active_version:2,
    action:{
      apiName:'Appointment_Child',
      actions:[{id:'set-result',key:'ASSIGNMENT',variableName:'result',variableType:'text',operator:'set',value:'OK'}],
      inputContract:[{name:'customerId',type:'text',required:true}],
      outputContract:[{name:'result',type:'text',source:'variables.result',required:true}],
    },
  };
  const db=async(sql,params=[])=>{
    const s=String(sql);
    queries.push({sql:s,params:[...params]});
    if (s.includes('FROM role_permissions') && s.includes('p.code = ANY')) return {rows:(params[2]||[]).map(code=>({code}))};
    if (s.includes('FROM platform_permission_set_assignments')) return {rows:[]};
    if (s.includes('FROM platform_rules')) return {rows:[childRule]};
    if (s.includes('INSERT INTO platform_workflow_runs')) return {rows:[]};
    return {rows:[]};
  };
  const req={user:{id:'u1',companyId:'c1',roleId:'r1',permissions:['workflow.execute']},_workflowEffectivePermissionSets:[]};
  const workflowVariables={variables:{customerId:'cust-1'},steps:{}};
  const result=await executeWorkflowAction({
    action:{
      id:'child',
      key:'RUN_SUBFLOW',
      workflowId:'Appointment_Child',
      workflowInputs:{customerId:{path:'variables.customerId'}},
      outputMappings:{result:'variables.childResult'},
    },
    db,req,companyId:'c1',workflowVariables,
  });
  const lookup=queries.find(entry=>entry.sql.includes('FROM platform_rules'));
  assert.ok(lookup);
  assert.match(lookup.sql,/action->>'apiName'/);
  assert.match(lookup.sql,/company_id=\$2 OR company_id IS NULL/);
  assert.deepEqual(lookup.params,['Appointment_Child','c1']);
  assert.equal(result.workflowId,'child-flow-id');
  assert.deepEqual(result.outputs,{result:'OK'});
  assert.equal(workflowVariables.variables.childResult,'OK');
});
