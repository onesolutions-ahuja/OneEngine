import test from 'node:test'
import assert from 'node:assert/strict'
import { platformEventRecordResources, recordPathResources } from '../src/pages/developer/gptbuilder/GPTBuilderResources.js'

test('platform event field_schema expands every readable active field under $Record', () => {
  const events = [{
    event_type: 'communication_message_received',
    field_schema: [
      { api_name: 'mode', label: 'Mode', data_type: 'text' },
      { api_name: 'channel', label: 'Channel', data_type: 'picklist' },
      { api_name: 'attempts', label: 'Attempts', data_type: 'number' },
      { api_name: 'secret_internal', label: 'Secret', data_type: 'text', readable: false },
      { api_name: 'disabled_field', label: 'Disabled', data_type: 'text', active: false },
    ],
  }]
  const rows = platformEventRecordResources(events, 'communication_message_received')
  assert.deepEqual(rows.map((row) => row.path), ['$Record.mode', '$Record.channel', '$Record.attempts'])
  assert.deepEqual(rows.map((row) => row.dataType), ['text', 'picklist', 'number'])
  assert.ok(rows.every((row) => row.resourceType === 'record_field' && row.parentPath === '$Record'))
})

test('changing selected platform event changes its $Record children and never leaks stale fields', () => {
  const events = [
    { event_type: 'one', field_schema: [{ api_name: 'alpha', data_type: 'text' }] },
    { event_type: 'two', field_schema: [{ api_name: 'beta', data_type: 'boolean' }] },
  ]
  assert.deepEqual(platformEventRecordResources(events, 'one').map((row) => row.path), ['$Record.alpha'])
  assert.deepEqual(platformEventRecordResources(events, 'two').map((row) => row.path), ['$Record.beta'])
  assert.deepEqual(platformEventRecordResources(events, '').map((row) => row.path), [])
})

test('record metadata paths expand current and prior record fields including relationships', () => {
  const paths = [
    { kind: 'field', path: 'customer.name', label: 'Name', fieldType: 'text' },
    { kind: 'field', path: 'customer.account.owner.email', label: 'Email', fieldType: 'text' },
    { kind: 'relationship', path: 'customer.account', label: 'Account' },
    { kind: 'field', path: 'customer.disabled', label: 'Disabled', fieldType: 'text', active: false },
    { kind: 'field', path: 'customer.hidden', label: 'Hidden', fieldType: 'text', readable: false },
  ]
  const rows = recordPathResources(paths, 'customer', { includePrior: true })
  assert.deepEqual(rows.map((row) => row.path), [
    '$Record.name',
    '$Record.account.owner.email',
    '$Record__Prior.name',
    '$Record__Prior.account.owner.email',
  ])
  assert.equal(rows.find((row) => row.path === '$Record.account.owner.email')?.dataType, 'text')
})

test('record field expansion contains no business-specific field allowlist', () => {
  const arbitrary = [
    { kind: 'field', path: 'anything.arbitrary_field_928', label: 'Arbitrary', fieldType: 'currency' },
  ]
  const rows = recordPathResources(arbitrary, 'anything', { includePrior: false })
  assert.deepEqual(rows.map((row) => ({ path: row.path, type: row.dataType })), [
    { path: '$Record.arbitrary_field_928', type: 'currency' },
  ])
})
