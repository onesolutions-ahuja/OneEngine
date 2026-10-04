import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('GPT Builder is isolated from the existing Workflow Builder implementation', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /Builder2|OneBuilder|builder2Model|builder2Runtime/)
  assert.match(page, /GPT Builder/)
})

test('OneDeveloper exposes GPT Builder as a separate developer section', async () => {
  const developer = await readFile(new URL('../src/pages/developer/OneDeveloperPage.jsx', import.meta.url), 'utf8')
  assert.match(developer, /key: 'gptbuilder'/)
  assert.match(developer, /current\.key === 'gptbuilder' \? <GPTBuilderPage/)
})


test('GPT Builder phase 2 shell follows Salesforce flow-creation and canvas chrome rules', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  for (const text of ['New Automation','Start From Scratch','Use a Template','Record-Triggered Flow','Screen Flow','Autolaunched Flow (No Trigger)','Schedule-Triggered Flow','Platform Event-Triggered Flow','Auto-Layout','Free-Form','Canvas zoom']) assert.ok(page.includes(text), text)
  assert.match(page, /aria-label="Start"/)
  assert.match(page, /aria-label="Add element"/)
  assert.match(page, />End</)
})

test('GPT Builder keeps auto-layout and free-form toolbox behavior separate', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /layout === 'free' \? <button/)
  assert.match(page, /layout === 'auto' \? 'manager' : tab/)
  assert.match(page, /setToolboxOpen/)
})


test('GPT Builder phase 2 implements Salesforce Start configuration and first-save semantics', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
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

test('GPT Builder toolbar gates run debug and activate against the latest saved design', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /disabled=\{!workflowId \|\| dirty\}><Play/)
  assert.match(page, /disabled=\{!workflowId \|\| dirty\}><Eye/)
  assert.match(page, /disabled=\{!workflowId \|\| dirty \|\| issues\.some/)
  assert.match(page, /Errors and Warnings/)
  assert.match(page, /Unsaved changes/)
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
    "label: 'Wait'",
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
  assert.match(elements, /'assignment', 'decision', 'loop', 'get_records', 'update_records', 'custom_error', 'group'/)
})

test('GPT Builder phase 3 matches auto-layout picker and free-form drag discovery behavior', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
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
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /const \[elements, setElements\] = useState\(\[\]\)/)
  assert.match(page, /gptBuilderElements: elements\.map/)
  assert.match(page, /labelSource: element\.labelSource/)
  assert.match(page, /apiNameSource: element\.apiNameSource/)
  assert.match(page, /onOpen=\{\(\) => openElement\(element\)\}/)
  assert.match(page, /<GPTBuilderElementProperties/)
  assert.match(page, /setEditingElement\(\{ id: instance\.id, isNew: true \}\)/)
})

test('GPT Builder phase 4 blocks saving incomplete Screen and Action elements but allows other draft elements', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /hasUnsavableIncomplete = elements\.some/)
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
