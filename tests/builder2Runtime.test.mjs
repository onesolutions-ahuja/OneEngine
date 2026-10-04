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

test('native query keeps selected-field and advanced assignment metadata', () => {
  const selected = nativeRuntimeAction({ id: 'q1', type: 'GET_RECORDS', config: { objectKey: 'case', conditionLogic: 'none', store: 'choose', selectedFields: ['name', 'status'] } })
  assert.deepEqual(selected.selectedFields, ['name', 'status'])
  const advanced = nativeRuntimeAction({ id: 'q2', type: 'GET_RECORDS', config: { objectKey: 'case', conditionLogic: 'none', store: 'advanced', fieldAssignments: [{ field: 'name', resource: 'variables.caseName' }] } })
  assert.deepEqual(advanced.fieldAssignments, [{ field: 'name', resource: 'variables.caseName' }])
})

test('native create emits ordinary CRUD and preserves structured session state', () => {
  const action = nativeRuntimeAction({ id: 'session', type: 'CREATE_RECORDS', config: { objectKey: 'appointment_booking_case', fieldValues: [{ field: 'sender', value: '$record.sender' }, { field: 'state', value: '{"step":"WAITING_FOR_DATE"}' }] } })
  getWorkflowActionDefinition(action.key).validation(action)
  assert.deepEqual(action.fieldValues, { sender: { path: 'sender' }, state: { step: 'WAITING_FOR_DATE' } })
  assert.equal(action.key, 'CREATE_RECORD')
})

test('native create supports record and record-collection resources', () => {
  const one = nativeRuntimeAction({ id: 'create-one', type: 'CREATE_RECORDS', config: { objectKey: 'case', valueMode: 'record', sourceRecord: 'variables.newCase' } })
  assert.equal(one.key, 'CREATE_RECORD')
  assert.deepEqual(one.sourceRecord, { path: 'variables.newCase' })
  getWorkflowActionDefinition(one.key).validation(one)

  const many = nativeRuntimeAction({ id: 'create-many', type: 'CREATE_RECORDS', config: { objectKey: 'case', valueMode: 'collection', sourceRecord: 'variables.newCases' } })
  assert.equal(many.key, 'CREATE_RECORDS')
  assert.deepEqual(many.sourceRecord, { path: 'variables.newCases' })
  getWorkflowActionDefinition(many.key).validation(many)
})

test('native update maps Salesforce-style conditions and record resources without hidden identity', () => {
  const byConditions = nativeRuntimeAction({ id: 'update-many', type: 'UPDATE_RECORDS', label: 'Close cases', config: {
    objectKey: 'case',
    updateMode: 'conditions',
    conditionLogic: 'any',
    conditions: [{ resource: 'status', operator: 'Equals', value: 'open' }, { resource: 'priority', operator: 'Greater Than', value: '5' }],
    fieldValues: [{ field: 'status', value: 'closed' }],
  } })
  assert.equal(byConditions.key, 'BULK_UPDATE_RECORDS')
  assert.equal(byConditions.match, 'any')
  assert.deepEqual(byConditions.filters, [
    { field: 'status', operator: 'equals', value: 'open' },
    { field: 'priority', operator: 'greater_than', value: '5' },
  ])
  assert.deepEqual(byConditions.fieldValues, { status: 'closed' })
  getWorkflowActionDefinition(byConditions.key).validation(byConditions)

  const byRecord = nativeRuntimeAction({ id: 'update-records', type: 'UPDATE_RECORDS', label: 'Save cases', config: {
    objectKey: 'case', updateMode: 'record', sourceRecord: 'variables.casesToSave',
  } })
  assert.equal(byRecord.key, 'UPDATE_RECORD')
  assert.deepEqual(byRecord.sourceRecord, { path: 'variables.casesToSave' })
  getWorkflowActionDefinition(byRecord.key).validation(byRecord)
})

test('native update keeps legacy explicit record identity for seeded flows', () => {
  const action = nativeRuntimeAction({ type: 'UPDATE_RECORDS', config: { objectKey: 'appointment_booking_case', recordId: 'steps.session.record.id', fieldValues: [{ field: 'status', value: 'CONFIRMED' }] } })
  assert.equal(action.key, 'UPDATE_RECORD')
  assert.deepEqual(action.recordId, { path: 'steps.session.record.id' })
  assert.deepEqual(action.fieldValues, { status: 'CONFIRMED' })
})

test('native delete maps conditions and record resources', () => {
  const byConditions = nativeRuntimeAction({ id: 'delete-old', type: 'DELETE_RECORDS', label: 'Delete old cases', config: {
    objectKey: 'case', deleteMode: 'conditions', conditions: [{ resource: 'status', operator: 'Equals', value: 'obsolete' }],
  } })
  assert.equal(byConditions.key, 'DELETE_RECORD')
  assert.deepEqual(byConditions.filters, [{ field: 'status', operator: 'equals', value: 'obsolete' }])
  getWorkflowActionDefinition(byConditions.key).validation(byConditions)

  const byRecord = nativeRuntimeAction({ id: 'delete-selected', type: 'DELETE_RECORDS', label: 'Delete selected cases', config: {
    objectKey: 'case', deleteMode: 'record', sourceRecord: 'variables.casesToDelete',
  } })
  assert.deepEqual(byRecord.sourceRecord, { path: 'variables.casesToDelete' })
  getWorkflowActionDefinition(byRecord.key).validation(byRecord)
})

test('unsupported filter modes fail visibly instead of silently executing as all records', () => {
  assert.throws(() => nativeRuntimeAction({ type: 'UPDATE_RECORDS', label: 'Unsafe update', config: { objectKey: 'case', conditionLogic: 'formula', formula: 'true', fieldValues: [{ field: 'status', value: 'closed' }] } }), /formula-based record filtering/)
  assert.throws(() => nativeRuntimeAction({ type: 'DELETE_RECORDS', label: 'Unsafe delete', config: { objectKey: 'case', conditionLogic: 'custom', conditions: [{ resource: 'status', operator: 'Equals', value: 'open' }] } }), /custom condition logic/)
})

test('assignment preserves variable type and references', () => {
  const action = nativeRuntimeAction({ type: 'ASSIGNMENT', config: { resource: 'messageChannel', value: '$record.channel' } }, [{ value: 'messageChannel', dataType: 'Text' }])
  getWorkflowActionDefinition(action.key).validation(action)
  assert.equal(action.variableName, 'messageChannel')
  assert.deepEqual(action.value, { path: 'channel' })
  assert.equal(configuredValue('APPOINTMENT'), 'APPOINTMENT')
})
