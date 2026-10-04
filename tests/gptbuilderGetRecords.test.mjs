import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getWorkflowActionDefinition } from '../server/services/platformWorkflow.js'

function mockGetRecordsDb(rows = [{ id: 'r1', status: 'Active', amount: 25 }]) {
  const calls = []
  const db = async (sql, params = []) => {
    calls.push({ sql: String(sql), params })
    if (String(sql).includes('FROM platform_objects')) {
      return { rows: [{ id: 'obj-1', object_key: 'order', source_table: 'orders', active: true, company_id: null, company_scoped: false, store_scoped: false }] }
    }
    if (String(sql).includes('FROM platform_fields')) {
      return { rows: [
        { id: 'f1', object_id: 'obj-1', api_name: 'status', source_column: 'status', label: 'Status', readable: true, active: true, field_type: 'text' },
        { id: 'f2', object_id: 'obj-1', api_name: 'amount', source_column: 'amount', label: 'Amount', readable: true, active: true, field_type: 'number' },
      ] }
    }
    if (String(sql).startsWith('SELECT ')) return { rows }
    throw new Error('Unexpected SQL in Get Records test: ' + sql)
  }
  return { db, calls }
}

test('GPT Builder Get Records UI includes the full stable Salesforce property surface', async () => {
  const source = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx', import.meta.url), 'utf8')
  for (const label of [
    'Get Records of This Object',
    'Condition Requirements',
    'All Conditions Are Met (AND)',
    'Any Condition Is Met (OR)',
    'Custom Condition Logic Is Met',
    'None — Get All Records',
    'Sort Order',
    'Not Sorted',
    'Ascending',
    'Descending',
    'How Many Records to Store',
    'Only the first record',
    'All records, up to a specified limit',
    'Maximum Number of Records to Store',
    'How to Store Record Data',
    'Automatically store all fields',
    'Choose fields and let OneEngine do the rest',
    'Choose fields and assign variables (advanced)',
    'Together in a record variable',
    'In separate variables',
  ]) assert.ok(source.includes(label), label)
  assert.ok(!source.includes('Formula Evaluates to True'), 'Get Records must not invent the Start-element formula option')
})

test('GPT Builder Get Records exposes Salesforce data-element operators by field type', async () => {
  const source = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx', import.meta.url), 'utf8')
  for (const op of ['Equals','Does Not Equal','Is Null','Greater Than','Greater Than or Equal','Less Than','Less Than or Equal','Contains','Starts With','Ends With','In','Not In']) {
    assert.ok(source.includes(op), op)
  }
  assert.match(source, /\['select','multiselect'\]\.includes\(type\) \? \[\] : \[\['in','In'\],\['not_in','Not In'\]\]/)
})

test('Get Records workflow validation accepts custom condition logic and advanced assignments', () => {
  const definition = getWorkflowActionDefinition('GET_RECORDS')
  assert.ok(definition)
  assert.doesNotThrow(() => definition.validation({
    key: 'GET_RECORDS',
    objectKey: 'order',
    filters: [{ field: 'status', operator: 'equals', value: 'Active' }, { field: 'amount', operator: 'greater_than', value: 10 }],
    customConditionLogic: '1 AND (2 OR 1)',
    sortField: 'amount',
    sortDirection: 'desc',
    fieldSelection: 'choose',
    selectedFields: ['status'],
    limit: 20,
    store: 'all',
  }))
  assert.doesNotThrow(() => definition.validation({
    key: 'GET_RECORDS',
    objectKey: 'order',
    filters: [],
    fieldSelection: 'advanced',
    advancedAssignment: { mode: 'fields', mappings: [{ field: 'status', resourceName: 'chosenStatus' }] },
  }))
  assert.throws(() => definition.validation({
    key: 'GET_RECORDS',
    objectKey: 'order',
    filters: [{ field: 'status', operator: 'equals', value: 'Active' }],
    customConditionLogic: '1 AND 2',
  }), /unavailable condition/)
})

test('Get Records runtime compiles custom logic, sorting, limits, and selected fields', async () => {
  const definition = getWorkflowActionDefinition('GET_RECORDS')
  const { db, calls } = mockGetRecordsDb()
  const result = await definition.executor({
    db,
    companyId: 'company-1',
    req: null,
    object: null,
    workflowVariables: { variables: {}, steps: {} },
    action: {
      key: 'GET_RECORDS',
      objectKey: 'order',
      filters: [
        { field: 'status', operator: 'equals', value: 'Active' },
        { field: 'amount', operator: 'greater_than', value: 10 },
      ],
      customConditionLogic: '1 AND (2 OR 1)',
      sortField: 'amount',
      sortDirection: 'desc',
      limit: 5,
      store: 'all',
      fieldSelection: 'choose',
      selectedFields: ['status'],
    },
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.count, 1)
  assert.deepEqual(result.selectedFields, ['status'])
  const query = calls.find((call) => call.sql.includes('FROM "orders"'))?.sql || ''
  assert.match(query, /SELECT id, "status" AS "status" FROM "orders"/)
  assert.match(query, /"status"=\$1/)
  assert.match(query, /"amount">\$2/)
  assert.match(query, /ORDER BY "amount" DESC/)
  assert.doesNotMatch(query, /"amount" AS "amount"/)
  assert.equal(calls.find((call) => call.sql.includes('FROM "orders"')).params.at(-1), 5)
})

test('Get Records runtime supports Starts With, Ends With, In, Not In and advanced variable assignment', async () => {
  const definition = getWorkflowActionDefinition('GET_RECORDS')
  const workflowVariables = { variables: {}, steps: {} }
  const { db, calls } = mockGetRecordsDb([{ id: 'r1', status: 'Active' }])
  const result = await definition.executor({
    db,
    companyId: 'company-1',
    req: null,
    object: null,
    workflowVariables,
    action: {
      key: 'GET_RECORDS',
      objectKey: 'order',
      filters: [
        { field: 'status', operator: 'starts_with', value: 'Act' },
        { field: 'status', operator: 'ends_with', value: 'ive' },
        { field: 'status', operator: 'in', value: ['Active','Pending'] },
        { field: 'status', operator: 'not_in', value: ['Closed'] },
      ],
      match: 'all',
      limit: 1,
      store: 'first',
      fieldSelection: 'advanced',
      advancedAssignment: { mode: 'fields', mappings: [{ field: 'status', resourceName: 'chosenStatus' }] },
    },
  })
  assert.equal(result.record.status, 'Active')
  assert.equal(workflowVariables.variables.chosenStatus, 'Active')
  const query = calls.find((call) => call.sql.includes('FROM "orders"'))?.sql || ''
  assert.match(query, /ILIKE \$1::text \|\| '%'/)
  assert.match(query, /ILIKE '%' \|\| \$2::text/)
  assert.match(query, /= ANY\(\$3::text\[\]\)/)
  assert.match(query, /NOT \("status"::text = ANY\(\$4::text\[\]\)\)/)
})

test('GPT Builder persists configured Get Records as a real runtime action and keeps drafts as metadata', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx', import.meta.url), 'utf8')
  assert.match(page, /elements\.filter\(\(element\) => element\.configured\)\.map/)
  assert.match(page, /getRecordsRuntimeAction\(element\)/)
  assert.match(page, /gptBuilderElements: elements\.map/)
  assert.match(page, /resources,/)
  assert.match(editor, /customConditionLogic:/)
  assert.match(editor, /fieldSelection:/)
  assert.match(editor, /advancedAssignment/)
})
