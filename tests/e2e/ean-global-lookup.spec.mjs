import { test, expect } from '@playwright/test'
import { loginIfConfigured, watchRuntimeFailures } from './helpers.mjs'

const EAN = process.env.ONEPOS_E2E_EAN || '3017620422003'

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), 'Authenticated E2E credentials are required.')
  await loginIfConfigured(page)
})

test('EAN global lookup reaches the real lookup endpoint and renders a deterministic outcome', async ({ page }) => {
  const failures = watchRuntimeFailures(page)
  const lookupResponses = []

  page.on('response', async (response) => {
    if (response.request().method() === 'POST' && response.url().includes('/api/global-products/lookup')) {
      let body = null
      try { body = await response.json() } catch {}
      lookupResponses.push({ status: response.status(), body })
    }
  })

  await page.goto('global-products')
  await expect(page.getByRole('heading', { name: 'Global Product Lookup' })).toBeVisible()

  const barcode = page.getByPlaceholder('Scan or enter EAN, UPC or GTIN')
  await expect(barcode).toBeVisible()
  await barcode.fill(EAN)

  const search = page.getByRole('button', { name: /search worldwide/i })
  await expect(search).toBeEnabled()
  await search.click()

  await expect.poll(() => lookupResponses.length, { timeout: 20_000 }).toBeGreaterThan(0)
  const response = lookupResponses.at(-1)
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  expect(response.body?.success, JSON.stringify(response.body)).toBe(true)

  const status = response.body?.data?.status
  expect(['found', 'not_found', 'unavailable']).toContain(status)

  if (status === 'found') {
    expect(String(response.body?.data?.product?.barcode || '')).toBe(EAN)
    await expect(page.getByText(`Barcode ${EAN}`, { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /add to company catalogue/i })).toBeVisible()
  } else if (status === 'not_found') {
    await expect(page.getByText(/No provider found a Product for this barcode/i)).toBeVisible()
  } else {
    await expect(page.getByText(/Product Lookup providers are temporarily unavailable/i)).toBeVisible()
  }

  expect(failures, failures.join('\n')).toEqual([])
})
