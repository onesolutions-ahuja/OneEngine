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
  assert.match(developer, /import GPTBuilderPage from '\.\/gptbuilder\/GPTBuilderPage'/)
  assert.match(developer, /current\.key === 'gptbuilder' \? <GPTBuilderPage/)
})


test('GPT Builder phase 2 shell follows Salesforce flow-creation and canvas chrome rules', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx', import.meta.url), 'utf8')
  for (const text of ['New Automation','Search automations...','Categories','Frequently Used']) assert.ok(automation.includes(text), text)
  for (const text of ['Record-Triggered Flow','Screen Flow','Autolaunched Flow (No Trigger)','Schedule-Triggered Flow','Platform Event-Triggered Flow','Auto-Layout','Free-Form','Canvas zoom']) assert.ok(page.includes(text), text)
  assert.match(page, /aria-label="Start"/)
  assert.match(page, /aria-label=\{\`Add element at position \$\{index \+ 1\}\`\}/)
  assert.match(page, />End</)
})

test('GPT Builder keeps auto-layout and free-form toolbox behavior separate', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /layout === 'free' \? <button/)
  assert.match(page, /layout === 'auto' \? 'manager' : tab/)
  assert.match(page, /setToolboxOpen/)
})

test('GPT Builder preserves elements when switching layouts and blocks invalid Free-Form conversion to Auto-Layout', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /const switchToFreeForm = \(\) =>/)
  assert.match(page, /source: 'free'/)
  assert.match(page, /generatedByLayoutSwitch: true/)
  assert.match(page, /const switchToAutoLayout = \(\) =>/)
  assert.match(page, /one or more elements without an incoming connection/)
  assert.match(page, /one or more unsupported Step elements/)
  assert.match(page, /source: 'auto'/)
  assert.match(page, /role="alert"/)
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
  assert.ok(page.includes("workflowId && !forceNewFlow ? `/api/platform/rules/"))
  assert.ok(page.includes("method: workflowId && !forceNewFlow ? 'PUT' : 'POST'"))
})

test('GPT Builder saved Flow Properties update the draft and require toolbar Save to persist', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /if \(saved\) onCancel\(\)/)
  assert.match(page, /else onSave\(draft\)/)
  assert.match(page, /const changed = JSON\.stringify\(next\) !== JSON\.stringify\(flowProps\)/)
  assert.match(page, /if \(changed\) setDirty\(true\)/)
  assert.match(page, /runtime_active === true/)
})

test('GPT Builder toolbar uses current Salesforce Run Debug View Tests and Activate behavior', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /> Run<\/button>/)
  assert.match(page, /> View Tests<\/button>/)
  assert.match(page, /> Debug<\/button>/)
  assert.match(page, />Activate<\/button>/)
  assert.match(page, /disabled=\{!workflowId\}/)
  assert.match(page, /Run the most recent saved version/)
  assert.match(page, /Debug the most recent saved version/)
  assert.match(page, /View and run tests for the most recent saved version/)
  assert.match(page, /dirty \|\| issues\.some\(\(issue\) => issue\.level === 'error'\)/)
  assert.match(page, /Errors and Warnings/)
  assert.match(page, /Errors <span>\{errorCount\}<\/span>/)
  assert.match(page, /Warnings <span>\{warningCount\}<\/span>/)
})

test('GPT Builder A6 supports current Salesforce zoom keyboard focus selection and reopen persistence', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /Ctrl\/Cmd \+ Alt\/Option \+ \+ \/ − or Ctrl\/Cmd \+ mouse wheel/)
  assert.match(page, /if \(event\.key === 'F6'\)/)
  assert.match(page, /sequence === 'gd'/)
  assert.match(page, /\['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'\]/)
  assert.match(page, /axis = 'vertical'/)
  assert.match(page, /data-gptb-element-id="start"/)
  assert.match(page, /data-gptb-element-id=\{element\.id\}/)
  assert.match(page, /if \(primary && event\.key === '\/'\)/)
  assert.match(page, /Ctrl\/Cmd \+ K in Auto-Layout/)
  assert.match(page, /Ctrl\/Cmd \+ I in Auto-Layout/)
  assert.match(page, /layout: \{ mode: layout === 'free' \? 'FREE_FORM' : 'AUTO' \}/)
  assert.match(page, /position: element\.position/)
  assert.match(page, /goToConnections,/)
  assert.match(page, /initialWorkflowId = ''/)
  assert.match(page, /Saved GPT Builder flow not found/)
  assert.match(page, /setLayout\(action\.layout\?\.mode === 'FREE_FORM' \? 'free' : 'auto'\)/)
  assert.match(page, /setGoToConnections\(Array\.isArray\(action\.goToConnections\)/)
})

