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
