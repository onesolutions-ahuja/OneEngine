import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Set ONEPOS_PLAYWRIGHT_USERNAME and ONEPOS_PLAYWRIGHT_PASSWORD in GitHub Actions repository Variables for authenticated QA.");
  await loginIfConfigured(page);
});

test("workflow builder exposes complete no-code authoring and safe test surfaces", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");

  const newWorkflow = page.getByRole("button", { name: /new workflow/i });
  await expect(newWorkflow).toBeVisible({ timeout: 15_000 });
  await newWorkflow.click();

  await expect(page.getByText("Elements", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Resources", { exact: true })).toBeVisible();

  // Unsaved workflows can be Debugged safely, but persisted-test/version controls
  // correctly remain unavailable until the first save.
  await expect(page.getByRole("button", { name: "Debug", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Tests", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Versions", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save as New Version", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Debug", exact: true }).click();
  await expect(page.getByText("Debug / Test workflow", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Debug", exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Test", exact: true })).toBeVisible();
  await expect(page.getByText(/database changes are rolled back/i)).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();

  // Persist a harmless manual workflow so the regression exercises the real
  // version/test APIs rather than only checking their disabled pre-save state.
  const qaWorkflowName = `Workflow Builder E2E ${Date.now()}`;
  await page.getByPlaceholder("Workflow name").fill(qaWorkflowName);
  const initialTriggerSelect = page.getByLabel("Workflow trigger");
  await initialTriggerSelect.selectOption("manual");
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();

  const workflowSearch = page.getByPlaceholder("Search Workflow");
  await workflowSearch.fill(qaWorkflowName);
  const savedRow = page.locator(".onebuilder-list-row").filter({ hasText: qaWorkflowName }).first();
  await expect(savedRow).toBeVisible();
  await savedRow.click();

  await expect(page.getByRole("button", { name: "Tests", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Versions", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save as New Version", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.getByText("Version History", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Version \d+$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();

  await page.getByRole("button", { name: "Tests", exact: true }).click();
  await expect(page.getByText("Saved Tests", { exact: true })).toBeVisible();
  const qaTestName = `Manual workflow completes ${Date.now()}`;
  await page.getByPlaceholder(/Test name/i).fill(qaTestName);
  await page.getByRole("button", { name: "Save Test", exact: true }).click();
  const savedTest = page.locator("div").filter({ hasText: qaTestName }).filter({ has: page.getByRole("button", { name: "Run", exact: true }) }).last();
  await expect(savedTest).toBeVisible();
  await expect(savedTest.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await savedTest.getByRole("button", { name: "Run", exact: true }).click();
  const debugPanel = page.locator("div").filter({ hasText: "Debug / Test workflow" }).filter({ hasText: "No database changes were kept" }).last();
  await expect(debugPanel.getByText("Test passed", { exact: true })).toBeVisible();
  await expect(debugPanel.getByText(/No database changes were kept/i)).toBeVisible();
  await debugPanel.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Tests", exact: true }).click();

  // Record-triggered Start configuration exposes Salesforce-style transition
  // semantics without requiring Changed operators on every individual field.
  const triggerSelect = page.getByLabel("Workflow trigger");
  await triggerSelect.selectOption("after_update");
  await page.locator(".workflow-start-node").click();
  await expect(page.getByText("When conditions become true", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Every time the record meets the conditions" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Only when the record is updated to meet the conditions" })).toHaveCount(1);

  // Start configuration owns scheduled paths; adding one must expose the
  // no-code timing controls without adding a normal canvas node.
  await expect(page.getByText("Scheduled paths", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Add path", exact: true }).click();
  await expect(page.getByPlaceholder("Path name")).toHaveValue("Scheduled Path");
  await expect(page.getByRole("option", { name: "Run after a delay" })).toHaveCount(1);
  await expect(page.getByText("Steps on this scheduled path", { exact: true })).toBeVisible();

  // Decision authoring must support ordered named outcomes + Default.
  await page.getByRole("button", { name: "Decision", exact: true }).first().click();
  const decisionCard = page.locator(".workflow-node-card").filter({ hasText: "Decision" }).last();
  await decisionCard.click();
  await expect(page.getByRole("button", { name: "+ Add outcome", exact: true })).toBeVisible();
  await expect(page.getByText("Default · No outcome matched", { exact: true })).toBeVisible();

  // Every executable element exposes friendly fault handling instead of raw
  // exception configuration.
  const onError = page.getByText("On Error", { exact: true }).last();
  await onError.click();
  await expect(page.getByRole("option", { name: "Fail the workflow" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Run an error path" })).toHaveCount(1);
  await expect(page.getByText(/Fault resources such as Error message and How to fix/i)).toBeVisible();

  // Workflow-level reusable subflow contracts remain first-class authoring UI.
  await page.getByText("Subflow interface", { exact: true }).click();
  await expect(page.getByRole("button", { name: "+ Input", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Output", exact: true })).toBeVisible();

  // Core collection/data/logic elements added for Salesforce-style flows remain
  // available as normal no-code elements.
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  for (const elementName of ["Assignment", "Loop", "Get Records", "Bulk Update Records"]) {
    await expect(page.getByRole("button", { name: elementName, exact: true }).first()).toBeVisible();
  }

  // The canvas ships dedicated status classes used by Debug/Test to make the
  // path understandable to non-developers (green success, red failure).
  await expect(page.locator("style").filter({ hasText: "is-debug-failed" })).toHaveCount(1);
  await expect(page.locator("style").filter({ hasText: "is-debug-completed" })).toHaveCount(1);

  // Resource Manager remains separate from canvas elements.
  await page.getByRole("button", { name: "Resources", exact: true }).click();
  await expect(page.getByRole("button", { name: "+ Constant", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Formula", exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});
