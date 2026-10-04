import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Authenticated QA credentials required.");
  await loginIfConfigured(page);
  await page.evaluate(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("onepos_user") || "{}");
      const companyId = String(user.companyId || user.company_id || "");
      if (companyId) sessionStorage.setItem("onepos_developer_target_company_id", companyId);
    } catch {}
  });
});

async function openFlow(page, name) {
  await page.goto("developer/workflow-builder");
  await expect(page.locator(".onebuilder-list-view")).toBeVisible({ timeout: 30_000 });
  const search = page.locator(".onebuilder-list-view input[type='search']").first();
  await search.fill(name);
  const row = page.getByText(name, { exact: true });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page.locator(".b2-shell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".b2-top")).toContainText("Workflow Builder");
}

test("Uber Get Stores is visible/editable and completes Workflow Builder Test Mode safely", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await openFlow(page, "GPT - Uber Eats - Get Stores");

  await expect(page.locator(".b2-node").filter({ hasText: "Get Uber Eats Stores" })).toBeVisible();
  await expect(page.locator(".b2-node").filter({ hasText: "Request Successful?" })).toBeVisible();

  await page.getByRole("button", { name: "Test Mode", exact: true }).click();
  const drawer = page.locator(".b2-drawer").filter({ hasText: "Test Mode" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Run Test", exact: true }).click();

  const result = drawer.locator(".b2-test-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  const payload = JSON.parse(await result.textContent());
  expect(payload.status).toBe("COMPLETED");
  expect(payload.rolledBack).toBe(true);
  expect(payload.externalActionsSimulated).toBe(true);
  expect(payload.testPassed).toBe(true);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("Uber Update Item Price exposes required inputs and completes Formula -> HTTP Test Mode safely", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await openFlow(page, "GPT - Uber Eats - Update Item Price");

  await expect(page.locator(".b2-node").filter({ hasText: "Convert Price to Minor Units" })).toBeVisible();
  await expect(page.locator(".b2-node").filter({ hasText: "Update Uber Eats Item Price" })).toBeVisible();

  await page.getByRole("button", { name: "Test Mode", exact: true }).click();
  const drawer = page.locator(".b2-drawer").filter({ hasText: "Test Mode" });
  await expect(drawer).toBeVisible();

  await drawer.getByLabel("storeId").fill("e2e-store");
  await drawer.getByLabel("itemId").fill("e2e-item");
  await drawer.getByLabel("price").fill("12.34");
  await drawer.getByRole("button", { name: "Run Test", exact: true }).click();

  const result = drawer.locator(".b2-test-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  const payload = JSON.parse(await result.textContent());
  expect(payload.status).toBe("COMPLETED");
  expect(payload.rolledBack).toBe(true);
  expect(payload.externalActionsSimulated).toBe(true);
  expect(payload.testPassed).toBe(true);
  expect(payload.variables?.variables?.priceMinor).toBe(1234);
  expect(failures, failures.join("\n")).toEqual([]);
});
