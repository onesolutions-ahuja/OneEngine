import { test, expect } from '@playwright/test'
import { loginIfConfigured, watchRuntimeFailures } from './helpers.mjs'

test.describe('GPTbuildernew parity gate', () => {
  test('isolated new builder opens, creates a Screen Flow shell, and exposes executable canvas controls', async ({ page }) => {
    if (!(await loginIfConfigured(page))) test.skip(true, 'E2E credentials are not configured')
    const failures = watchRuntimeFailures(page)

    await page.goto('developer/gptbuildernew')
    await expect(page.getByRole('dialog', { name: /New Automation/i })).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Search automations').fill('Screen Flow')
    await page.getByRole('button', { name: /Screen Flow/i }).click()

    await expect(page.getByRole('toolbar', { name: 'Flow Builder toolbar' })).toBeVisible()
    await expect(page.getByRole('application', { name: 'Flow canvas' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Start Configure Start|Start Ready|Start/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add element' })).toBeVisible()

    await page.getByRole('button', { name: 'Add element' }).click()
    await expect(page.getByLabel('Add Element')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Screen$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Decision$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Get Records$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Roll Back Records$/ })).toBeVisible()

    expect(failures, failures.join('\n')).toEqual([])
  })
})
