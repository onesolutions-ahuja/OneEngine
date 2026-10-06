import { test, expect } from '@playwright/test'

test('GPT Page Builder renders without route/runtime errors', async ({ page }) => {
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/OneEngine/developer/gpt-page-builder')
  await page.waitForLoadState('networkidle')

  const routeFailure = page.getByText(/Error OEFR101|Error OEFL101/)
  if (await routeFailure.count()) {
    throw new Error(['GPT Page Builder route failed.', ...pageErrors, ...consoleErrors].filter(Boolean).join('\n'))
  }

  await expect(page.getByText('GPT Page Builder', { exact: true })).toBeVisible()
  await expect(page.getByText(/registered components/)).toBeVisible()
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
})
