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
