import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('GPT Builder is isolated from the existing Workflow Builder implementation', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /Builder2|OneBuilder|builder2Model|builder2Runtime/)
  assert.match(page, /GPT Builder/)
})

test('OneDeveloper exposes GPT Builder as a separate developer section', async () => {
  const developer = await readFile(new URL('../src/pages/developer/OneDeveloperPage.jsx', import.meta.url), 'utf8')
  assert.match(developer, /key: 'gptbuilder'/)
  assert.match(developer, /current\.key === 'gptbuilder' \? <GPTBuilderPage/)
})


test('GPT Builder phase 2 shell follows Salesforce flow-creation and canvas chrome rules', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx', import.meta.url), 'utf8')
  for (const text of ['New Automation','Start From Scratch','Use a Template']) assert.ok(automation.includes(text), text)
  for (const text of ['Record-Triggered Flow','Screen Flow','Autolaunched Flow (No Trigger)','Schedule-Triggered Flow','Platform Event-Triggered Flow','Auto-Layout','Free-Form','Canvas zoom']) assert.ok(page.includes(text), text)
  assert.match(page, /aria-label="Start"/)
  assert.match(page, /aria-label="Add element"/)
  assert.match(page, />End</)
})

test('GPT Builder keeps auto-layout and free-form toolbox behavior separate', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /layout === 'free' \? <button/)
  assert.match(page, /layout === 'auto' \? 'manager' : tab/)
  assert.match(page, /setToolboxOpen/)
})