test('GPT Builder Screen Section supports Salesforce nested columns headers and destructive column removal', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderScreen.jsx', import.meta.url), 'utf8')
  const runtimePage = await readFile(new URL('../src/pages/flow/ScreenFlowRuntimePage.jsx', import.meta.url), 'utf8')
  const workflow = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.css', import.meta.url), 'utf8')
  for (const text of ['Include Header','Header Label','Collapsible','Column 1 Width','Drop here','Section Placement']) assert.ok(editor.includes(text), text)
  assert.match(editor, /moveToSectionColumn/)
  assert.match(editor, /addToSectionColumn/)
  assert.match(editor, /component\.layoutParentId!==selected\.id\|\|Number\(component\.layoutColumn\|\|1\)<=count/)
  assert.match(runtimePage, /const columnCount = Math\.max\(1, Math\.min\(4/)
  assert.match(runtimePage, /component\.columnWidths/)
  assert.match(runtimePage, /child\.layoutColumn/)
  assert.match(runtimePage, /md:grid-cols-12/)
  assert.match(workflow, /Screen Section column widths must total 12/)
  assert.match(css, /\.gptb-screen-section-preview/)
  assert.match(css, /grid-template-columns:1fr!important/)
})
test('GPT Builder Screen style layout and multi-condition visibility stay aligned with runtime', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderScreen.jsx', import.meta.url), 'utf8')
  const runtimePage = await readFile(new URL('../src/pages/flow/ScreenFlowRuntimePage.jsx', import.meta.url), 'utf8')
  const workflow = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Details',
    'Style',
    'Set Container Style',
    'Set Header Style',
    'Set Footer Style',
    'Width',
    'Vertical Alignment',
    'When all conditions are met (AND)',
    'When any condition is met (OR)',
    'When custom conditional logic is met',
    'Add Condition',
  ]) assert.ok(editor.includes(text), text)
  assert.match(editor, /Array\.from\(\{length:12\}/)
  assert.match(editor, /MULTI_SELECT/)
  assert.doesNotMatch(editor, /MULTISELECT/)
  assert.match(editor, /map\(\(option\)=>typeof option==='object'/)
  assert.match(runtimePage, /function componentLayoutStyle/)
  assert.match(runtimePage, /gridColumn/)
  assert.match(runtimePage, /function evaluateVisibilityLogic/)
  assert.match(runtimePage, /visibilityConditions/)
  assert.match(runtimePage, /screen\.style\?\.container/)
  assert.match(workflow, /Screen component width must be between 1 and 12 columns/)
  assert.match(workflow, /Screen custom visibility logic/)
  assert.match(workflow, /visibilityInitialValues/)
})
test('GPT Builder Screen matches Salesforce frame navigation palette drag reorder and conditional visibility behavior', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderScreen.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Components',
    'Configure Frame',
    'Control Navigation',
    'Show Header',
    'Show Footer',
    'Previous',
    'Next',
    'Finish',
    'Pause',
    'Set Component Visibility',
    'Drag components here',
    'Section',
    'Data Table',
    'File Upload',
    'Lookup',
    'Multi-Select Picklist',
  ]) assert.ok(editor.includes(text), text)
  assert.match(editor, /application\/x-gptbuilder-screen-component/)
  assert.match(editor, /application\/x-gptbuilder-screen-existing/)
  assert.match(editor, /onResourcesChange/)
  assert.match(page, /screenRuntimeAction\(element\)/)
  assert.match(page, /activeElement\.key === 'screen'/)
  assert.match(runtime, /key: "SCREEN"/)
  assert.match(runtime, /nextLabel: action\.nextLabel/)
  assert.match(runtime, /visibilityResource/)
  assert.match(runtime, /platform_workflow_screen_sessions/)
})

test('GPT Builder Subflow matches Salesforce referenced-flow search input and output contract behavior', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderSubflow.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Referenced Flow',
    'Search flows by label or API name',
    'Select Input Values',
    'Store Output Values',
    'Open Referenced Flow',
  ]) assert.ok(editor.includes(text), text)
  assert.match(editor, /hasWait/)
  assert.match(editor, /currentFlowType==='autolaunched'&&type==='screen'/)
  assert.match(page, /subflowRuntimeAction\(element\)/)
  assert.match(page, /activeElement\.key === 'subflow'/)
  assert.match(runtime, /key: "RUN_SUBFLOW"/)
  assert.match(runtime, /inputContract/)
  assert.match(runtime, /outputContract/)
  assert.match(runtime, /action\.outputMappings/)
  assert.match(runtime, /workflowVariables\.variables\[variableName\] = outputs\[outputName\]/)
})

test('GPT Builder Action uses the metadata action registry with Salesforce-style search and input assignment', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderAction.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(editor, /\/api\/platform\/workflow-actions/)
  assert.match(editor, /Search actions/)
  assert.match(editor, /Set Input Values/)
  assert.match(editor, /Value/)
  assert.match(editor, /Resource/)
  assert.match(editor, /builderVisible!==false/)
  assert.match(editor, /!\['RUN_AGENT','SCREEN','RUN_SUBFLOW'\]\.includes\(action\.key\)/)
  assert.match(page, /actionRuntimeAction\(element\)/)
  assert.match(page, /activeElement\.key === 'action'/)
})

