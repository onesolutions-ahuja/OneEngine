import test from 'node:test'
import assert from 'node:assert/strict'
import { ConditionError, evaluateCondition, validateConditionConfig } from '../server/services/platformConditions.js'

const fields = [
  { api_name: 'expires_at', field_type: 'datetime', active: true },
]

test('workflow Decision validation accepts Builder resource bindings as comparison values', () => {
  assert.doesNotThrow(() => validateConditionConfig(
    {
      match: 'all',
      conditions: [
        { field: 'expires_at', operator: 'greater_than', value: { path: 'variables.currentTime' } },
      ],
    },
    fields,
    'Decision outcome "Valid Future Date"',
    { allowResources: true },
  ))
})

test('workflow Decision validation accepts Builder record-path bindings', () => {
  assert.doesNotThrow(() => validateConditionConfig(
    {
      match: 'all',
      conditions: [
        { field: 'expires_at', operator: 'greater_than', value: { path: 'body' } },
      ],
    },
    fields,
    'Decision outcome "Valid Future Date"',
    { allowResources: true },
  ))
})

test('workflow Decision validation accepts step bindings and optional fallback', () => {
  assert.doesNotThrow(() => validateConditionConfig(
    {
      match: 'all',
      conditions: [
        {
          field: 'expires_at',
          operator: 'greater_than',
          value: { path: 'steps.clock.record.current_time', fallback: '2026-10-04T00:00:00Z' },
        },
      ],
    },
    fields,
    'Decision outcome "Valid Future Date"',
    { allowResources: true },
  ))
})

test('workflow Decision validation still rejects arbitrary structured comparison values', () => {
  assert.throws(
    () => validateConditionConfig(
      {
        match: 'all',
        conditions: [
          { field: 'expires_at', operator: 'greater_than', value: { arbitrary: true } },
        ],
      },
      fields,
      'Decision outcome "Valid Future Date"',
      { allowResources: true },
    ),
    ConditionError,
  )
})


test('condition engine supports Salesforce-style custom condition logic with NOT and parentheses', () => {
  const config = {
    match: 'custom',
    conditionLogic: '1 AND (2 OR NOT 3)',
    conditions: [
      { field: 'expires_at', operator: 'greater_than', value: '2026-10-01T00:00:00Z' },
      { field: 'expires_at', operator: 'less_than', value: '2026-11-01T00:00:00Z' },
      { field: 'expires_at', operator: 'equals', value: '2026-10-15T00:00:00Z' },
    ],
  }
  assert.doesNotThrow(() => validateConditionConfig(config, fields, 'Start'))
  assert.equal(evaluateCondition(config, fields, { expires_at: '2026-10-20T00:00:00Z' }), true)
  assert.equal(evaluateCondition(config, fields, { expires_at: '2026-10-15T00:00:00Z' }), true)
  assert.equal(evaluateCondition(config, fields, { expires_at: '2026-11-20T00:00:00Z' }), false)
})

test('condition engine rejects custom logic that references unavailable rows', () => {
  assert.throws(
    () => validateConditionConfig({
      match: 'custom',
      conditionLogic: '1 AND 2',
      conditions: [{ field: 'expires_at', operator: 'is_not_empty' }],
    }, fields, 'Start'),
    /unavailable condition/,
  )
})
