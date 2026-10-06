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

  const paletteItem = page.getByRole('button', { name: /Modern Data Card/i })
  await paletteItem.click()
  const node = page.locator('.react-flow__node-registeredComponent').filter({ hasText: 'Modern Data Card' })
  await expect(node).toBeVisible()
  await expect(node).toHaveCSS('opacity', '1')
  await expect(page.locator('.gptpb-selected-meta')).toContainText('Modern Data Card')

  const before = await node.boundingBox()
  expect(before?.width || 0).toBeGreaterThan(100)
  expect(before?.height || 0).toBeGreaterThan(50)
  await node.dragTo(page.locator('.gptpb-canvas'), { targetPosition: { x: 420, y: 280 } })
  await expect(node).toBeVisible()

  await page.getByRole('button', { name: /Delete component/i }).click()
  await expect(node).toHaveCount(0)
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
})
