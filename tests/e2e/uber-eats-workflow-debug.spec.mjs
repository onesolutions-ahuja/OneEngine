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

async function runTestMode(page, { name, nodes, inputs = {}, expectedVariables = {} }) {
  const failures = watchRuntimeFailures(page);
  await openFlow(page, name);
  for (const label of nodes) await expect(page.locator(".b2-node").filter({ hasText: label }).first()).toBeVisible();

  await page.getByRole("button", { name: "Test Mode", exact: true }).click();
  const drawer = page.locator(".b2-drawer").filter({ hasText: "Test Mode" });
  await expect(drawer).toBeVisible();
  for (const [key, value] of Object.entries(inputs)) await drawer.getByLabel(key).fill(String(value));
  await drawer.getByRole("button", { name: "Run Test", exact: true }).click();

  const result = drawer.locator(".b2-test-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  const payload = JSON.parse(await result.textContent());
  expect(payload.status, name).toBe("COMPLETED");
  expect(payload.rolledBack, name).toBe(true);
  expect(payload.externalActionsSimulated, name).toBe(true);
  expect(payload.testPassed, name).toBe(true);
  for (const [key, value] of Object.entries(expectedVariables)) expect(payload.variables?.variables?.[key], name + " variable " + key).toBe(value);
  expect(failures, failures.join("\n")).toEqual([]);
}

const cases = [
  {
    name: "GPT - Uber Eats - Get Stores",
    nodes: ["Get Uber Eats Stores", "Request Successful?"],
  },
  {
    name: "GPT - Uber Eats - Test Connection",
    nodes: ["Test Uber Eats Connection", "Request Successful?"],
  },
  {
    name: "GPT - Uber Eats - Upload Menu",
    nodes: ["Get Uber-enabled Products", "Build Uber Items", "Upload Uber Eats Menu", "Menu Upload Successful?"],
    inputs: { storeId: "e2e-store" },
  },
  {
    name: "GPT - Uber Eats - Accept Order",
    nodes: ["Accept Uber Eats Order", "Request Successful?"],
    inputs: { orderId: "e2e-order" },
  },
  {
    name: "GPT - Uber Eats - Deny Order",
    nodes: ["Deny Uber Eats Order", "Request Successful?"],
    inputs: { orderId: "e2e-order", reason: "E2E test denial" },
  },
  {
    name: "GPT - Uber Eats - Update Item Price",
    nodes: ["Calculate Minor Unit Price", "Update Uber Eats Item Price", "Request Successful?"],
    inputs: { storeId: "e2e-store", itemId: "e2e-item", price: 12.34 },
    expectedVariables: { priceMinor: 1234 },
  },
  {
    name: "GPT - Uber Eats - Set Item Unavailable",
    nodes: ["Set Uber Eats Item Unavailable", "Request Successful?"],
    inputs: { storeId: "e2e-store", itemId: "e2e-item", suspendUntil: 1893456000 },
  },
  {
    name: "GPT - Uber Eats - Set Item Available",
    nodes: ["Set Uber Eats Item Available", "Request Successful?"],
    inputs: { storeId: "e2e-store", itemId: "e2e-item" },
  },
];

for (const scenario of cases) {
  test(scenario.name + " opens in Workflow Builder and passes Test Mode", async ({ page }) => {
    await runTestMode(page, scenario);
  });
}