test('GPT Builder phase 2 implements Salesforce Start configuration and first-save semantics', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  for (const text of [
    'Configure Start',
    'Select Object',
    'Trigger the Flow When',
    'Set Entry Conditions',
    'When to Run the Flow for Updated Records',
    'Optimize the Flow for',
    'Fast Field Updates',
    'Actions and Related Records',
    'Set a Schedule',
    'Select Platform Event',
    'Flow Label',
    'Flow API Name',
    'How to Run the Flow',
  ]) assert.ok(page.includes(text), text)
  assert.match(page, /apiNameFromLabel\(label\)/)
  assert.match(page, /disabled=\{saved\}/)
  assert.match(page, /The API name can’t be edited after the flow is saved/)
  assert.match(page, /workflowId \? `\/api\/platform\/rules\//)
  assert.match(page, /method: workflowId \? 'PUT' : 'POST'/)
})

test('GPT Builder toolbar follows Salesforce saved-run and validation behavior', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /disabled=\{!workflowId\}><Play/)
  assert.match(page, /Test Mode/)
  assert.match(page, /> Debug<\/button>/)
  assert.match(page, /disabled=\{!workflowId \|\| dirty \|\| issues\.some/)
  assert.match(page, /Show Errors/)
  assert.match(page, /Show Warnings/)
  assert.match(page, /Unsaved changes/)
  assert.match(page, /Run, Test, and Debug use the most recent saved version/)
})


test('GPT Builder phase 3 exposes Salesforce element groups and core elements', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  for (const text of [
    "label: 'Interaction'",
    "label: 'Logic'",
    "label: 'Data'",
    "label: 'Action'",
    "label: 'Screen'",
    "label: 'Subflow'",
    "label: 'Assignment'",
    "label: 'Decision'",
    "label: 'Loop'",
    "label: 'Collection Filter'",
    "label: 'Collection Sort'",
    "label: 'Transform'",
    "label: 'Wait for Amount of Time'",
    "label: 'Wait for Conditions'",
    "label: 'Wait Until Date'",
    "label: 'Custom Error'",
    "label: 'Group'",
    "label: 'Get Records'",
    "label: 'Create Records'",
    "label: 'Update Records'",
    "label: 'Delete Records'",
  ]) assert.ok(elements.includes(text), text)
})

test('GPT Builder phase 3 applies Salesforce flow-type and layout availability rules', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(elements, /element\.key === 'screen'\) return flowType === 'screen'/)
  assert.match(elements, /element\.key === 'custom_error'\) return flowType === 'record'/)
  assert.match(elements, /element\.key === 'group'\) return layout === 'auto'/)
  assert.match(elements, /\['record', 'screen', 'autolaunched'\]\.includes\(flowType\)/)
  assert.match(elements, /fastRecord/)
  assert.match(elements, /'assignment', 'decision', 'get_records', 'loop'/)
  assert.match(elements, /\['wait_duration', 'wait_conditions', 'wait_until_date'\]/)
})

test('GPT Builder phase 3 matches auto-layout picker and free-form drag discovery behavior', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(page, /<ElementPicker/)
  assert.match(page, /aria-label="Add element" aria-expanded=\{elementPickerOpen\}/)
  assert.match(page, /application\/x-gptbuilder-element/)
  assert.match(page, /onDrop=\{dropElement\}/)
  assert.match(page, /<GPTBuilderElementProperties/)
  assert.match(elements, /placeholder="Search elements\.\.\."/)
  assert.match(elements, /draggable=\{draggable\}/)
  assert.match(elements, /Connect to element/)
  assert.match(elements, /onSelect\?\.\(\{ key: 'end'/)
  assert.match(elements, /role="tooltip"/)
})

test('GPT Builder phase 3 keeps Screen selection in a separate editor shell', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(elements, /element\.key === 'screen'/)
  assert.match(elements, /gptb-element-editor-modal-backdrop/)
  assert.match(elements, /aria-label="New Screen"/)
  assert.match(elements, /gptb-element-editor-shell/)
})


test('GPT Builder phase 4 shared properties implements Salesforce label and API-name behavior', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  for (const text of [
    'generatedLabelForElement',
    'labelSource',
    'apiNameSource',
    'API Name',
    'Description',
    'Auto-populated from the label until you edit the API name.',
    'uniqueApiName',
    'uniqueLabel',
  ]) assert.ok(props.includes(text), text)
  assert.match(props, /labelSource === 'manual'/)
  assert.match(props, /apiNameSource === 'manual'/)
  assert.match(props, /labelSource: 'manual'/)
  assert.match(props, /apiNameSource: 'manual'/)
})

test('GPT Builder phase 4 matches auto-layout continuous editing and free-form dialog behavior', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /const useDialog = layout === 'free' \|\| isScreen/)
  assert.match(props, /onLiveChange\?\.\(next\)/)
  assert.match(props, /Changes stay in the draft when you close this panel/)
  assert.match(props, /Undo element change/)
  assert.match(props, />Cancel<\/button>/)
  assert.match(props, />Done<\/button>/)
  assert.match(props, /removeNew: isNew/)
})

test('GPT Builder phase 4 persists element identity and reopens element properties', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /const \[elements, setElements\] = useState\(\(\) => structuredClone\(templateAction\.gptBuilderElements \|\| \[\]\)\)/)
  assert.match(page, /gptBuilderElements: elements\.map/)
  assert.match(page, /labelSource: element\.labelSource/)
  assert.match(page, /apiNameSource: element\.apiNameSource/)
  assert.match(page, /onOpen=\{\(\) => openElement\(element\)\}/)
  assert.match(page, /<GPTBuilderElementProperties/)
  assert.match(page, /setEditingElement\(\{ id: instance\.id, isNew: true \}\)/)
})

test('GPT Builder phase 4 blocks saving incomplete Screen and Action elements but allows other draft elements', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /hasUnsavableIncomplete = layout === 'free'/)
  assert.match(page, /\['screen', 'action'\]\.includes\(item\.key\)/)
  assert.match(page, /Complete Screen and Action elements before saving/)
  assert.match(page, /Complete this element before activating the flow/)
})


test('GPT Builder phase 4 keeps element API identity out of the card until requested in the info tooltip', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(elements, /API Name: \{instance\.apiName\}/)
  assert.match(elements, /role="tooltip"/)
  assert.match(elements, /instance\.description/)
})

test('GPT Builder phase 4 exposes one shared configuration-to-auto-label hook for later element editors', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /const updateConfig = \(nextConfig\)/)
  assert.match(props, /children\(\{ draft, updateConfig, setConfigured \}\)/)
  assert.match(props, /refreshGeneratedIdentity\(draft, elements, draft\.config\)/)
})


test('GPT Builder recheck implements Salesforce undo redo multi-select copy paste and Go To affordances', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(page, /undoFlowChange/)
  assert.match(page, /redoFlowChange/)
  assert.match(page, /copySelectedElements/)
  assert.match(page, /pasteCopiedElements/)
  assert.match(page, /beginConnectToElement/)
  assert.match(elements, /Paste \{copiedCount\} Element/)
  assert.match(elements, /Connect to element/)
})

test('GPT Builder recheck includes Salesforce Start custom logic formula builder async and scheduled paths', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  const formula = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderFormulaBuilder.jsx', import.meta.url), 'utf8')
  const startOptions = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderStartOptions.jsx', import.meta.url), 'utf8')
  assert.match(page, /Custom Condition Logic Is Met/)
  assert.match(page, /Is Changed/)
  assert.match(formula, /Insert a Resource/)
  assert.match(formula, /Insert a Function/)
  assert.match(formula, /Check Syntax/)
  assert.match(startOptions, /Run Asynchronously/)
  assert.match(startOptions, /Add Scheduled Paths \(Optional\)/)
  assert.match(startOptions, /Batch Size/)
})

test('GPT Builder auto-generated labels apply in auto-layout and free-form and preserve manual edits', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /const generated = uniqueLabel\(generatedLabelForElement/)
  assert.match(props, /labelSource: 'auto'/)
  assert.match(props, /if \(instance\.labelSource === 'manual'\)/)
})


test('GPT Builder recheck matches Salesforce draft-save rules by layout mode', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /const hasUnsavableIncomplete = layout === 'free'/)
  assert.match(page, /Resolve flow errors before saving in Free-Form/)
  assert.match(page, /elements\.some\(\(item\) => !item\.configured && \['screen', 'action'\]\.includes\(item\.key\)\)/)
})


test('GPT Builder phase 2 recheck matches current Salesforce flow version properties', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  for (const text of [
    'Source Template',
    'Original Flow',
    'Progress Indicator Type',
    'Simple: Top of Screen',
    'Path: Top of Screen',
    'Simple: Footer of Screen',
    'User or System Context—Depends on How Flow Is Launched',
    'User Context—Enforces User Permissions',
    'System Context with Sharing—Enforces Record-Level Access',
    'System Context Without Sharing—Access All Data',
  ]) assert.ok(page.includes(text), text)
  assert.match(page, /showProgress: flow\.key === 'screen'/)
  assert.match(page, /interviewLabelFromFlowLabel\(label\)/)
  assert.match(page, /saved \? 'Done' : 'Save'/)
  assert.match(page, /\['screen','autolaunched'\]\.includes\(flowType\)/)
  assert.match(page, /Number\.parseFloat\(draft\.apiVersion \|\| '68\.0'\) >= 68/)
  assert.match(page, /defaultRunContextForFlowType\(flow\.key\)/)
})


test('GPT Builder phase 1 recheck uses the current Salesforce New Automation browser', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx', import.meta.url), 'utf8')
  assert.match(page, /<GPTBuilderNewAutomation flowTypes=\{FLOW_TYPES\}/)
  for (const text of ['Start From Scratch','Use a Template','Frequently Used','Triggered','Screens','Autolaunched Automations','View All','Search automation types','Search templates']) {
    assert.ok(automation.includes(text), text)
  }
  assert.match(automation, /apiRequest\('\/api\/platform\/rules'\)/)
  assert.match(automation, /item\?\.action\?\.isTemplate === true/)
  assert.match(automation, /onCreate\(\{ \.\.\.definition, template \}\)/)
})

test('GPT Builder phase 2 recheck uses Salesforce Show Advanced and current screen progress settings', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /advancedOpen \? 'Hide Advanced' : 'Show Advanced'/)
  assert.doesNotMatch(page, /<details><summary>Advanced<\/summary>/)
  assert.match(page, /showProgress: flow\.key === 'screen'/)
  assert.match(page, /Simple: Top of Screen/)
  assert.match(page, /Path: Top of Screen/)
  assert.match(page, /Simple: Footer of Screen/)
  assert.match(page, /User Context—Enforces User Permissions/)
  assert.match(page, /Number\.parseFloat\(draft\.apiVersion \|\| '68\.0'\) >= 68/)
})
