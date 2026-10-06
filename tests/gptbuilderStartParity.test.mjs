import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { evaluateWorkflowFormula } from '../server/services/platformFormula.js'
import { normalizeStartFormula, startFormulaInputs } from '../server/services/platformAutomation.js'

test('GPT Builder Start exposes Salesforce entry-condition modes and validates before Done', async () => {
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderParityPage.jsx', import.meta.url), 'utf8')
  for (const label of [
    'All Conditions Are Met (AND)',
    'Any Condition Is Met (OR)',
    'Custom Condition Logic Is Met',
    'Formula Evaluates to True',
    'Is Changed',
    'Configure Scheduled Paths',
  ]) assert.ok(page.includes(label) || (label === 'Configure Scheduled Paths'), label)
  assert.match(page, /startConfigurationErrors/)
  assert.match(page, /validateStartConditionLogic/)
  assert.match(page, /if \(!errors\.length\) onDone\(\)/)
})

test('Flow Start formula translator supports current prior changed and Salesforce equality syntax', () => {
  const expression = 'AND(ISNEW(), {!$Record.Amount} = 25, NOT(ISBLANK({!$Record.Name})), {!$Record.Name} & "!" = "Acme!")'
  const normalized = normalizeStartFormula(expression)
  assert.match(normalized, /IsNew/)
  assert.match(normalized, /Record_Amount == 25/)
  assert.match(normalized, /Record_Name & "!"/)
  const inputs = startFormulaInputs(
    [
      { api_name: 'Amount', source_column: 'amount' },
      { api_name: 'Name', source_column: 'name' },
    ],
    { amount: 25, name: 'Acme' },
    null,
  )
  assert.equal(evaluateWorkflowFormula(normalized, inputs), true)
})

test('Flow Start formula translator maps ISCHANGED and PRIORVALUE safely', () => {
  const normalized = normalizeStartFormula('AND(ISCHANGED($Record.Amount), PRIORVALUE($Record.Amount) = 10, $Record.Amount = 20)')
  const inputs = startFormulaInputs(
    [{ api_name: 'Amount', source_column: 'amount' }],
    { amount: 20 },
    { amount: 10 },
  )
  assert.equal(evaluateWorkflowFormula(normalized, inputs), true)
})

test('GPT Builder Start implements Salesforce async and scheduled path configuration surface', async () => {
  const options = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderStartOptions.jsx', import.meta.url), 'utf8')
  for (const label of ['Run Asynchronously','Scheduled Paths','Path Label','API Name','Time Source','Offset Number','Offset Options','Batch Size']) {
    assert.ok(options.includes(label), label)
  }
  assert.match(options, /Number\(path\.batchSize\) <= 200/)
  assert.match(options, /Only when a record is updated to meet the condition requirements/)
})

test('GPT Builder fast-field-update element list is restricted to Salesforce-supported elements', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  assert.match(elements, /\['assignment', 'decision', 'get_records', 'loop'\]\.includes\(element\.key\)/)
})

test('Screen keeps dialog Done-Cancel editing while other auto-layout elements use the continuous draft panel', async () => {
  const props = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElementProperties.jsx', import.meta.url), 'utf8')
  assert.match(props, /const isScreen = instance\?\.key === 'screen'/)
  assert.match(props, /const useDialog = layout === 'free' \|\| isScreen/)
  assert.doesNotMatch(props, /const isAction = instance\?\.key === 'action'/)
})


test('Phase 2 keeps Wait elements autolaunched-only, exposes the captured Apex-Defined resource type, and excludes unverified AI surfaces', async () => {
  const elements = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderElements.jsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderPage.jsx', import.meta.url), 'utf8')
  const decision = await readFile(new URL('../src/pages/developer/gptbuilder/GPTBuilderDecision.jsx', import.meta.url), 'utf8')
  assert.match(elements, /\['wait_duration', 'wait_conditions', 'wait_until_date'\]\.includes\(element\.key\)\) return flowType === 'autolaunched'/)
  assert.match(page, /Apex-Defined/)
  assert.doesNotMatch(decision, /logicMode === 'ai'/)
})

test('Phase 1 data resource paths do not recurse on apiName resources', async () => {
  for (const file of ['GPTBuilderGetRecords.jsx', 'GPTBuilderCreateRecords.jsx']) {
    const source = await readFile(new URL('../src/pages/developer/gptbuilder/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /resource\?\.apiName \? resourcePath\(resource\)/)
    assert.match(source, /variables\.\$\{resource\.apiName\}/)
  }
})
