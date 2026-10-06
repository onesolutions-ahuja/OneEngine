import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const contract = JSON.parse(await read('docs/gptbuilder-functional-acceptance-2026-10-05.json'))

/*
 * Phase-2 executable contract.
 *
 * These tests deliberately distinguish source-level invariants from later browser/runtime
 * verification.  Every frozen requirement ID is registered here; Phase 3 adds/executes
 * browser/runtime proof for all IDs marked e2e/integration in the verification map.
 * A requirement is never considered PASS merely because it is registered.
 */

const COVERAGE = Object.freeze({
  "L001": {
    "mode": "e2e",
    "area": "launch"
  },
  "L002": {
    "mode": "e2e",
    "area": "launch"
  },
  "L003": {
    "mode": "e2e",
    "area": "launch"
  },
  "L004": {
    "mode": "e2e",
    "area": "launch"
  },
  "F001": {
    "mode": "static",
    "area": "flow_types"
  },
  "F002": {
    "mode": "static",
    "area": "flow_types"
  },
  "F003": {
    "mode": "static",
    "area": "flow_types"
  },
  "F004": {
    "mode": "static",
    "area": "flow_types"
  },
  "F005": {
    "mode": "static",
    "area": "flow_types"
  },
  "S001": {
    "mode": "static+integration",
    "area": "start"
  },
  "S002": {
    "mode": "static+integration",
    "area": "start"
  },
  "S003": {
    "mode": "static+integration",
    "area": "start"
  },
  "S004": {
    "mode": "static+integration",
    "area": "start"
  },
  "S005": {
    "mode": "integration",
    "area": "start"
  },
  "R001": {
    "mode": "static+integration",
    "area": "resources"
  },
  "R002": {
    "mode": "static+integration",
    "area": "resources"
  },
  "R003": {
    "mode": "integration",
    "area": "resources"
  },
  "R004": {
    "mode": "integration",
    "area": "resources"
  },
  "R005": {
    "mode": "integration",
    "area": "resources"
  },
  "R006": {
    "mode": "integration",
    "area": "resources"
  },
  "R007": {
    "mode": "integration",
    "area": "resources"
  },
  "R008": {
    "mode": "integration",
    "area": "resources"
  },
  "R009": {
    "mode": "integration",
    "area": "resources"
  },
  "R010": {
    "mode": "integration",
    "area": "resources"
  },
  "R011": {
    "mode": "integration",
    "area": "resources"
  },
  "E001": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E002": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E003": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E004": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E005": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E006": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E007": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E008": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E009": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E010": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E011": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E012": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E013": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E014": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E015": {
    "mode": "static+integration",
    "area": "elements"
  },
  "E016": {
    "mode": "static+integration",
    "area": "elements"
  },
  "D001": {
    "mode": "static+integration",
    "area": "decision"
  },
  "D002": {
    "mode": "integration",
    "area": "decision"
  },
  "D003": {
    "mode": "integration",
    "area": "decision"
  },
  "D004": {
    "mode": "integration",
    "area": "decision"
  },
  "D005": {
    "mode": "integration",
    "area": "decision"
  },
  "C001": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C002": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C003": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C004": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C005": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C006": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C007": {
    "mode": "e2e",
    "area": "canvas"
  },
  "C008": {
    "mode": "e2e",
    "area": "canvas"
  },
  "P001": {
    "mode": "e2e",
    "area": "persistence"
  },
  "P002": {
    "mode": "e2e",
    "area": "persistence"
  },
  "P003": {
    "mode": "e2e",
    "area": "persistence"
  },
  "P004": {
    "mode": "e2e",
    "area": "persistence"
  },
  "P005": {
    "mode": "e2e",
    "area": "persistence"
  },
  "P006": {
    "mode": "e2e",
    "area": "persistence"
  },
  "X001": {
    "mode": "e2e",
    "area": "execution"
  },
  "X002": {
    "mode": "e2e",
    "area": "execution"
  },
  "X003": {
    "mode": "e2e",
    "area": "execution"
  },
  "X004": {
    "mode": "e2e",
    "area": "execution"
  },
  "X005": {
    "mode": "e2e",
    "area": "execution"
  },
  "X006": {
    "mode": "e2e",
    "area": "execution"
  },
  "M001": {
    "mode": "static+integration",
    "area": "metadata"
  },
  "M002": {
    "mode": "static+integration",
    "area": "metadata"
  },
  "M003": {
    "mode": "static+integration",
    "area": "metadata"
  },
  "M004": {
    "mode": "static+integration",
    "area": "metadata"
  },
  "M005": {
    "mode": "static+integration",
    "area": "metadata"
  },
  "N001": {
    "mode": "integration",
    "area": "negative"
  },
  "N002": {
    "mode": "integration",
    "area": "negative"
  },
  "N003": {
    "mode": "integration",
    "area": "negative"
  },
  "N004": {
    "mode": "static+integration",
    "area": "negative"
  },
  "N005": {
    "mode": "static+integration",
    "area": "negative"
  },
  "Q001": {
    "mode": "gate",
    "area": "quality"
  },
  "Q002": {
    "mode": "gate",
    "area": "quality"
  },
  "Q003": {
    "mode": "gate",
    "area": "quality"
  },
  "Q004": {
    "mode": "gate",
    "area": "quality"
  }
})

