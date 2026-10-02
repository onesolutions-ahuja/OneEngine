import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Set ONEPOS_PLAYWRIGHT_USERNAME and ONEPOS_PLAYWRIGHT_PASSWORD in GitHub Actions repository Variables for authenticated QA.");
  await loginIfConfigured(page);
});

test("workflow builder exposes complete no-code authoring and safe test surfaces", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");

  // Workflow execution is tenant-RBAC scoped. OneEngine Manager may author
  // metadata for another tenant, but must not silently borrow a role from that
  // tenant to execute its workflow. Run the executable part of this regression
  // in the authenticated user's own company so workflow.execute is evaluated
  // against the user's real company-bound role.
  const homeCompanyId = await page.evaluate(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("onepos_user") || "{}");
      return String(user.companyId || user.company_id || "");
    } catch {
      return "";
    }
  });
  if (homeCompanyId) {
    // Developer metadata requests carry X-Acting-Company-Id. A previously
    // selected client can persist across the shared E2E session, so force the
    // Builder back to the authenticated user's own tenant before exercising
    // executable workflow tests. This changes only the normal OneDeveloper
    // target-company context; RBAC is still enforced by the server.
    await page.evaluate((companyId) => {
      sessionStorage.setItem("onepos_developer_target_company_id", companyId);
    }, homeCompanyId);
    await page.reload();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("onepos_developer_target_company_id") || "")).toBe(homeCompanyId);
  }

  const newWorkflow = page.getByRole("button", { name: /new workflow/i });
  await expect(newWorkflow).toBeVisible({ timeout: 15_000 });
  await newWorkflow.click();

  await expect(page.getByText("Elements", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Manager", { exact: true })).toBeVisible();

  // Unsaved workflows can be Debugged safely, but persisted-test/version controls
  // correctly remain unavailable until the first save.
  const workflowWorkspace = page.getByLabel("Workflow Builder workspace");
  await expect(workflowWorkspace.getByRole("button", { name: "Debug", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "View Tests", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit History", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save As", exact: true })).toBeDisabled();

  await workflowWorkspace.getByRole("button", { name: "Debug", exact: true }).click();
  await expect(page.getByText("Debug / Test Flow", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Debug", exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Test", exact: true })).toBeVisible();
  await expect(page.getByText(/database changes are rolled back/i)).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();

  // Persist a harmless manual workflow so the regression exercises the real
  // version/test APIs rather than only checking their disabled pre-save state.
  const qaWorkflowName = `Workflow Builder E2E ${Date.now()}`;
  await workflowWorkspace.getByRole("button", { name: "View Properties", exact: true }).click();
  const flowProperties = page.getByRole("dialog", { name: "Flow Properties" });
  await expect(flowProperties).toBeVisible();
  const flowLabelInput = flowProperties.getByPlaceholder("Flow Label");
  await expect(flowLabelInput).toBeVisible();
  await flowLabelInput.fill(qaWorkflowName);
  await flowProperties.getByRole("button", { name: "Done", exact: true }).click();
  const initialTriggerSelect = page.getByLabel("Flow trigger");
  await initialTriggerSelect.selectOption("manual");
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const workflowSearch = page.getByPlaceholder(/Search workflows/i);
  await workflowSearch.fill(qaWorkflowName);
  const savedRow = page.locator(".onebuilder-list-row").filter({ hasText: qaWorkflowName }).first();
  await expect(savedRow).toBeVisible();
  await savedRow.click();

  await expect(page.getByRole("button", { name: "View Tests", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Edit History", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save As", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  const versionHistory = page.getByText("Version History", { exact: true });
  await expect(versionHistory).toBeVisible();
  await expect(page.getByText(/^Version \d+$/).first()).toBeVisible();
  const versionPanel = versionHistory.locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await versionPanel.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "View Tests", exact: true }).click();
  await expect(page.getByText("Saved Tests", { exact: true })).toBeVisible();
  const qaTestName = `Manual workflow completes ${Date.now()}`;
  await page.getByPlaceholder(/Test name/i).fill(qaTestName);
  await page.getByRole("button", { name: "Save Test", exact: true }).click();
  const savedTest = page.locator("div").filter({ hasText: qaTestName }).filter({ has: page.getByRole("button", { name: "Run", exact: true }) }).last();
  await expect(savedTest).toBeVisible();
  await expect(savedTest.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await savedTest.getByRole("button", { name: "Run", exact: true }).click();
  const debugPanel = page.locator("div").filter({ hasText: "Debug / Test Flow" }).filter({ hasText: "No database changes were kept" }).last();
  await expect(debugPanel.getByText("Test passed", { exact: true })).toBeVisible();
  await expect(debugPanel.getByText(/No database changes were kept/i)).toBeVisible();
  await debugPanel.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "View Tests", exact: true }).click();

  // Record-triggered Start configuration exposes Salesforce-style transition
  // semantics without requiring Changed operators on every individual field.
  await workflowWorkspace.getByRole("button", { name: "View Properties", exact: true }).click();
  const recordFlowProperties = page.getByRole("dialog", { name: "Flow Properties" });
  await expect(recordFlowProperties).toBeVisible();
  await recordFlowProperties.getByLabel("Flow Type").selectOption("RECORD_TRIGGERED");
  await recordFlowProperties.getByRole("button", { name: "Done", exact: true }).click();
  const triggerSelect = page.getByLabel("Flow trigger");
  await triggerSelect.selectOption("after_update");
  await page.locator(".workflow-start-node").click();
  await expect(page.getByText("When conditions become true", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Every time the record meets the conditions" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Only when the record is updated to meet the conditions" })).toHaveCount(1);

  // Start configuration owns scheduled paths; adding one must expose the
  // no-code timing controls without adding a normal canvas node.
  await expect(page.getByText("Scheduled Paths", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Add path", exact: true }).click();
  await expect(page.getByPlaceholder("Path name")).toHaveValue("Scheduled Path");
  await expect(page.getByRole("option", { name: "Run after a delay" })).toHaveCount(1);
  await expect(page.getByText("Add elements to this path from the Scheduled Path branch on the canvas.", { exact: true })).toBeVisible();

  // Decision authoring must support ordered named outcomes + Default.
  await page.getByRole("button", { name: "Decision", exact: true }).first().click();
  const decisionCard = page.locator(".workflow-node-card").filter({ hasText: "Decision" }).last();
  await decisionCard.click();
  await expect(page.getByRole("button", { name: "+ New Outcome", exact: true })).toBeVisible();
  await expect(page.getByText("Default Outcome Label", { exact: true })).toBeVisible();
  await expect(page.getByText(/This path runs only when no configured outcome matches/i)).toBeVisible();

  // Every executable element exposes friendly fault handling instead of raw
  // exception configuration.
  const onError = page.getByText("On Error", { exact: true }).last();
  await onError.click();
  await expect(page.getByRole("option", { name: "Fail the flow" })).toHaveCount(1);
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
  await page.getByRole("button", { name: "Manager", exact: true }).click();
  await expect(page.getByRole("button", { name: "+ Constant", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Formula", exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});


test("email provider actions use metadata resources instead of hardcoded recipients", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");

  const newWorkflow = page.getByRole("button", { name: /new workflow/i });
  await expect(newWorkflow).toBeVisible({ timeout: 15_000 });
  await newWorkflow.click();

  // Registered provider actions use the Salesforce-style Action element:
  // Add Element -> Action -> choose the registered provider action.
  await page.getByRole("button", { name: "Add element after Start", exact: true }).click();
  const palette = page.locator(".workflow-node-palette");
  await palette.getByLabel("Search flow elements").fill("Action");
  await palette.getByRole("button", { name: "Action", exact: true }).click();

  const actionSearch = page.getByLabel("Search actions");
  await actionSearch.fill("Send Email - Brevo");
  const brevo = page.getByRole("button", { name: /Send Email - Brevo/ }).first();
  await expect(brevo).toBeEnabled();
  await brevo.click();

  await expect(page.getByText("Brevo", { exact: true })).toBeVisible();
  await expect(page.getByText("Recipient email *", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resource", exact: true }).first()).toBeVisible();

  // Content can be selected as metadata template or authored without code.
  const contentSource = page.getByText("Content source", { exact: true }).locator("..").getByRole("combobox");
  await expect(contentSource).toHaveValue("TEMPLATE");
  await contentSource.selectOption("CUSTOM");
  await expect(page.getByText("Subject *", { exact: true })).toBeVisible();
  await expect(page.getByText("Message body *", { exact: true })).toBeVisible();

  // Cancel the newly inserted element and repeat the same no-code path for Mailjet.
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await page.getByRole("button", { name: "Add element after Start", exact: true }).click();
  await palette.getByLabel("Search flow elements").fill("Action");
  await palette.getByRole("button", { name: "Action", exact: true }).click();
  await page.getByLabel("Search actions").fill("Send Email - Mailjet");
  const mailjet = page.getByRole("button", { name: /Send Email - Mailjet/ }).first();
  await expect(mailjet).toBeEnabled();
  await mailjet.click();
  await expect(page.getByText("Mailjet", { exact: true })).toBeVisible();
  await expect(page.getByText("Recipient email *", { exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});