test('GPT Builder Run Agent uses active tenant agent metadata and real Create & Activate', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderRunAgent.jsx', import.meta.url), 'utf8')
  const platform = await readFile(new URL('../server/routes/platform.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../server/database/migrations/0043_platform_agents.sql', import.meta.url), 'utf8')
  const migrations = await readFile(new URL('../server/database/migrations.js', import.meta.url), 'utf8')
  assert.match(editor, /apiRequest\('\/api\/platform\/agents'\)/)
  assert.match(editor, /apiRequest\('\/api\/platform\/agents',\{method:'POST'/)
  assert.match(editor, /Create & Activate/)
  assert.match(editor, /availableAgents\.map/)
  assert.match(platform, /router\.get\("\/platform\/agents"/)
  assert.match(platform, /router\.post\("\/platform\/agents"/)
  assert.match(platform, /Add at least one action before Create & Activate/)
  assert.match(runtime, /FROM platform_agents/)
  assert.match(runtime, /selected agent .* is not active or does not exist/)
  assert.match(runtime, /agentDefinition/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_agents/)
  assert.match(migrations, /0043_platform_agents/)
})
test('GPT Builder Run Agent matches Salesforce agent request session and structured output behavior', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderRunAgent.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Select an existing agent',
    'Create Agent',
    'Agent Request',
    'Session ID',
    'Configure Structured Output',
    'Agent Response',
    'Structured Agent Response',
    'Add Structured Output Field',
  ]) assert.ok(editor.includes(text), text)
  assert.match(editor, /_set/)
  assert.match(editor, /String/)
  assert.match(editor, /Required/)
  assert.match(editor, /Create & Activate/)
  assert.match(editor, /add at least one action before Create & Activate/)
  assert.doesNotMatch(editor, /<option value="date">/)
  assert.doesNotMatch(editor, /<option value="datetime">/)
  assert.match(page, /runAgentRuntimeAction\(element\)/)
  assert.match(page, /activeElement\.key === 'run_agent'/)
  assert.match(runtime, /key: "RUN_AGENT"/)
  assert.match(runtime, /structuredOutput/)
  assert.match(runtime, /sessionId/)
  assert.match(runtime, /must be String, Number, or Boolean/)
  assert.match(runtime, /required structured output/)
  assert.match(runtime, /normalized\[\`\$\{name\}_set\`\] = present/)
  assert.match(runtime, /StructuredAgentResponse/)
})

test('GPT Builder Custom Error matches Salesforce record-page and inline-field error behavior', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderCustomError.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  for (const text of [
    'In a window on a record page',
    'As an inline error on a field',
    'Enter text',
    'Select a resource',
    'Error Message',
  ]) assert.ok(editor.includes(text), text)
  assert.match(editor, /maxLength=\{255\}/)
  assert.match(editor, /apiRequest\(\`\/api\/platform\/objects\//)
  assert.match(page, /customErrorRuntimeAction\(element\)/)
  assert.match(page, /activeElement\.key === 'custom_error'/)
  assert.match(elements, /element\.key === 'custom_error'\) return flowType === 'record'/)
  assert.match(runtime, /key: "CUSTOM_ERROR"/)
  assert.match(runtime, /resolveConfiguredResource\(action\.errorMessage/)
  assert.match(runtime, /error\.location = action\.errorLocation/)
  assert.match(runtime, /CUSTOM_FLOW_ERROR/)
})

test('GPT Builder Group matches Salesforce auto-layout visual grouping and browser-local collapse behavior', async () => {
  const editor = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGroup.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.css', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(editor, /Groups organize auto-layout elements visually and don't change runtime behavior/)
  assert.match(editor, /memberIds/)
  assert.match(editor, /groupedElsewhere/)
  assert.match(page, /gptbuilder\.group\.\$\{group\.id\}\.collapsed/)
  assert.match(page, /localStorage\.setItem\(storageKey/)
  assert.match(page, /AutoGroupCard/)
  assert.match(page, /element\.key==='group'/)
  assert.match(page, /activeElement\.key === 'group'/)
  assert.match(elements, /element\.key === 'group'\) return layout === 'auto'/)
  assert.match(css, /\.gptb-auto-group/)
  assert.doesNotMatch(page, /if \(element\.key === 'group'\) return .*RuntimeAction/)
})

test('GPT Builder Wait Until Date matches Salesforce Enter Date and Get from Attribute UX and runtime behavior', async () => {
  const wait = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderWaitUntilDate.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Enter Date',
    'Get from Attribute',
    'Resume Date',
    'Resume Time',
    'Time Zone',
    'Resume on a date and time relative to the field',
    'Hours',
    'Days',
    'Before',
    'After',
    'Resume at a specific time of day',
    'Use org time zone',
  ]) assert.ok(wait.includes(text), text)
  assert.match(wait, /gptbuilder\.waitUntilDate\.openSections/)
  assert.match(wait, /Select a Date or Date\/Time resource/)
  assert.match(page, /activeElement\.key === 'wait_until_date'/)
  assert.match(page, /waitUntilDateRuntimeAction\(element, resources\)/)
  assert.match(elements, /\['wait_duration', 'wait_conditions', 'wait_until_date'\]\.includes\(element\.key\).*\['autolaunched', 'schedule'\]/s)
  assert.match(runtime, /key: "WAIT_UNTIL_DATE"/)
  assert.match(runtime, /relative unit must be Hours or Days/)
  assert.match(runtime, /specificTimeEnabled/)
  assert.match(runtime, /localToUtc/)
  assert.match(runtime, /runAt = new Date\(\)/)
  assert.match(runtime, /waitUntilDate: true/)
})

test('GPT Builder Wait for Conditions platform-event UX uses event metadata filters resources and output variables', async () => {
  const wait = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderWaitConditions.jsx', import.meta.url), 'utf8')
  const events = await readFile(new URL('../server/services/platformEvents.js', import.meta.url), 'utf8')
  const routes = await readFile(new URL('../server/routes/platformEvents.js', import.meta.url), 'utf8')
  const foundation = await readFile(new URL('../server/database/baseFoundation.sql', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8')
  for (const text of [
    'Add Event Condition',
    'Store Platform Event Message',
    'Select event field',
    'No Conditions',
    'Custom Condition Logic Is Met',
    'Resource',
  ]) assert.ok(wait.includes(text), text)
  assert.match(wait, /field_schema/)
  assert.match(wait, /maxLength=\{765\}/)
  assert.match(foundation, /field_schema JSONB NOT NULL DEFAULT '\[\]'::jsonb/)
  assert.match(events, /fieldSchema = \[\]/)
  assert.match(routes, /SELECT event_type,description,source_package_id,field_schema/)
  assert.match(routes, /observed: true/)
  assert.match(runtime, /platformEventConditionMode/)
  assert.match(runtime, /platformEventCustomConditionLogic/)
  assert.match(runtime, /platformEventOutputVariable/)
  assert.match(server, /matchedPlatformEventPayload/)
  assert.match(server, /platformEventConditionMode/)
  assert.match(server, /workflowVariables\.variables\[String\(payload\.platformEventOutputVariable\)\] = matchedPlatformEventPayload/)
  assert.match(server, /wait_already_resumed/)
})

test('GPT Builder Wait for Conditions matches Salesforce multi-configuration wait and resume-event behavior', async () => {
  const wait = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderWaitConditions.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8')
  for (const text of [
    'Wait Configurations',
    'Always Wait—No Conditions',
    'All Conditions Are Met (AND)',
    'Any Condition Is Met (OR)',
    'Custom Condition Logic Is Met',
    'A Specified Time Occurs',
    'A Platform Event Message Is Received',
    'Base Time',
    'Offset Number',
    'Offset Unit',
    'Default Path',
  ]) assert.ok(wait.includes(text), text)
  assert.match(wait, /Add Wait Configuration/)
  assert.match(wait, /waitConditionsRuntimeAction/)
  assert.match(page, /activeElement\.key === 'wait_conditions'/)
  assert.match(page, /waitConditionsRuntimeAction\(element\)/)
  assert.match(elements, /\['wait_duration', 'wait_conditions', 'wait_until_date'\]\.includes\(element\.key\).*\['autolaunched', 'schedule'\]/s)
  assert.match(runtime, /waitConfigurations/)
  assert.match(runtime, /eligibleConfigurations/)
  assert.match(runtime, /defaultPath: true/)
  assert.match(runtime, /platformEventType/)
  assert.match(server, /platformEventMatched: false/)
  assert.match(server, /wait_already_resumed/)
  assert.match(server, /payload \? 'waitConfigurationId'/)
})

test('GPT Builder Wait for Amount of Time matches Salesforce duration units resume-time options and durable wait runtime', async () => {
  const wait = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderWaitDuration.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Amount of Time',
    'Minutes',
    'Hours',
    'Days',
    'Months',
    'Resume at a specific time of day',
    'Resume Time',
    'Time Zone',
  ]) assert.ok(wait.includes(text), text)
  assert.match(wait, /waitDurationRuntimeAction/)
  assert.match(page, /activeElement\.key === 'wait_duration'/)
  assert.match(page, /waitDurationRuntimeAction\(element\)/)
  assert.match(elements, /\['wait_duration', 'wait_conditions', 'wait_until_date'\]\.includes\(element\.key\)\) return \['autolaunched', 'schedule'\]\.includes\(flowType\)/)
  assert.match(runtime, /key: "WAIT_DURATION"/)
  assert.match(runtime, /unit must be Minutes, Hours, Days, or Months/)
  assert.match(runtime, /resumeAtSpecificTime/)
  assert.match(runtime, /Intl\.DateTimeFormat/)
  assert.match(runtime, /enqueuePlatformJob/)
  assert.match(runtime, /status='WAITING'/)
})

test('GPT Builder recent element UI UX recheck uses metadata pickers and persisted Wait collapse state', async () => {
  const sort = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderCollectionSort.jsx', import.meta.url), 'utf8')
  const transform = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderTransform.jsx', import.meta.url), 'utf8')
  const waitDuration = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderWaitDuration.jsx', import.meta.url), 'utf8')
  const waitConditions = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderWaitConditions.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(sort, /apiRequest\(\`\/api\/platform\/objects\//)
  assert.match(sort, /Select a field/)
  assert.doesNotMatch(sort, /placeholder="Field API Name"/)
  assert.match(transform, /> Add Resource<\/button>/)
  assert.match(transform, /MetadataFieldPicker/)
  assert.match(transform, /SourceFieldPicker/)
  assert.match(transform, /maxLength=\{255\}/)
  assert.match(transform, /mapping-tip/)
  assert.match(transform, /Allow multiple values \(collection\)/)
  assert.match(waitDuration, /gptbuilder\.waitDuration\.openSections/)
  assert.match(waitDuration, /aria-expanded=\{openSections\.duration/)
  assert.match(waitConditions, /gptbuilder\.waitConditions\.openState/)
  assert.match(waitConditions, /Select a resource/)
  assert.match(waitConditions, /\$Flow\.CurrentDateTime/)
  assert.match(waitConditions, /aria-expanded=\{openState\.root/)
  assert.match(page, /objects=\{objects\}/)
  assert.match(page, /resources=\{resources\}/)
})

test('GPT Builder Transform matches current Salesforce source target mapping join aggregate and generated-resource behavior', async () => {
  const transform = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderTransform.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Source Data',
    'Target Data',
    'Allow multiple values (collection)',
    'Join Source Collections',
    'Map Source Data to Target Data',
    'Source Field',
    'Fixed Value',
    'Formula',
    'Aggregate',
    'Value Mapping',
    'Count',
    'Sum',
    '[$EachItem]',
  ]) assert.ok(transform.includes(text), text)
  assert.match(transform, /generatedByElementKey: 'transform'/)
  assert.match(transform, /transformRuntimeAction/)
  assert.match(page, /activeElement\.key === 'transform'/)
  assert.match(page, /transformRuntimeAction\(element\)/)
  assert.match(runtime, /Transform requires join keys when multiple source collections are used/)
  assert.match(runtime, /replace\(\/\\\[\\\$EachItem\\\]\/g, "CurrentItem"\)/)
  assert.match(runtime, /mapping\.aggregate/)
  assert.match(runtime, /mapping\.valueMap/)
  assert.match(runtime, /workflowVariables\.variables\[outputVariable\] = value/)
})

test('GPT Builder Collection Filter matches current Salesforce criteria and generated resources', async () => {
  const filter = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderCollectionFilter.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Filter Collection',
    'Condition Requirements',
    'All Conditions Are Met (AND)',
    'Any Condition Is Met (OR)',
    'Custom Condition Logic Is Met',
    'Formula Evaluates to True',
    'Condition Logic',
    'Generated Resources',
    'Output Collection:',
    'Current Item:',
  ]) assert.ok(filter.includes(text), text)
  assert.match(filter, /CurrentItem_/)
  assert.match(filter, /collectionFilterRuntimeAction/)
  assert.match(page, /activeElement\.key === 'collection_filter'/)
  assert.match(page, /collectionFilterRuntimeAction\(element, resources\)/)
  assert.match(runtime, /Collection Filter formula is required/)
  assert.match(runtime, /custom condition logic/)
  assert.match(runtime, /evaluateWorkflowFormula/)
  assert.match(runtime, /workflowVariables\.variables\[outputVariable\] = output/)
  assert.match(runtime, /currentItemVariable/)
})

test('GPT Builder Loop matches current Salesforce collection direction and current-item behavior', async () => {
  const loop = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderLoop.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Collection Variable',
    'First Item to Last Item',
    'Last Item to First Item',
    'Loop Variable',
    'Current Item from Loop',
  ]) assert.ok(loop.includes(text), text)
  assert.match(loop, /resources\.filter\(\(resource\) => resource\.isCollection\)/)
  assert.match(loop, /CurrentItem_/)
  assert.match(loop, /itemType/)
  assert.match(loop, /itemObjectKey/)
  assert.match(page, /activeElement\.key === 'loop'/)
  assert.match(page, /loopRuntimeAction\(element, resources\)/)
  assert.match(runtime, /FIRST_TO_LAST/)
  assert.match(runtime, /LAST_TO_FIRST/)
  assert.match(runtime, /orderedCollection/)
  assert.doesNotMatch(runtime, /Loop requires at least one body step/)
})

test('GPT Builder Decision matches current Salesforce manual and AI outcome behavior', async () => {
  const decision = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderDecision.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Select Decision Logic',
    'Define Manually (Default)',
    'Define with AI (Advanced)',
    'Decision Instructions',
    'Outcome Order',
    'Outcome Label',
    'Outcome API Name',
    'Condition Requirements',
    'Custom Condition Logic Is Met',
    'Default Outcome Label',
    'New Outcome',
  ]) assert.ok(decision.includes(text), text)
  assert.match(decision, /flowType !== 'record'/)
  assert.match(decision, /decisionRuntimeAction/)
  assert.match(page, /activeElement\.key === 'decision'/)
  assert.match(page, /decisionRuntimeAction\(element\)/)
  assert.match(runtime, /AI Decision requires Decision Instructions/)
  assert.match(runtime, /AI Decision service is unavailable/)
  assert.match(runtime, /outcomeIndex/)
  assert.match(runtime, /defaultLabel/)
})

test('GPT Builder Assignment matches current Salesforce variable rows and type-aware operators', async () => {
  const assignment = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderAssignment.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'Set Variable Values',
    'Assignments run in the order shown.',
    'Add Assignment',
    'Equals',
    'Add',
    'Subtract',
    'Add At Start',
    'Remove First',
    'Remove All',
    'Remove Before First',
    'Remove After First',
    'Remove Position',
    'Remove Uncommon',
    'Equals Count',
  ]) assert.ok(assignment.includes(text), text)
  assert.match(assignment, /assignmentOperators/)
  assert.match(assignment, /assignmentRuntimeAction/)
  assert.match(page, /activeElement\.key === 'assignment'/)
  assert.match(page, /assignmentRuntimeAction\(element, resources\)/)
  assert.match(runtime, /remove_before_first/)
  assert.match(runtime, /remove_after_first/)
  assert.match(runtime, /remove_uncommon/)
  assert.match(runtime, /Equals Count requires a collection value/)
  assert.match(runtime, /type === "date"/)
})

test('GPT Builder Delete Records matches current Salesforce resource and condition modes', async () => {
  const deleteRecords = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderDeleteRecords.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'How to Find Records to Delete',
    'Use the IDs stored in a record variable or record collection variable',
    'Specify conditions',
    'Record Collection',
    'Delete Records of This Object Type',
    'Condition Requirements',
  ]) assert.ok(deleteRecords.includes(text), text)
  assert.match(deleteRecords, /Current Record \(\$Record\)/)
  assert.match(deleteRecords, /recordCollectionResource/)
  assert.match(deleteRecords, /deleteRecordsRuntimeAction/)
  assert.match(deleteRecords, /deleteOperatorsFor/)
  assert.match(deleteRecords, /Is Null/)
  assert.match(page, /activeElement\.key === 'delete_records'/)
  assert.match(page, /deleteRecordsRuntimeAction\(element\)/)
  assert.match(runtime, /Delete Record resource contains an invalid record value/)
  assert.match(runtime, /Delete Record condition field is unavailable/)
  assert.match(runtime, /operator === "is_null"/)
  assert.match(runtime, /same\.map\(\(\{ candidate \}\) => candidate\.sql\)\.join\(" OR "\)/)
  assert.match(runtime, /deletedRecords/)
})

test('GPT Builder Update Records matches current Salesforce resource and condition modes', async () => {
  const updateRecords = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderUpdateRecords.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'How to Find Records to Update and Set Their Values',
    'Use the IDs and all field values from a record or record collection',
    'Specify conditions to identify records, and set fields individually',
    'Record Collection',
    'Condition Requirements',
    'Set Field Values for the',
  ]) assert.ok(updateRecords.includes(text), text)
  assert.match(updateRecords, /Current Record \(\$Record\)/)
  assert.match(updateRecords, /recordCollectionResource/)
  assert.match(updateRecords, /updateRecordsRuntimeAction/)
  assert.match(page, /activeElement\.key === 'update_records'/)
  assert.match(page, /updateRecordsRuntimeAction\(element\)/)
  assert.match(runtime, /recordCollectionResource/)
  assert.match(runtime, /Update Record resource contains an invalid record value/)
  assert.match(runtime, /Update Record condition field is unavailable/)
  assert.match(runtime, /updatedRecords/)
})

test('GPT Builder Create Records matches current Salesforce creation modes and generic runtime', async () => {
  const createRecords = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderCreateRecords.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  for (const text of [
    'How to Set Record Field Values',
    'Manually',
    'From a Record Variable',
    'How Many Records to Create',
    'One',
    'Multiple',
    'Update Existing Records',
    'Check for Matching Records',
    'Skip the matching record',
    'Update the matching record',
  ]) assert.ok(createRecords.includes(text), text)
  assert.match(createRecords, /recordCollectionResource/)
  assert.match(createRecords, /matchField/)
  assert.match(createRecords, /matchConditions/)
  assert.match(createRecords, /createRecordsRuntimeAction/)
  assert.match(page, /activeElement\.key === 'create_records'/)
  assert.match(page, /createRecordsRuntimeAction\(element\)/)
  assert.match(runtime, /recordCollectionResource/)
  assert.match(runtime, /updateExisting/)
  assert.match(runtime, /checkMatchingRecords/)
  assert.match(runtime, /matchAction/)
  assert.match(runtime, /createdRecords/)
  assert.match(runtime, /updatedRecords/)
})

test('GPT Builder Get Records matches current Salesforce limits and advanced null handling', async () => {
  const getRecords = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderGetRecords.jsx', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  assert.match(getRecords, /All records, up to a specified limit/)
  assert.match(getRecords, /Maximum Number of Records to Store/)
  assert.match(getRecords, /select a Number resource/)
  assert.match(getRecords, /maxRecordsMode/)
  assert.match(getRecords, /maxRecordsResource/)
  assert.match(getRecords, /expected="number"/)
  assert.match(getRecords, /When no records are returned, set specified variables to null/)
  assert.match(getRecords, /setNullOnNoRecords/)
  assert.match(runtime, /resolveConfiguredResource\(action\.limit/)
  assert.match(runtime, /maximum record limit must resolve to a number/)
  assert.match(runtime, /advancedAssignment\.setNullOnNoRecords === true/)
})

test('GPT Builder phase 3 element discovery matches the supported Salesforce catalog and visibility rules', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  for (const label of [
    'Action',
    'Run Agent',
    'Screen',
    'Subflow',
    'Assignment',
    'Decision',
    'Loop',
    'Collection Filter',
    'Collection Sort',
    'Transform',
    'Wait for Amount of Time',
    'Wait for Conditions',
    'Wait Until Date',
    'Custom Error',
    'Group',
    'Get Records',
    'Create Records',
    'Update Records',
    'Delete Records',
  ]) assert.ok(elements.includes(`label: '${label}'`), label)
  assert.match(elements, /if \(element\.key === 'screen'\) return flowType === 'screen'/)
  assert.match(elements, /if \(element\.key === 'custom_error'\) return flowType === 'record'/)
  assert.match(elements, /if \(element\.key === 'group'\) return layout === 'auto'/)
  assert.match(elements, /\['wait_duration', 'wait_conditions', 'wait_until_date'\]\.includes\(element\.key\)\) return \['autolaunched', 'schedule'\]\.includes\(flowType\)/)
  assert.match(elements, /return \['assignment', 'decision', 'get_records', 'loop'\]\.includes\(element\.key\)/)
  assert.match(elements, /placeholder="Search elements\.\.\."/)
  assert.match(elements, /No matching elements/)
  assert.match(elements, /Connect to element/)
  assert.match(elements, /> End<\/button>/)
})

test('GPT Builder toolbar follows Salesforce saved-run and validation behavior', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const platform = await readFile(new URL('../server/routes/platform.js', import.meta.url), 'utf8')
  assert.match(page, /disabled=\{!workflowId\}[^>]*onClick=\{\(\) => setExecutionMode\('run'\)\}><Play/s)
  assert.match(page, /setExecutionMode\('test'\)/)
  assert.match(page, /> View Tests<\/button>/)
  assert.match(page, /setExecutionMode\('debug'\)/)
  assert.match(page, /> Debug<\/button>/)
  assert.match(page, /\/api\/platform\/rules\/\$\{encodeURIComponent\(workflowId\)\}\/run/)
  assert.match(page, /\/api\/platform\/rules\/\$\{encodeURIComponent\(workflowId\)\}\/debug/)
  assert.match(platform, /router\.post\("\/platform\/rules\/:ruleId\/run", \.\.\.workflowExecute/)
  assert.match(platform, /workflow = workflowAuthoringRow\(workflow\)/)
  assert.match(platform, /const rollbackMode = executionMode === "TEST"/)
  assert.match(page, /disabled=\{saving \|\| !workflowId \|\| dirty \|\| issues\.some/)
  assert.match(page, /Show Errors/)
  assert.match(page, /Show Warnings/)
  assert.match(page, /Unsaved changes/)
  assert.match(page, /Uses the most recent saved version/)
})


test('GPT Builder Test Mode supports reusable saved scenarios', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const platform = await readFile(new URL('../server/routes/platform.js', import.meta.url), 'utf8')
  assert.match(page, /Saved Test/)
  assert.match(page, /Scenario Name/)
  assert.match(page, /Save Scenario/)
  assert.match(page, /\/api\/platform\/rules\/\$\{encodeURIComponent\(workflowId\)\}\/tests/)
  assert.match(page, /tests\/\$\{encodeURIComponent\(selectedTestId\)\}\/run/)
  assert.match(page, /recordMode: recordId \? 'specific' : 'latest'/)
  assert.match(page, /assertions: \[\]/)
  assert.match(platform, /router\.post\("\/platform\/rules\/:ruleId\/tests"/)
  assert.match(platform, /const assertions = Array\.isArray\(config\.assertions\) \? config\.assertions : \[\]/)
  assert.doesNotMatch(platform, /Saved flow tests require at least one assertion/)
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
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(page, /<ElementPicker/)
  assert.match(page, /aria-label=\{\`Add element at position \$\{index \+ 1\}\`\} aria-expanded=\{elementPickerOpen && autoInsertIndex === index\}/)
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

test('GPT Builder integrated Auto-Layout exposes insertion points between every element', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /const \[autoInsertIndex, setAutoInsertIndex\] = useState\(null\)/)
  assert.match(page, /const addSlot = \(index\) =>/)
  assert.match(page, /Add element at position/)
  assert.match(page, /chooseElement\(element, 'auto', null, index\)/)
  assert.match(page, /const target = autoElements\[insertIndex\] \|\| null/)
})

test('GPT Builder integrated Loop preserves LAST_TO_FIRST ordering exactly once', async () => {
  const runtime = await readFile(new URL('../server/services/platformWorkflow.js', import.meta.url), 'utf8')
  assert.match(runtime, /const orderedCollection = String\(action\.iterationOrder .*LAST_TO_FIRST[\s\S]*\? \[\.\.\.collection\]\.reverse\(\)/)
  assert.match(runtime, /LOOP executor already returns the collection in the requested iteration order/)
  assert.match(runtime, /const iterationCollection = collection;/)
})

test('GPT Builder phase 4 matches auto-layout continuous editing and free-form dialog behavior', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /const useDialog = layout === 'free' \|\| isScreen/)
  assert.doesNotMatch(props, /isAction/)
  assert.match(props, /onLiveChange\?\.\(next\)/)
  assert.match(props, /Changes stay in the draft when you close this panel/)
  assert.match(props, /Undo element change/)
  assert.match(props, />Cancel<\/button>/)
  assert.match(props, />Done<\/button>/)
  assert.match(props, /removeNew: isNew/)
})

test('GPT Builder phase 4 persists element identity and reopens element properties', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /Array\.isArray\(templateAction\.gptBuilderElements\).*structuredClone\(templateAction\.gptBuilderElements\)/s)
  assert.match(page, /gptBuilderElements: elements\.map/)
  assert.match(page, /labelSource: element\.labelSource/)
  assert.match(page, /apiNameSource: element\.apiNameSource/)
  assert.match(page, /onOpen=\{\(\) => openElement\(element\)\}/)
  assert.match(page, /<GPTBuilderElementProperties/)
  assert.match(page, /setEditingElement\(\{ id: instance\.id, isNew: true \}\)/)
})

test('GPT Builder phase 4 blocks saving incomplete Screen and Action elements but allows other draft elements', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
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

test('GPT Builder shared properties preserve Salesforce generated-label and API-name semantics', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /if \(instance\.labelSource === 'manual'\) return \{ \.\.\.instance, config \}/)
  assert.match(props, /draft\.apiNameSource === 'manual'/)
  assert.match(props, /labelSource: 'manual'/)
  assert.match(props, /apiNameSource: 'manual'/)
  assert.match(props, /refreshGeneratedIdentity\(draft, elements, draft\.config\)/)
})


test('GPT Builder recheck implements Salesforce undo redo multi-select copy paste and Go To affordances', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
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
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
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

test('GPT Builder Start clears incompatible state when trigger or object changes', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /objectKey: event\.target\.value, conditions: \[\], formula: '', customConditionLogic: ''/)
  assert.match(page, /!allowsChanged && row\.operator === 'changed'/)
  assert.match(page, /next\.asyncPath = false/)
  assert.match(page, /next\.scheduledPaths = \[\]/)
  assert.match(page, /next\.updateMode = 'every_time'/)
  assert.match(page, /if \(!flow\.startNeedsConfiguration\) return/)
  assert.match(page, /aria-disabled=\{!flow\.startNeedsConfiguration\}/)
})

test('GPT Builder auto-generated labels apply in auto-layout and free-form and preserve manual edits', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /const generated = uniqueLabel\(generatedLabelForElement/)
  assert.match(props, /labelSource: 'auto'/)
  assert.match(props, /if \(instance\.labelSource === 'manual'\)/)
})


test('GPT Builder recheck matches Salesforce draft-save rules by layout mode', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /const hasUnsavableIncomplete = layout === 'free'/)
  assert.match(page, /Resolve flow errors before saving in Free-Form/)
  assert.match(page, /elements\.some\(\(item\) => !item\.configured && \['screen', 'action'\]\.includes\(item\.key\)\)/)
})


test('GPT Builder phase 2 recheck matches current Salesforce flow version properties', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
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
  assert.match(page, /showProgress: templateAction\.showProgress \?\? \(flow\.key === 'screen'\)/)
  assert.match(page, /interviewLabelFromFlowLabel\(label\)/)
  assert.match(page, /saved \? 'Done' : 'Save'/)
  assert.match(page, /\['screen','autolaunched'\]\.includes\(flowType\)/)
  assert.match(page, /Number\.parseFloat\(draft\.apiVersion \|\| '68\.0'\) >= 68/)
  assert.match(page, /defaultRunContextForFlowType\(flow\.key\)/)
})


test('GPT Builder phase 1 recheck uses the current Salesforce New Automation browser', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx', import.meta.url), 'utf8')
  assert.match(page, /<GPTBuilderNewAutomation flowTypes=\{FLOW_TYPES\}/)
  for (const text of ['New Automation','Search automations...','Categories','Triggered','Scheduled','Screen','Autolaunched','Frequently Used','View All','View All Automations','Templates']) {
    assert.ok(automation.includes(text), text)
  }
  assert.doesNotMatch(automation, /Start From Scratch/)
  assert.doesNotMatch(automation, /Use a Template/)
  assert.doesNotMatch(automation, />Create<\/button>/)
  assert.match(automation, /FREQUENT_ORDER = \['screen', 'record', 'schedule', 'autolaunched'\]/)
  assert.match(automation, /onClick=\{\(\) => onCreate\(flow\)\}/)
  assert.match(automation, /apiRequest\('\/api\/platform\/rules'\)/)
  assert.match(automation, /item\?\.action\?\.isTemplate === true/)
  assert.match(automation, /onCreate\(\{ \.\.\.definition, templateRule: template \}\)/)
})

test('GPT Builder phase 2 recheck uses Salesforce Show Advanced and current screen progress settings', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /advancedOpen \? 'Hide Advanced' : 'Show Advanced'/)
  assert.doesNotMatch(page, /<details><summary>Advanced<\/summary>/)
  assert.match(page, /showProgress: templateAction\.showProgress \?\? \(flow\.key === 'screen'\)/)
  assert.match(page, /Simple: Top of Screen/)
  assert.match(page, /Path: Top of Screen/)
  assert.match(page, /Simple: Footer of Screen/)
  assert.match(page, /User Context—Enforces User Permissions/)
  assert.match(page, /Number\.parseFloat\(draft\.apiVersion \|\| '68\.0'\) >= 68/)
})


test('GPT Builder recheck matches Salesforce Save As and Edit History toolbar behavior', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const history = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderSaveHistory.jsx', import.meta.url), 'utf8')
  assert.match(page, /<GPTBuilderSaveAsMenu/)
  assert.match(history, /Save as New Version/)
  assert.match(history, /Save as New Flow/)
  assert.match(page, /aria-label="Edit History"/)
  assert.match(page, /\['autolaunched','schedule','platform_event'\]\.includes\(flow\.key\)/)
  assert.match(history, /This Flow Has Unsaved Changes/)
  assert.match(history, /Save and View Edit History/)
  assert.match(page, /\/api\/platform\/rules\/\$\{encodeURIComponent\(id\)\}\/versions/)
  assert.match(page, /\/versions\/\$\{encodeURIComponent\(entry\.version\)\}\/restore/)
})

test('GPT Builder Save as New Flow auto-populates an editable API name', async () => {
  const history = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderSaveHistory.jsx', import.meta.url), 'utf8')
  assert.match(history, /apiNameFromLabel/)
  assert.match(history, /setManualApi\(true\)/)
  assert.match(history, /Flow Label/)
  assert.match(history, /Flow API Name/)
  assert.doesNotMatch(history, /disabled=\{.*apiName/)
})

test('GPT Builder edit history makes the canvas read-only while reviewing saves', async () => {
  const css = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.css', import.meta.url), 'utf8')
  assert.match(css, /gptb-workspace\.is-history-mode \.gptb-toolbox/)
  assert.match(css, /pointer-events:none/)
})


test('GPT Builder recheck makes Use a Template functional instead of a placeholder', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const automation = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx', import.meta.url), 'utf8')
  assert.match(page, /<GPTBuilderNewAutomation flowTypes=\{FLOW_TYPES\}/)
  assert.match(automation, /apiRequest\('\/api\/platform\/rules'\)/)
  assert.match(automation, /action\?\.isTemplate === true/)
  assert.match(automation, />Templates</)
  assert.match(automation, /role="list"/)
  assert.match(automation, /createFromTemplate\(template\)/)
  assert.match(automation, /templateRule: template/)
  assert.match(page, /templateAction\.gptBuilderElements/)
  assert.match(page, /templateAction\.resources/)
  assert.match(page, /templateAction\.goToConnections/)
  assert.match(page, /flow\.startNeedsConfiguration && !flow\.templateRule/)
})
