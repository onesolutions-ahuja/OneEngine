import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requiresRuntimeRecordEditor, validateDefinition } from '../src/pages/developer/builder2Model.js'

test('runtime record maps use the registered action editor without losing values', () => {
  const action = { key: 'CREATE_RECORD', objectKey: 'case', fieldValues: { channel: 'WHATSAPP', priority: 0 } }
  assert.equal(requiresRuntimeRecordEditor(action), true)
  const node = { id: 'create-case', type: 'ACTION', label: 'Create case', config: { actionKey: action.key, inputs: action } }
  assert.doesNotThrow(() => validateDefinition({ flowType: 'autolaunched', nodes: [node], edges: [], resources: [], startConfig: {} }))
  assert.deepEqual(node.config.inputs.fieldValues, { channel: 'WHATSAPP', priority: 0 })
})

test('native builder arrays retain native controls', () => {
  assert.equal(requiresRuntimeRecordEditor({ key: 'CREATE_RECORD', config: { fieldValues: [{ field: 'channel', value: 'WHATSAPP' }] } }), false)
  assert.equal(requiresRuntimeRecordEditor({ key: 'GET_RECORDS', conditions: { match: 'all', rules: [] } }), true)
  assert.equal(requiresRuntimeRecordEditor({ key: 'SEND_WHATSAPP', fieldValues: {} }), false)
})
