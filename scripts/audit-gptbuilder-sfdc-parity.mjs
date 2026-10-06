import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error('SFDC parity audit failed:', message)
    process.exitCode = 1
  }
}

const page = read('src/pages/developer/gptbuilder/GPTBuilderPage.jsx')
const automation = read('src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx')
const elements = read('src/pages/developer/gptbuilder/GPTBuilderElements.jsx')
const screen = read('src/pages/developer/gptbuilder/GPTBuilderScreen.jsx')
const screenRuntime = read('src/pages/flow/ScreenFlowRuntimePage.jsx')
const decision = read('src/pages/developer/gptbuilder/GPTBuilderDecision.jsx')
const getRecords = read('src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx')
const createRecords = read('src/pages/developer/gptbuilder/GPTBuilderCreateRecords.jsx')
const action = read('src/pages/developer/gptbuilder/GPTBuilderAction.jsx')
const saveHistory = read('src/pages/developer/gptbuilder/GPTBuilderSaveHistory.jsx')
const runtime = read('server/services/platformWorkflow.js')
const platform = read('server/routes/platform.js')

const flowTypes = [
  'Screen Flow','Record-Triggered Flow','Schedule-Triggered Flow','Platform Event-Triggered Flow',
  'Autolaunched Flow (No Trigger)','Automation Event-Triggered Flow','User Provisioning Flow',
  'Contact Request Flow','Cart Async Flow','Recommendation Strategy','Autolaunched Orchestration (No Trigger)',
  'Record-Triggered Orchestration','Evaluation Flow','Flow Orchestration for CMS',
  'Individual-Object Linking Flow','Autolaunched Flow Approval Process (No Trigger)',
  'Record-Triggered Flow Approval Process','Identity User Registration Flow',
]
for (const label of flowTypes) assert(page.includes(label), 'missing flow type: ' + label)
assert(flowTypes.length === 18, 'reference flow type count changed')
assert(automation.includes("category === 'scheduled'"), 'Scheduled category is missing')

const observedElements = [
  'Action','Screen','Subflow','Assignment','Decision','Loop','Transform','Collection Sort','Collection Filter',
  'Wait for Conditions','Wait for Amount of Time','Wait Until Date','Create Records','Update Records',
  'Get Records','Delete Records','Roll Back Records',
]
for (const label of observedElements) assert(elements.includes("label: '" + label + "'"), 'missing observed element: ' + label)
assert(elements.includes("element.key === 'rollback_records') return flowType === 'screen'"), 'Roll Back Records must be Screen Flow only')

const resourceTypes = ['Variable','Constant','Formula','Text Template','Choice','Collection Choice Set','Record Choice Set','Picklist Choice Set','Stage']
for (const label of resourceTypes) assert(page.includes("['" + label + "'"), 'missing resource type: ' + label)

const variableTypes = ['Text','Record','Number','Currency','Boolean','Date','Date/Time','Time','Picklist','Multi-Select Picklist','Apex-Defined']
for (const label of variableTypes) assert(page.includes('>' + label + '<'), 'missing variable data type: ' + label)

for (const text of ['Components','Fields','Search components...','Search fields...','Preview Style','Lightning Lite','Preview Size','Stage Resource','Configure Header','Require','Read Only','Disabled','Default Value','Style']) {
  assert(screen.includes(text), 'missing Screen editor evidence: ' + text)
}
for (const text of ['PHONE','URL','TIME','CURRENCY','PICKLIST','MULTI_SELECT','LONG_TEXT']) {
  assert(screenRuntime.includes(text), 'missing Screen runtime component: ' + text)
}

assert(decision.includes('To reorder a row, press Spacebar. To move the selected row, use the arrow keys.'), 'Decision keyboard reorder instruction missing')
assert(decision.includes("event.key===' '"), 'Decision Spacebar reorder handling missing')
assert(decision.includes("'ArrowUp','ArrowDown'"), 'Decision arrow reorder handling missing')

for (const text of ['Sort Order','How Many Records to Store','Only the first record','All records, up to a specified limit','How to Store Record Data','Automatically store all fields']) {
  assert(getRecords.includes(text), 'Get Records parity text missing: ' + text)
}
for (const text of ['How to Set Record Field Values','From a Record Variable']) {
  assert(createRecords.includes(text), 'Create Records parity text missing: ' + text)
}
for (const text of ['All Actions','Create HTTP Callout','Search actions...']) {
  assert(action.includes(text), 'Action picker parity text missing: ' + text)
}
for (const text of ['Run','Debug','View Tests','Activate','Auto-Layout','Free-Form']) {
  assert(page.includes(text), 'Builder lifecycle/canvas control missing: ' + text)
}
assert(saveHistory.includes('Save as New Version'), 'Builder lifecycle control missing: Save as New Version')

assert(runtime.includes('key: "ROLLBACK_RECORDS"'), 'ROLLBACK_RECORDS runtime registry missing')
assert(runtime.includes('rollbackTransaction: true'), 'ROLLBACK_RECORDS runtime signal missing')
assert(runtime.includes('context.rollbackCurrentTransaction'), 'ROLLBACK_RECORDS transaction callback missing')
assert(platform.includes('rollbackCurrentTransaction'), 'Screen Flow transaction boundary missing')
assert(platform.includes('await client.query("BEGIN")'), 'Screen Flow BEGIN transaction missing')
assert(platform.includes('await client.query("ROLLBACK")'), 'Screen Flow ROLLBACK transaction missing')
assert(platform.includes('await client.query("COMMIT")'), 'Screen Flow COMMIT transaction missing')

if (!process.exitCode) {
  console.log(JSON.stringify({
    status: 'PASS',
    flowTypes: flowTypes.length,
    observedElements: observedElements.length,
    resourceTypes: resourceTypes.length,
    variableDataTypes: variableTypes.length,
    evidenceBackedGaps: 0,
  }, null, 2))
}
