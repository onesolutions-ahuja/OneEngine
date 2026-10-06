import { test, expect } from '@playwright/test'
import { loginIfConfigured, watchRuntimeFailures } from './helpers.mjs'

test.describe('GPT Builder Salesforce parity foundation', () => {
  test('New Automation, first-save properties, and layout save rules match the certified surface', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)

    await page.goto('developer/gptbuilder')
    await expect(page.getByRole('dialog', { name: /New Automation/i })).toBeVisible({ timeout: 30_000 })

    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Frequently Used' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Triggered/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Screen/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Autolaunched/ })).toBeVisible()

    await page.getByLabel('Search automations').fill('screen')
    await expect(page.getByRole('button', { name: /Screen Flow/i })).toBeVisible()
    await page.getByRole('button', { name: /Screen Flow/i }).click()

    await expect(page.getByLabel('GPT Builder workspace')).toBeVisible()
    await expect(page.getByLabel('Start')).toBeVisible()

    // Regression: the floating New Automation link must stay below overlays
    // and never intercept actions rendered by configuration/diagnostic panels.
    const newAutomationLink = page.getByRole('button', { name: /^New Automation$/ })
    await expect(newAutomationLink).toBeVisible()
    await page.getByLabel('Start').click()
    const doneButton = page.getByRole('button', { name: /^Done$/ })
    await expect(doneButton).toBeVisible()
    await doneButton.click()
    const saveButton = page.getByRole('button', { name: /^Save$/ })
    await expect(saveButton).toBeEnabled()

    await page.getByRole('button', { name: 'View Properties' }).click()
    const props = page.getByRole('dialog', { name: /Save the Flow/i })
    await expect(props).toBeVisible()

    const label = props.getByText('Flow Label', { exact: true }).locator('..').getByRole('textbox')
    const api = props.getByText('Flow API Name', { exact: true }).locator('..').getByRole('textbox')
    const interview = props.getByText('Interview Label', { exact: true }).locator('..').getByRole('textbox')
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
})