test('contract registry covers every frozen requirement exactly once', () => {
  const ids = contract.requirements.map((row) => row.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate requirement ID in frozen contract')
  assert.deepEqual(Object.keys(COVERAGE).sort(), [...ids].sort())
  for (const row of contract.requirements) {
    assert.equal(row.status, 'UNTESTED', row.id + ' must begin UNTESTED')
    assert.ok(COVERAGE[row.id]?.mode, row.id + ' lacks a verification mode')
  }
})

test('R001 R002 record contexts expose canonical automatic record resources', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  assert.match(page, /flow\.key === 'record'[\s\S]*apiName:'\$Record'[\s\S]*objectKey:startConfig\.objectKey/)
  assert.match(page, /apiName:'\$Record__Prior'[\s\S]*objectKey:startConfig\.objectKey/)
  assert.match(page, /flow\.key === 'platform_event'[\s\S]*apiName:'\$Record'[\s\S]*label:'Platform Event Record'/)
})

test('R003 R004 R005 platform-event and record $Record child fields are metadata-expanded, not hard-coded', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const decision = await read('src/pages/developer/gptbuilder/GPTBuilderDecision.jsx')
  const routes = await read('server/routes/platformEvents.js')
  assert.match(routes, /SELECT event_type,description,source_package_id,field_schema/)
  assert.match(page, /field_schema/)
  assert.match(page, /startConfig\.eventKey/)
  assert.match(page, /\$Record\./)
  assert.match(decision, /resourcePath/)
  assert.doesNotMatch(page, /\$Record\.(?:mode|channel|provider|direction|message_type)\b/, 'event fields must come from metadata, never a hard-coded business/event field list')
})

test('R006 related/reference traversal uses metadata record paths', async () => {
  const shared = await read('src/pages/settings/Platform/MetadataResourcePicker.jsx')
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  assert.match(shared, /record-paths\?depth=4/)
  assert.match(shared, /Search fields or related records/)
  assert.match(page, /record-paths|MetadataResourcePicker|related.*field|relationship/i)
})

test('R007 R008 R009 resource selection is searchable, typed, and supports nested resources', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const decision = await read('src/pages/developer/gptbuilder/GPTBuilderDecision.jsx')
  assert.match(page, /resourceType:'automatic'/)
  assert.match(page, /availableResources/)
  assert.match(decision, /resourceType\(resource\)/)
  assert.match(decision, /compatibleResources/)
  assert.match(decision, /dataType/)
  assert.match(decision, /Search|query|filter/i, 'Decision/resource picker must support searching resource paths')
})

test('R010 R011 bindings use active/readable metadata and persist canonical paths', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const related = await read('src/pages/developer/gptbuilder/GPTBuilderRelatedRecords.jsx')
  assert.match(related, /field\?\.active !== false && field\?\.readable !== false/)
  assert.match(page, /gptBuilderElements/)
  assert.match(page, /resources/)
  assert.match(page, /structuredClone/)
})

