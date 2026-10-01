import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Set ONEPOS_E2E_USERNAME and ONEPOS_E2E_PASSWORD GitHub secrets for authenticated QA.");
  await loginIfConfigured(page);
});

test("workflow builder exposes complete no-code authoring and safe test surfaces", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");

  const newWorkflow = page.getByRole("button", { name: /new workflow/i });
  if (await newWorkflow.isVisible().catch(() => false)) await newWorkflow.click();

  await expect(page.getByText("Elements", { exact: true })).toBeVisible();
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

  // Start configuration owns scheduled paths; adding one must expose the
  // no-code timing controls without adding a normal canvas node.
  await page.locator(".workflow-start-node").click();
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

  // Resource Manager remains separate from canvas elements.
  await page.getByRole("button", { name: "Resources", exact: true }).click();
  await expect(page.getByRole("button", { name: "+ Constant", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Formula", exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});
