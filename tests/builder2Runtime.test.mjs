import test from 'node:test'
import assert from 'node:assert/strict'
import { configuredValue, nativeRuntimeAction } from '../src/pages/developer/builder2Runtime.js'
import { getWorkflowActionDefinition } from '../server/services/platformWorkflow.js'

test('native query preserves filters, bindings, ordering and collection limit in runtime contract', () => {
  const action = nativeRuntimeAction({ id: 'available', type: 'GET_RECORDS', config: { objectKey: 'appointment', conditions: [{ resource: 'resource_id', operator: 'Equals', value: 'steps.resource.record.id' }], sortBy: 'starts_at', sortOrder: 'asc', limit: 'limited', maxRecords: '5' } })
  getWorkflowActionDefinition(action.key).validation(action)
  assert.deepEqual(action.filters, [{ field: 'resource_id', operator: 'equals', value: { path: 'steps.resource.record.id' } }])
  assert.equal(action.limit, 5)
  assert.equal(action.store, 'all')
})

test('native create emits ordinary CRUD and preserves structured session state', () => {
  const action = nativeRuntimeAction({ id: 'session', type: 'CREATE_RECORDS', config: { objectKey: 'appointment_booking_case', fieldValues: [{ field: 'sender', value: '$record.sender' }, { field: 'state', value: '{"step":"WAITING_FOR_DATE"}' }] } })
  getWorkflowActionDefinition(action.key).validation(action)
  assert.deepEqual(action.fieldValues, { sender: { path: 'sender' }, state: { step: 'WAITING_FOR_DATE' } })
  assert.equal(action.key, 'CREATE_RECORD')
})

test('native update preserves explicit single-record identity', () => {
  const action = nativeRuntimeAction({ type: 'UPDATE_RECORDS', config: { objectKey: 'appointment_booking_case', recordId: 'steps.session.record.id', fieldValues: [{ field: 'status', value: 'CLOSED' }] } })
  getWorkflowActionDefinition(action.key).validation(action)
  assert.equal(action.key, 'UPDATE_RECORD')
  assert.deepEqual(action.recordId, { path: 'steps.session.record.id' })
})

test('native create supports record and collection resources without hidden mappings', () => {
  const recordAction = nativeRuntimeAction({ type: 'CREATE_RECORDS', label: 'Create one', config: { objectKey: 'appointment', valueMode: 'record', sourceRecord: 'variables.draft' } })
  const collectionAction = nativeRuntimeAction({ type: 'CREATE_RECORDS', label: 'Create many', config: { objectKey: 'appointment', valueMode: 'collection', sourceRecord: 'variables.drafts' } })
  getWorkflowActionDefinition(recordAction.key).validation(recordAction)
  getWorkflowActionDefinition(collectionAction.key).validation(collectionAction)
  assert.deepEqual(recordAction.sourceRecord, { path: 'variables.draft' })
  assert.deepEqual(collectionAction.sourceRecords, { path: 'variables.drafts' })
})

test('native update maps condition and record-resource modes to generic bulk update', () => {
  const byConditions = nativeRuntimeAction({ type: 'UPDATE_RECORDS', config: {
    objectKey: 'appointment',
    updateMode: 'conditions',
    conditionLogic: 'all',
    conditions: [{ resource: 'status', operator: 'Equals', value: 'OPEN' }],
    fieldValues: [{ field: 'status', value: 'CLOSED' }],
  } })
  const byRecords = nativeRuntimeAction({ type: 'UPDATE_RECORDS', config: {
    objectKey: 'appointment',
    updateMode: 'record',
    sourceRecord: 'variables.appointments',
  } })
  getWorkflowActionDefinition(byConditions.key).validation(byConditions)
  getWorkflowActionDefinition(byRecords.key).validation(byRecords)
  assert.equal(byConditions.key, 'BULK_UPDATE_RECORDS')
  assert.deepEqual(byConditions.filters, [{ field: 'status', operator: 'equals', value: 'OPEN' }])
  assert.deepEqual(byRecords.records, { path: 'variables.appointments' })
})

test('native delete maps filters and record resources to the existing delete action', () => {
  const byConditions = nativeRuntimeAction({ type: 'DELETE_RECORDS', config: {
    objectKey: 'appointment',
    deleteMode: 'conditions',
    conditionLogic: 'any',
    conditions: [{ resource: 'status', operator: 'Equals', value: 'CANCELLED' }],
  } })
  const byRecords = nativeRuntimeAction({ type: 'DELETE_RECORDS', config: {
    objectKey: 'appointment',
    deleteMode: 'record',
    sourceRecord: 'variables.cancelledAppointments',
  } })
  getWorkflowActionDefinition(byConditions.key).validation(byConditions)
  getWorkflowActionDefinition(byRecords.key).validation(byRecords)
  assert.equal(byConditions.key, 'DELETE_RECORD')
  assert.equal(byConditions.match, 'any')
  assert.deepEqual(byRecords.records, { path: 'variables.cancelledAppointments' })
})

test('assignment preserves variable type and references', () => {
  const action = nativeRuntimeAction({ type: 'ASSIGNMENT', config: { resource: 'messageChannel', value: '$record.channel' } }, [{ value: 'messageChannel', dataType: 'Text' }])
  getWorkflowActionDefinition(action.key).validation(action)
  assert.equal(action.variableName, 'messageChannel')
  assert.deepEqual(action.value, { path: 'channel' })
  assert.equal(configuredValue('APPOINTMENT'), 'APPOINTMENT')
})


