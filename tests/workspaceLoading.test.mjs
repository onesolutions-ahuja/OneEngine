import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'
import { packageDefinitions } from '../server/services/packageRegistry.js'
import { SYSTEM_OBJECTS } from '../server/services/platformSystemObjects.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const objectKeys = [...new Set([
  // Include every object listed in the reported Demo Hub workspace, as well
  // as system/package definitions that may be installed in other tenants.
  ...`onesolutions_business_division category communication_event customer discount
    financial_ledger hospitality_floor hardware_configuration integration inventory
    inventory_batch inventory_movement kds_ticket layaway layaway_line layaway_payment
    loyalty_account loyalty_transaction message_template online_order payment
    payment_method payment_terminal permission price_list product promotion purchase
    purchase_line purchase_receipt purchase_receipt_line reservation role role_permission
    sale server_setting employee stock_return stock_return_line stock_transfer stock_transfer_line store
    supplier supplier_invoice supplier_ledger supplier_payment supplier_product
    system_settings hospitality_table`.split(/\s+/),
  ...SYSTEM_OBJECTS.map((object) => object.key),
  ...packageDefinitions().flatMap((entry) => entry.manifest?.objects || []).map((object) => object.objectKey),
])].filter(Boolean)
const objects = objectKeys.map((key) => ({
  id: key, object_key: key, label: key, source_table: key, active: true,
}))
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'workspace-test-services', enforce: 'pre',
    resolveId(id) {
      if (id === '../../services/api' || id === '../../services/cachedApi') return '\0workspace-api'
      if (id === '../../components/RecordListView') return '\0workspace-list'
    },
    load(id) {
      if (id === '\0workspace-api') return 'export const apiRequest = (...args) => globalThis.workspaceTestApi(...args); export const cachedGet = apiRequest;'
      if (id === '\0workspace-list') return 'import React from "react"; export default function List(props) { return React.createElement("record-list", props); }'
    },
  }],
})
const { default: WorkspacePage } = await server.ssrLoadModule('/src/pages/workspace/WorkspacePage.jsx')
test.after(async () => { await server.close(); delete globalThis.workspaceTestApi })

function setup(overrides = {}) {
  const calls = []
  globalThis.workspaceTestApi = async (path) => {
    calls.push(path)
    if (overrides[path]) return overrides[path].promise
    if (path === '/api/platform/objects') return { data: objects }
    if (path.endsWith('/workspace')) return { data: { fields: [{ api_name: 'name', field_type: 'text' }] } }
    if (path.includes('/records?')) {
      const key = path.split('/')[4]
      return { records: [{ id: `${key}-record`, name: `${key} data` }] }
    }
    if (path.includes('/record-page?')) return { data: { record: { id: 'detail', name: 'Loaded detail' } } }
    return { data: {} }
  }
  return calls
}
const list = (renderer) => renderer.root.findByType('record-list').props
const mount = async (props = {}) => {
  let renderer
  await act(async () => { renderer = create(React.createElement(WorkspacePage, props)) })
  return renderer
}
const select = async (renderer, key) => {
  await act(async () => {
    renderer.root.findAllByType('button').find((button) => button.props.title === key).props.onClick()
  })
}
const unmount = async (renderer) => act(async () => renderer.unmount())

test('deep links wait for metadata then load records for every workspace object', async (t) => {
  t.diagnostic(`Checking ${objects.length} system and package object keys with mocked records`)
  for (const object of objects) {
    const metadata = deferred()
    const calls = setup({ '/api/platform/objects': metadata })
    const renderer = await mount({ initialObjectKey: object.object_key })
    assert.equal(calls.some((path) => path.includes('/records?')), false)
    await act(async () => metadata.resolve({ data: objects }))
    assert.equal(list(renderer).rows[0].name, `${object.object_key} data`)
    assert.equal(list(renderer).loading, false)
    assert.equal(list(renderer).error, '')
    await unmount(renderer)
  }
})

test('late records and late failures cannot blank or replace the newly selected table', async () => {
  for (const fail of [false, true]) {
    const oldRecords = deferred()
    setup({ '/api/platform/objects/communication_event/records?page=1&pageSize=200': oldRecords })
    const renderer = await mount({ initialObjectKey: 'communication_event' })
    assert.equal(list(renderer).loading, true)
    await select(renderer, 'customer')
    assert.equal(list(renderer).rows[0].name, 'customer data')
    await act(async () => fail ? oldRecords.reject(new Error('OENT102')) : oldRecords.resolve({ records: [{ id: 'old', name: 'stale' }] }))
    assert.equal(list(renderer).title, 'customer')
    assert.equal(list(renderer).rows[0].name, 'customer data')
    assert.equal(list(renderer).loading, false)
    assert.equal(list(renderer).error, '')
    await unmount(renderer)
  }
})

test('failed record load clears the cancelled detail spinner and reports its error', async () => {
  const records = deferred(), detail = deferred()
  setup({
    '/api/platform/objects/communication_event/records?page=1&pageSize=200': records,
    '/api/platform/runtime/record-page?objectKey=communication_event&recordId=deep-record&formFactor=desktop': detail,
  })
  const renderer = await mount({ initialObjectKey: 'communication_event', initialRecordId: 'deep-record' })
  assert.match(JSON.stringify(renderer.toJSON()), /Loading record/)
  await act(async () => records.reject(new Error('OENT102')))
  assert.equal(list(renderer).error, 'OENT102')
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Loading record/)
  await act(async () => detail.resolve({ data: { record: { id: 'stale' } } }))
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Loading record/)
  await unmount(renderer)
})

test('selecting an object does not bounce back to the previous route', async () => {
  setup()
  const renderer = await mount({ initialObjectKey: 'communication_event' })
  await select(renderer, 'inventory')
  assert.equal(list(renderer).title, 'inventory')
  assert.equal(list(renderer).rows[0].name, 'inventory data')
  await unmount(renderer)
})

test('a timed-out table can be retried and newer refreshes win', async () => {
  const records = deferred()
  const path = '/api/platform/objects/communication_event/records?page=1&pageSize=200'
  setup({ [path]: records })
  const renderer = await mount({ initialObjectKey: 'communication_event' })
  await act(async () => records.reject(new Error('OENT102')))
  assert.equal(list(renderer).error, 'OENT102')
  const olderRefresh = deferred()
  setup({ [path]: olderRefresh })
  await act(async () => { void list(renderer).onDataChanged() })
  assert.equal(list(renderer).loading, true)
  setup()
  await act(async () => list(renderer).onDataChanged())
  assert.equal(list(renderer).rows[0].name, 'communication_event data')
  await act(async () => olderRefresh.reject(new Error('old refresh timeout')))
  assert.equal(list(renderer).error, '')
  assert.equal(list(renderer).loading, false)
  await unmount(renderer)
})
