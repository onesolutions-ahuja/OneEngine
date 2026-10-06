import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  decisionConfigErrors,
  decisionResourceType,
  compatibleDecisionResources,
} from '../src/pages/developer/gptbuilder/GPTBuilderDecisionLogic.js'
import {
  platformEventRecordResources,
  recordPathResources,
} from '../src/pages/developer/gptbuilder/GPTBuilderResources.js'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const resource = (path, dataType, extra = {}) => ({ id: path, path, apiName: path, label: path, dataType, ...extra })

test('N001 missing event metadata produces no invented $Record child fields', () => {
  assert.deepEqual(platformEventRecordResources([], 'missing_event'), [])
  assert.deepEqual(platformEventRecordResources([{ event_type: 'known', field_schema: null }], 'known'), [])
  assert.deepEqual(platformEventRecordResources([{ event_type: 'known', field_schema: {} }], 'known'), [])
})

test('N001 record path expansion ignores non-fields, unreadable fields, disabled fields and blank paths', () => {
  const rows = recordPathResources([
    { kind: 'relationship', path: 'customer.account', label: 'Account' },
    { kind: 'field', path: '', label: 'Blank' },
    { kind: 'field', path: 'customer.hidden', readable: false },
    { kind: 'field', path: 'customer.disabled', active: false },
  ], 'customer')
  assert.deepEqual(rows, [])
})

test('resource expansion deduplicates duplicate metadata paths instead of creating ambiguous choices', () => {
  const events = [{ event_type: 'evt', field_schema: [
    { api_name: 'mode', label: 'Mode', data_type: 'text' },
    { api_name: 'mode', label: 'Mode Duplicate', data_type: 'text' },
  ] }]
  assert.deepEqual(platformEventRecordResources(events, 'evt').map((row) => row.path), ['$Record.mode'])

  const records = recordPathResources([
    { kind: 'field', path: 'customer.name', label: 'Name', fieldType: 'text' },
    { kind: 'field', path: 'customer.name', label: 'Name Duplicate', fieldType: 'text' },
  ], 'customer', { includePrior: true })
  assert.deepEqual(records.map((row) => row.path), ['$Record.name', '$Record__Prior.name'])
})

test('N002 compatible resource comparisons reject mismatched and unknown data types', () => {
  const source = resource('$Record.total', 'currency')
  const rows = [
    resource('$Record.subtotal', 'currency'),
    resource('$Record.count', 'number'),
    resource('$Record.name', 'text'),
    { id: 'malformed', path: '$Record.malformed', apiName: '$Record.malformed' },
  ]
  assert.equal(decisionResourceType(source), 'currency')
  assert.deepEqual(compatibleDecisionResources(rows, source).map((row) => row.path), ['$Record.subtotal'])
  assert.deepEqual(compatibleDecisionResources(rows, rows[3]), [])
})

test('N002 Decision validation rejects a resource-to-resource comparison with incompatible types', () => {
  const resources = [
    resource('$Record.total', 'currency'),
    resource('$Record.name', 'text'),
  ]
  const errors = decisionConfigErrors({
    logicMode: 'manual',
    outcomes: [{
      id: 'o1',
      label: 'Match',
      apiName: 'Match',
      conditionLogic: 'all',
      conditions: [{
        id: 'c1',
        resource: '$Record.total',
        operator: 'equals',
        valueMode: 'resource',
        value: '$Record.name',
      }],
    }],
  }, 'record', resources)
  assert.ok(errors.some((error) => /comparison resource type does not match/i.test(error)), errors.join('\n'))
})

test('N003 Decision validation rejects saved bindings whose metadata resource was removed or renamed', () => {
  const errors = decisionConfigErrors({
    logicMode: 'manual',
    outcomes: [{
      id: 'o1',
      label: 'Still valid label',
      apiName: 'Still_valid_label',
      conditionLogic: 'all',
      conditions: [{
        id: 'c1',
        resource: '$Record.removed_field',
        operator: 'equals',
        valueMode: 'literal',
        value: 'x',
      }],
    }],
  }, 'record', [resource('$Record.current_field', 'text')])
  assert.ok(errors.some((error) => /selected resource is no longer available/i.test(error)), errors.join('\n'))
})

test('N003 stale split resources are rejected rather than rebound to another field', () => {
  const errors = decisionConfigErrors({
    logicMode: 'field_value',
    splitResource: '$Record.old_status',
    outcomes: [{ id: 'o1', label: 'Open', apiName: 'Open', splitValue: 'OPEN' }],
  }, 'record', [resource('$Record.status', 'text')])
  assert.ok(errors.includes('The selected split resource is no longer available.'))
})

test('date Decision mode rejects a non-date split resource', () => {
  const errors = decisionConfigErrors({
    logicMode: 'date',
    splitResource: '$Record.name',
    outcomes: [{ id: 'o1', label: 'Later', apiName: 'Later', splitValue: '2026-10-05T12:00' }],
  }, 'record', [resource('$Record.name', 'text')])
  assert.ok(errors.includes('Select a Date or Date-Time resource.'))
})

test('N004 activation remains blocked when the current definition has validation errors or unsaved changes', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  assert.match(page, /if \(!workflowId \|\| dirty \|\| \(shouldActivate && issues\.some\(\(issue\) => issue\.level === 'error'\)\)\) return/)
  assert.match(page, /if \(!elements\.length\) next\.push/)
  assert.match(page, /if \(!element\.configured\) next\.push/)
})

test('N005 API failures stay failures and cannot be reported as successful save or activation', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  assert.match(page, /catch \(error\) \{\s*setSaveError\(error\?\.message \|\| 'Unable to save flow'\)/)
  assert.match(page, /catch \(error\) \{\s*setSaveError\(error\?\.message \|\| \(shouldActivate \? 'Unable to activate flow' : 'Unable to deactivate flow'\)\)/)
  assert.doesNotMatch(page, /catch \(error\)[\s\S]{0,180}setMessage\('Flow saved\.'\)/)
})

test('regression: React Flow does not leak unsupported deletion props to the DOM', async () => {
  const canvas = await read('src/pages/developer/gptbuilder/GPTBuilderReactFlowCanvas.jsx')
  assert.doesNotMatch(canvas, /nodesDeletable=/)
  assert.doesNotMatch(canvas, /edgesDeletable=/)
})