test('native collection filter and sort map Builder fields to runtime contracts', () => {
  const filter = nativeRuntimeAction({ type:'COLLECTION_FILTER', label:'Open only', config:{
    collection:'variables.rows', filterMode:'conditions', conditionLogic:'any',
    conditions:[{resource:'status',operator:'Equals',value:'OPEN'}],
  }})
  const formulaFilter = nativeRuntimeAction({ type:'COLLECTION_FILTER', label:'Positive', config:{
    collection:'variables.rows', filterMode:'formula', filterFormula:'amount > 0',
  }})
  const sort = nativeRuntimeAction({ type:'COLLECTION_SORT', label:'Newest', config:{
    collection:'variables.rows', sortField:'created_at', order:'desc', max:'10',
  }})
  getWorkflowActionDefinition(filter.key).validation(filter)
  getWorkflowActionDefinition(formulaFilter.key).validation(formulaFilter)
  getWorkflowActionDefinition(sort.key).validation(sort)
  assert.deepEqual(filter.collection,{path:'variables.rows'})
  assert.equal(filter.match,'any')
  assert.equal(formulaFilter.formula,'amount > 0')
  assert.equal(sort.sortField,'created_at')
  assert.equal(sort.sortDirection,'desc')
  assert.equal(sort.limit,10)
})

test('native wait modes use the existing durable wait actions', () => {
  const duration = nativeRuntimeAction({type:'WAIT',label:'One hour',config:{waitType:'duration',amount:'1',unit:'hours'}})
  const date = nativeRuntimeAction({type:'WAIT',label:'Until start',config:{waitType:'date',dateResource:'variables.startsAt'}})
  const conditions = nativeRuntimeAction({type:'WAIT',label:'Until ready',config:{
    waitType:'conditions',conditionLogic:'all',conditions:[{resource:'status',operator:'Equals',value:'READY'}],
  }})
  assert.equal(duration.key,'WAIT')
  assert.equal(duration.durationSeconds,3600)
  assert.equal(date.key,'WAIT_UNTIL_DATE')
  assert.deepEqual(date.resumeAt,{path:'variables.startsAt'})
  assert.equal(conditions.key,'WAIT_FOR_CONDITIONS')
  assert.equal(conditions.waitCondition.conditions[0].field,'status')
  assert.throws(()=>nativeRuntimeAction({type:'WAIT',label:'Event wait',config:{waitType:'event',eventKey:'Case_Updated'}}),/event waits are not supported/i)
})

test('native transform stores its output target and requires JSON field mappings', () => {
  const action=nativeRuntimeAction({type:'TRANSFORM',label:'Map customer',config:{
    source:'variables.customers',target:'variables.payloads',mappingsText:'{"name":"item.name","email":"item.email"}',
  }})
  getWorkflowActionDefinition(action.key).validation(action)
  assert.deepEqual(action.collection,{path:'variables.customers'})
  assert.equal(action.targetResource,'variables.payloads')
  assert.deepEqual(action.transformMappings,{name:'item.name',email:'item.email'})
  assert.throws(()=>nativeRuntimeAction({type:'TRANSFORM',label:'Bad map',config:{source:'variables.rows',target:'variables.out',mappingsText:'not-json'}}),/valid JSON/)
})

test('native subflow maps API name inputs and outputs without exposing IDs', () => {
  const action=nativeRuntimeAction({type:'SUBFLOW',label:'Book child',config:{
    flow:'Appointment_Child',
    inputsText:'{"customerId":"variables.customerId"}',
    outputsText:'{"result":"variables.result"}',
  }})
  getWorkflowActionDefinition(action.key).validation(action)
  assert.equal(action.key,'RUN_SUBFLOW')
  assert.equal(action.workflowId,'Appointment_Child')
  assert.deepEqual(action.workflowInputs,{customerId:{path:'variables.customerId'}})
  assert.deepEqual(action.outputMappings,{result:'variables.result'})
})

test('native screen flattens Builder screen metadata into the Screen runtime contract', () => {
  const action=nativeRuntimeAction({type:'SCREEN',label:'Details',apiName:'Details',config:{
    navigation:'both',showFooter:true,components:[{id:'c1',type:'TEXT',label:'Name',apiName:'customerName',choices:[]}],
  }})
  getWorkflowActionDefinition(action.key).validation(action)
  assert.equal(action.key,'SCREEN')
  assert.equal(action.screen.label,'Details')
  assert.equal(action.screen.components[0].name,'customerName')
  assert.equal(action.allowBack,true)
  assert.equal(action.allowNext,true)
})

test('native loop requires explicit current item and body path in its runtime contract', () => {
  const action=nativeRuntimeAction({type:'LOOP',label:'Each row',config:{
    collection:'variables.rows',itemVariable:'Current_Row',direction:'last',bodyBranch:['step-2'],
  }})
  getWorkflowActionDefinition(action.key).validation(action)
  assert.deepEqual(action.collection,{path:'variables.rows'})
  assert.equal(action.itemVariable,'Current_Row')
  assert.equal(action.iterationOrder,'LAST_TO_FIRST')
  assert.deepEqual(action.bodyBranch,['step-2'])
})
