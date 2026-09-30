import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, clickSafeControls, loginIfConfigured, scrollWholePage, watchRuntimeFailures } from "./helpers.mjs";

const routes = [
  "dashboard",
  "till",
  "sales",
  "products",
  "inventory",
  "purchases",
  "suppliers",
  "customers",
  "reports",
  "developer/objects",
  "developer/workflow-builder",
  "developer/approval-builder",
  "developer/page-builder",
  "developer/dashboard-builder",
  "developer/report-builder",
  "developer/workflow-runs",
  "developer/work-items",
  "developer/platform-apps",
  "developer/deployments",
  "developer/notifications",
  "developer/value-sets",
];

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Set ONEPOS_E2E_USERNAME and ONEPOS_E2E_PASSWORD GitHub secrets for authenticated QA.");
  await loginIfConfigured(page);
});

for (const route of routes) {
  test(`route audit: ${route}`, async ({ page }) => {
    const failures = watchRuntimeFailures(page);
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(500);
    await scrollWholePage(page);
    await clickSafeControls(page);
    await assertNoHorizontalOverflow(page);
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test("workflow builder can add/select/delete a step without stale selection", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");

  const newWorkflow = page.getByRole("button", { name: /new workflow/i });
  if (await newWorkflow.isVisible().catch(() => false)) await newWorkflow.click();

  await expect(page.getByText("Elements", { exact: true })).toBeVisible();
  const createRecord = page.getByRole("button", { name: "Create Record", exact: true }).first();
  await createRecord.click();

  const cards = page.locator(".workflow-node-card");
  await expect(cards).toHaveCount(1);
  await cards.first().click();

  const remove = page.locator(".workflow-node-delete").first();
  await expect(remove).toBeVisible();
  await remove.click();

  await expect(page.locator(".workflow-node-card")).toHaveCount(0);
  await expect(page.getByText("Select a flow element to configure it.")).toBeVisible();
  expect(failures, failures.join("\n")).toEqual([]);
});
