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

test('native update requires explicit identity instead of updating the trigger record accidentally', () => {
  assert.throws(() => nativeRuntimeAction({ type: 'UPDATE_RECORDS', label: 'Save session', config: {} }), /record ID/)
  const action = nativeRuntimeAction({ type: 'UPDATE_RECORDS', config: { objectKey: 'appointment_booking_case', recordId: 'steps.session.record.id', fieldValues: [] } })
  assert.deepEqual(action.recordId, { path: 'steps.session.record.id' })
})

test('assignment preserves variable type and references', () => {
  const action = nativeRuntimeAction({ type: 'ASSIGNMENT', config: { resource: 'messageChannel', value: '$record.channel' } }, [{ value: 'messageChannel', dataType: 'Text' }])
  getWorkflowActionDefinition(action.key).validation(action)
  assert.equal(action.variableName, 'messageChannel')
  assert.deepEqual(action.value, { path: 'channel' })
  assert.equal(configuredValue('APPOINTMENT'), 'APPOINTMENT')
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
