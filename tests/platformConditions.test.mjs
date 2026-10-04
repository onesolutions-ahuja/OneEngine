import test from 'node:test'
import assert from 'node:assert/strict'
import { ConditionError, validateConditionConfig } from '../server/services/platformConditions.js'

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