test('S001-S005 Start semantics are metadata-driven and context changes feed downstream resources', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  for (const token of ['created','updated','created_or_updated','deleted']) assert.ok(page.includes(token), token)
  assert.match(page, /ConditionsEditor/)
  assert.match(page, /apiRequest\(\`\/api\/platform\/objects\//)
  assert.match(page, /\/api\/platform\/event-types/)
  assert.match(page, /startConfig\.objectKey/)
  assert.match(page, /startConfig\.eventKey/)
})

test('E001-E016 every frozen element family has an editor/runtime contract and no pending editor fallback', async () => {
  const elements = await read('src/pages/developer/gptbuilder/GPTBuilderElements.jsx')
  const properties = await read('src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx')
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const keys = [
    'assignment','decision','loop','get_records','create_records','update_records','delete_records',
    'collection_filter','collection_sort','transform','wait_duration','wait_conditions','wait_until_date',
    'subflow','screen','action'
  ]
  for (const key of keys) {
    assert.ok(page.includes(`activeElement.key === '${key}'`) || page.includes(`element.key === '${key}'`), 'missing editor/runtime wiring: '+key)
  }
  assert.doesNotMatch(elements, /PendingElementEditor/)
  assert.doesNotMatch(properties, /dedicated parity phase|implemented in the next/i)
  assert.match(page, /rollback_records/)
})

test('D001-D005 Decision has ordered/default branches, typed operators, compatible resource comparisons and persisted branches', async () => {
  const decision = await read('src/pages/developer/gptbuilder/GPTBuilderDecision.jsx')
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  assert.match(decision, /defaultLabel/)
  assert.match(decision, /defaultBranch/)
  assert.match(decision, /moveOutcome/)
  assert.match(decision, /decisionOperators/)
  assert.match(decision, /compatibleResources/)
  assert.match(decision, /branch:/)
  assert.match(page, /gptBuilderElements/)
})

test('P001-P006 persistence/version/activation primitives are present and reopen restores editable metadata', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const saveHistory = await read('src/pages/developer/gptbuilder/GPTBuilderSaveHistory.jsx')
  for (const token of ['forceNewVersion','forceNewFlow','setFlowActivation','gptBuilderElements','goToConnections','resources']) assert.ok(page.includes(token), token)
  assert.match(saveHistory, /Save as New Version/)
  assert.match(page, /setElements\(/)
  assert.match(page, /setResources\(/)
  assert.match(page, /setStartConfig\(/)
})

test('X001-X006 execution surfaces point at saved run/debug/test APIs and expose failures', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const platform = await read('server/routes/platform.js')
  assert.match(page, /\/run/)
  assert.match(page, /\/debug/)
  assert.match(page, /\/tests\//)
  assert.match(page, /rollback/)
  assert.match(page, /skipStartCondition/)
  assert.match(page, /setError|saveError/)
  assert.match(platform, /runSavedWorkflowRequest/)
  assert.match(platform, /runWorkflowDebugRequest/)
})

test('M001-M005 Builder authoring remains generic and metadata-driven', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const decision = await read('src/pages/developer/gptbuilder/GPTBuilderDecision.jsx')
  assert.doesNotMatch(page, /createCustomer|salesThis|customerThis|uber_eats\.|quickbooks\./i)
  assert.doesNotMatch(decision, /createCustomer|salesThis|customerThis|uber_eats\.|quickbooks\./i)
  assert.doesNotMatch(page, /CALL_FUNCTION/)
  assert.match(page, /apiRequest\('\/api\/platform\/objects'\)/)
  assert.match(page, /\/api\/platform\/event-types/)
})

test('N001-N005 incomplete/invalid configuration has explicit validation/error paths', async () => {
  const page = await read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
  const decision = await read('src/pages/developer/gptbuilder/GPTBuilderDecision.jsx')
  assert.match(decision, /errors\.push/)
  assert.match(decision, /select a resource/i)
  assert.match(page, /issues\.some/)
  assert.match(page, /saveError/)
  assert.match(page, /role="alert"/)
})

test('Q001-Q004 quality gate forbids fake completion', () => {
  assert.ok(contract.requirements.length > 0)
  assert.ok(contract.requirements.every((row) => row.status === 'UNTESTED'))
  assert.equal(new Set(Object.keys(COVERAGE)).size, contract.requirements.length)
})
