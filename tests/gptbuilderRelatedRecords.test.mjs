import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getWorkflowActionDefinition } from '../server/services/platformWorkflow.js'

test('Get Records related-record beta is exposed only for autolaunched GPT Builder flows', async () => {
  const getRecords = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx', import.meta.url), 'utf8')
  const related = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderRelatedRecords.jsx', import.meta.url), 'utf8')
  assert.match(getRecords, /flowType === 'autolaunched'/)
  assert.match(getRecords, /Also add related records \(beta\)/)
  assert.match(getRecords, /Select Related Records/)
  for (const text of ['Select Related Objects and Fields','Add Related Object','Fields','Filter, Sort, Store','Preview','Data Structure Preview']) {
    assert.ok(related.includes(text), text)
  }
})

test('related-record selector persists relationship identity, fields, filters, sorting and limits into runtime metadata', async () => {
  const getRecords = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx', import.meta.url), 'utf8')
  const related = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderRelatedRecords.jsx', import.meta.url), 'utf8')
  assert.match(getRecords, /relatedRecords: c\.relatedEnabled \? c\.relatedSelections\.map\(relatedRuntimeConfig\)/)
  for (const key of ['relationshipId','relationshipKey','objectKey','filters','customConditionLogic','sortField','sortDirection','limit','fieldSelection','selectedFields']) {
    assert.ok(related.includes(key), key)
  }
})

function relatedDb() {
  const calls = []
  const db = async (sql, params = []) => {
    const text = String(sql)
    calls.push({ sql: text, params })
    if (text.includes('FROM platform_objects') && text.includes('object_key=$1')) {
      return { rows: [{ id: 'root-object', object_key: 'order', label: 'Order', source_table: 'orders', active: true, company_id: null, company_scoped: false, store_scoped: false }] }
    }
    if (text.includes('FROM platform_relationships')) {
      return { rows: [{
        id: 'rel-1',
        relationship_key: 'items',
        child_object_id: 'child-object',
        child_field_id: 'child-parent-field',
        child_object_key: 'order_item',
        child_object_label: 'Order Item',
        child_source_table: 'order_items',
        child_company_id: null,
        child_company_scoped: false,
        child_store_scoped: false,
        child_field_api_name: 'order_id',
        child_field_source_column: 'order_id',
      }] }
    }
    if (text.includes('FROM platform_fields') && params[0] === 'root-object') {
      return { rows: [
        { id: 'root-status', object_id: 'root-object', api_name: 'status', source_column: 'status', label: 'Status', readable: true, active: true, field_type: 'text' },
      ] }
    }
    if (text.includes('FROM platform_fields') && params[0] === 'child-object') {
      return { rows: [
        { id: 'child-parent-field', object_id: 'child-object', api_name: 'order_id', source_column: 'order_id', label: 'Order', readable: true, active: true, field_type: 'lookup' },
        { id: 'child-status', object_id: 'child-object', api_name: 'status', source_column: 'status', label: 'Status', readable: true, active: true, field_type: 'text' },
        { id: 'child-amount', object_id: 'child-object', api_name: 'amount', source_column: 'amount', label: 'Amount', readable: true, active: true, field_type: 'number' },
      ] }
    }
    if (text.includes('FROM "orders"')) return { rows: [{ id: 'order-1', status: 'OPEN' }] }
    if (text.includes('FROM "order_items"')) return { rows: [
      { id: 'item-2', __parent_id: 'order-1', status: 'OPEN', amount: 20 },
      { id: 'item-1', __parent_id: 'order-1', status: 'OPEN', amount: 10 },
    ] }
    throw new Error('Unexpected SQL: ' + text)
  }
  return { db, calls }
}

test('Get Records runtime fetches metadata-related child collections and nests them on the root record', async () => {
  const definition = getWorkflowActionDefinition('GET_RECORDS')
  const action = {
    key: 'GET_RECORDS',
    objectKey: 'order',
    filters: [],
    limit: 1,
    store: 'first',
    fieldSelection: 'auto',
    relatedRecords: [{
      relationshipId: 'rel-1',
      relationshipKey: 'items',
      objectKey: 'order_item',
      filters: [{ field: 'status', operator: 'equals', value: 'OPEN' }],
      match: 'all',
      sortField: 'amount',
      sortDirection: 'desc',
      limit: 2,
      fieldSelection: 'choose',
      selectedFields: ['status','amount'],
    }],
  }
  assert.doesNotThrow(() => definition.validation(action))
  const { db, calls } = relatedDb()
  const result = await definition.executor({
    db,
    action,
    req: null,
    companyId: 'company-1',
    object: null,
    record: null,
    previousRecord: null,
    workflowVariables: { variables: {}, steps: {} },
  })
  assert.equal(result.record.id, 'order-1')
  assert.deepEqual(result.record.items, [
    { id: 'item-2', status: 'OPEN', amount: 20 },
    { id: 'item-1', status: 'OPEN', amount: 10 },
  ])
  assert.deepEqual(result.relatedRecords.items, result.record.items)
  const child = calls.find((call) => call.sql.includes('FROM "order_items"'))
  assert.ok(child)
  assert.match(child.sql, /"order_id"::text = ANY\(\$1::text\[\]\)/)
  assert.match(child.sql, /"status"=\$2/)
  assert.match(child.sql, /ORDER BY "amount" DESC/)
  assert.match(child.sql, /"status" AS "status"/)
  assert.match(child.sql, /"amount" AS "amount"/)
  assert.doesNotMatch(child.sql, /"order_id" AS "order_id"/)
  assert.equal(child.params.at(-1), 2)
})

test('Get Records rejects unrelated or malformed related-record metadata before execution', () => {
  const definition = getWorkflowActionDefinition('GET_RECORDS')
  assert.throws(() => definition.validation({
    key: 'GET_RECORDS',
    objectKey: 'order',
    relatedRecords: [{ relationshipKey: '', objectKey: 'order_item' }],
  }), /requires relationship and object metadata/)
  assert.throws(() => definition.validation({
    key: 'GET_RECORDS',
    objectKey: 'order',
    relatedRecords: [{
      relationshipKey: 'items',
      objectKey: 'order_item',
      filters: [{ field: 'status', operator: 'equals', value: 'OPEN' }],
      customConditionLogic: '1 AND 2',
    }],
  }), /unavailable condition/)
})
