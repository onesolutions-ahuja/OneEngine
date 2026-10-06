import { test, expect } from '@playwright/test'
import { loginIfConfigured, watchRuntimeFailures } from './helpers.mjs'

test.describe('GPT Builder Salesforce parity foundation', () => {
  test('New Automation, first-save properties, and layout save rules match the certified surface', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /^New Flow$/ })).toBeVisible()
    await page.getByRole('button', { name: /^New Flow$/ }).click()
    await expect(page.getByRole('dialog', { name: /New Automation/i })).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Frequently Used' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
    await page.getByLabel('Search automations').fill('screen')
    await expect(page.getByRole('button', { name: /Screen Flow/i })).toBeVisible()
    await page.getByRole('button', { name: /Screen Flow/i }).click()

    await expect(page.getByLabel('GPT Builder workspace')).toBeVisible()
    await expect(page.locator('[data-gptb-element-id="start"]')).toBeVisible()

    // Regression: the floating New Automation link must stay below overlays
    // and never intercept actions rendered by configuration/diagnostic panels.
    const newAutomationLink = page.getByRole('button', { name: /^New Automation$/ })
    await expect(newAutomationLink).toBeVisible()
    const saveButton = page.getByRole('button', { name: /^Save$/ })
    await expect(saveButton).toBeEnabled()

    await page.getByRole('button', { name: 'View Properties' }).click()
    const props = page.getByRole('dialog', { name: /Save the Flow/i })
    await expect(props).toBeVisible()

    const label = props.locator('label').filter({ hasText: 'Flow Label' }).locator('input')
    const api = props.locator('label').filter({ hasText: 'Flow API Name' }).locator('input')
    const interview = props.locator('label').filter({ hasText: 'Interview Label' }).locator('input')
    await expect(label).toHaveValue('')
    await expect(api).toHaveValue('')

    await label.fill('Certified Screen Flow')
    await expect(api).toHaveValue('Certified_Screen_Flow')
    await expect(interview).toHaveValue('Certified Screen Flow {!$Flow.CurrentDateTime}')

    await props.getByRole('button', { name: 'Show Advanced' }).click()
    await expect(props.getByRole('button', { name: 'Hide Advanced' })).toBeVisible()
    await expect(props.getByText('Source Template', { exact: true })).toBeVisible()
    await expect(props.getByText('Original Flow', { exact: true })).toBeVisible()
    await expect(props.getByText('API Version for Running the Flow', { exact: true })).toBeVisible()

    const runContext = props.getByText('How to Run the Flow', { exact: true }).locator('..').getByRole('combobox')
    await expect(runContext.getByRole('option', { name: 'User Context—Enforces User Permissions' })).toHaveCount(1)
    const progress = props.getByText('Show a progress indicator on screen elements', { exact: true }).locator('..').getByRole('checkbox')
    await expect(progress).toBeChecked()
    await expect(props.getByText('Progress Indicator Type', { exact: true }).locator('..').getByRole('combobox')).toHaveValue('simple_top')

    await props.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: /Auto-Layout/ }).click()
    await page.getByRole('menuitemradio', { name: /Free-Form/ }).click()
    await expect(saveButton).toBeDisabled()

    expect(failures, failures.join('\n')).toEqual([])
  })
  test('Platform Event $Record fields come from field_schema and are selectable in Decision', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)

    await page.route('**/api/platform/event-types', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            event_type: 'contract_test_event',
            description: 'Contract event',
            field_schema: [
              { api_name: 'mode', label: 'Mode', data_type: 'text' },
              { api_name: 'attempts', label: 'Attempts', data_type: 'number' },
            ],
          }],
        }),
      })
    })

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /^New Flow$/ }).click()
    await page.getByLabel('Search automations').fill('platform event')
    await page.getByRole('button', { name: /Platform Event-Triggered Flow/i }).click()

    const startPanel = page.getByLabel('Configure Start')
    await expect(startPanel).toBeVisible()
    await startPanel.locator('select').first().selectOption('contract_test_event')
    await startPanel.getByRole('button', { name: /^Done$/ }).click()

    await page.getByRole('button', { name: 'Add after Start' }).click()
    const add = page.getByRole('dialog', { name: 'Add Element' })
    await expect(add).toBeVisible()
    await add.getByRole('button', { name: /^Decision$/ }).click()

    await expect(page.getByText('Decision Mode', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /New Outcome/i }).click()
    await page.getByRole('button', { name: /Add Condition/i }).click()

    const searches = page.getByLabel('Search resources and fields')
    await expect(searches.first()).toBeVisible()
    await searches.first().fill('mode')
    const resource = page.getByLabel('Resource').first()
    await expect(resource.getByRole('option', { name: /Platform Event Record.*Mode.*\$Record\.mode/i })).toHaveCount(1)
    await resource.selectOption('$Record.mode')
    await expect(resource).toHaveValue('$Record.mode')

    await searches.first().fill('attempts')
    await expect(resource.getByRole('option', { name: /Platform Event Record.*Attempts.*\$Record\.attempts/i })).toHaveCount(1)

    expect(failures, failures.join('\n')).toEqual([])
  })
  test('Record-triggered $Record and related fields come from record-path metadata', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)

    await page.route('**/api/platform/objects', async (route) => {
      if (!route.request().url().endsWith('/api/platform/objects')) return route.continue()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [{ id: 'obj-contact', object_key: 'contact', label: 'Contact' }] }),
      })
    })
    await page.route('**/api/platform/objects/obj-contact/record-paths?depth=4', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [
          { kind: 'field', path: 'contact.name', label: 'Name', fieldType: 'text', readable: true, active: true },
          { kind: 'field', path: 'contact.account.owner.email', label: 'Owner Email', fieldType: 'text', readable: true, active: true },
        ] }),
      })
    })

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /^New Flow$/ }).click()
    await page.getByLabel('Search automations').fill('record')
    await page.locator('.gptb-type-card').filter({ has: page.getByText('Record-Triggered Flow', { exact: true }) }).click()

    const startPanel = page.getByLabel('Configure Start')
    await expect(startPanel).toBeVisible()
    await startPanel.locator('label').filter({ hasText: /^Object/ }).getByRole('combobox').selectOption('contact')
    await startPanel.getByRole('button', { name: /^Done$/ }).click()

    await page.getByRole('button', { name: 'Add after Start' }).click()
    const add = page.getByRole('dialog', { name: 'Add Element' })
    await expect(add).toBeVisible()
    await add.getByRole('button', { name: /^Decision$/ }).click()
    await page.getByRole('button', { name: /New Outcome/i }).click()
    await page.getByRole('button', { name: /Add Condition/i }).click()

    const search = page.getByLabel('Search resources and fields').first()
    const resource = page.getByLabel('Resource').first()
    await search.fill('Owner Email')
    await expect(resource.getByRole('option', { name: /Triggering Record.*Owner Email.*\$Record\.account\.owner\.email/i })).toHaveCount(1)
    await resource.selectOption('$Record.account.owner.email')
    await expect(resource).toHaveValue('$Record.account.owner.email')

    await search.fill('Prior Triggering Record')
    await expect(resource.getByRole('option', { name: /Prior Triggering Record.*\$Record__Prior\./i })).toHaveCount(2)

    expect(failures, failures.join('\n')).toEqual([])
  })
  test('all five supported flow types open the correct editable Builder context', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)
    const cases = [
      ['Screen Flow', false],
      ['Record-Triggered Flow', true],
      ['Schedule-Triggered Flow', true],
      ['Platform Event-Triggered Flow', true],
      ['Autolaunched Flow (No Trigger)', false],
    ]
    for (const [label, needsStart] of cases) {
      await page.goto('developer/gptbuilder')
      await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: /^New Flow$/ }).click()
      await page.getByLabel('Search automations').fill(label)
      await page.locator('.gptb-type-card').filter({ has: page.getByText(label, { exact: true }) }).click()
      await expect(page.getByLabel('GPT Builder workspace')).toBeVisible()
      if (needsStart) await expect(page.getByLabel('Configure Start')).toBeVisible()
    await expect(page.locator('[data-gptb-element-id="start"]')).toBeVisible()
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
  test('save, list reopen, and edit preserve the saved GPT Builder definition', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)
    let savedRule = null

    await page.route('**/api/platform/rules', async (route) => {
      const request = route.request()
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: savedRule ? [savedRule] : [] }) })
        return
      }
      if (request.method() === 'POST') {
        const payload = request.postDataJSON()
        savedRule = {
          id: 'contract-saved-flow',
          ...payload,
          runtime_active: false,
          lifecycle_status: 'DRAFT',
          created_at: '2026-10-05T12:00:00.000Z',
          updated_at: '2026-10-05T12:00:00.000Z',
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: savedRule }) })
        return
      }
      await route.continue()
    })

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /^New Flow$/ }).click()
    await page.getByLabel('Search automations').fill('screen')
    await page.getByRole('button', { name: /Screen Flow/i }).click()
    await expect(page.getByLabel('GPT Builder workspace')).toBeVisible()

    await page.getByRole('button', { name: /^Save$/ }).click()
    const props = page.getByRole('dialog', { name: /Save the Flow/i })
    await expect(props).toBeVisible()
    await props.locator('label').filter({ hasText: 'Flow Label' }).locator('input').fill('Contract Persistence Flow')
    await props.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByText('Flow saved.', { exact: true })).toBeVisible()
    expect(savedRule?.action?.gptBuilder).toBe(true)
    expect(savedRule?.action?.flowType).toBe('screen')
    expect(savedRule?.action?.layout?.mode).toBe('AUTO')
    expect(Array.isArray(savedRule?.action?.gptBuilderElements)).toBe(true)

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Contract Persistence Flow' })).toBeVisible()
    await page.getByRole('button', { name: /Edit Contract Persistence Flow/i }).click()
    await expect(page.getByLabel('GPT Builder workspace')).toBeVisible()
    await page.getByRole('button', { name: 'View Properties' }).click()
    const reopened = page.getByRole('dialog', { name: /Flow Properties/i })
    await expect(reopened).toBeVisible()
    await expect(reopened.locator('label').filter({ hasText: 'Flow Label' }).locator('input')).toHaveValue('Contract Persistence Flow')
    await expect(reopened.locator('label').filter({ hasText: 'Flow API Name' }).locator('input')).toHaveValue('Contract_Persistence_Flow')

    expect(failures, failures.join('\n')).toEqual([])
  })
  test('Run, Debug, and saved Test Scenario use the correct saved-flow endpoints and show results', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)
    const rules = [
      { id: 'runtime-auto', name: 'Runtime Autolaunched', active: false, lifecycle_status: 'DRAFT', action: { type: 'workflow', gptBuilder: true, flowType: 'autolaunched', apiName: 'Runtime_Autolaunched', start: {}, layout: { mode: 'AUTO' }, gptBuilderElements: [], resources: [] } },
      { id: 'runtime-screen', name: 'Runtime Screen', active: false, lifecycle_status: 'DRAFT', action: { type: 'workflow', gptBuilder: true, flowType: 'screen', apiName: 'Runtime_Screen', start: {}, layout: { mode: 'AUTO' }, gptBuilderElements: [], resources: [] } },
    ]
    const calls = []

    await page.route('**/api/platform/rules', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: rules }) })
    })
    await page.route('**/api/platform/rules/runtime-auto/run', async (route) => {
      calls.push({ kind: 'run', body: route.request().postDataJSON() })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'COMPLETED', runId: 'run-1', steps: [] } }) })
    })
    await page.route('**/api/platform/rules/runtime-screen/debug', async (route) => {
      calls.push({ kind: 'debug', body: route.request().postDataJSON() })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'COMPLETED', runId: 'debug-1', steps: [] } }) })
    })
    await page.route('**/api/platform/rules/runtime-auto/tests', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'scenario-1', name: 'Saved Contract Scenario', config: { inputs: {}, rollback: true }, last_status: 'PASSED' }] }) })
    })
    await page.route('**/api/platform/rules/runtime-auto/tests/scenario-1/run', async (route) => {
      calls.push({ kind: 'test', body: route.request().postDataJSON() })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { status: 'COMPLETED', testPassed: true, runId: 'test-1', assertionResult: { checks: [] } } }) })
    })

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('heading', { name: 'Flows' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /Edit Runtime Autolaunched/i }).click()
    await expect(page.getByLabel('GPT Builder workspace')).toBeVisible()

    await page.getByRole('button', { name: /^Run$/ }).click()
    const runPanel = page.getByRole('complementary', { name: 'Run' })
    await expect(runPanel).toBeVisible()
    await runPanel.getByRole('button', { name: /^Run$/ }).click()
    await expect(runPanel.getByText('COMPLETED', { exact: true })).toBeVisible()
    await expect(runPanel.getByText('run-1', { exact: true })).toBeVisible()
    await runPanel.getByRole('button', { name: /^Close$/ }).click()

    await page.getByRole('button', { name: /^View Tests$/ }).click()
    const testPanel = page.getByRole('complementary', { name: 'View Tests' })
    await expect(testPanel).toBeVisible()
    await testPanel.getByText('Saved Test', { exact: true }).locator('..').getByRole('combobox').selectOption('scenario-1')
    await testPanel.getByRole('button', { name: /^Run Scenario$/ }).click()
    await expect(testPanel.getByText('Passed', { exact: true })).toBeVisible()
    await testPanel.getByRole('button', { name: /^Close$/ }).click()

    await page.getByRole('button', { name: /^New Automation$/ }).click()
    await page.getByRole('button', { name: /^Cancel$/ }).click()
    await page.goto('developer/gptbuilder')
    await page.getByRole('button', { name: /Edit Runtime Screen/i }).click()
    await page.getByRole('button', { name: /^Debug$/ }).click()
    const debugPanel = page.getByRole('complementary', { name: 'Debug' })
    await expect(debugPanel).toBeVisible()
    await debugPanel.getByRole('button', { name: /^Run$/ }).click()
    await expect(debugPanel.getByText('debug-1', { exact: true })).toBeVisible()

    expect(calls.map((call) => call.kind)).toEqual(['run', 'test', 'debug'])
    expect(calls.find((call) => call.kind === 'test')?.body?.mode).toBe('test')
    expect(calls.find((call) => call.kind === 'debug')?.body?.mode).toBe('debug')
    expect(failures, failures.join('\n')).toEqual([])
  })
})
