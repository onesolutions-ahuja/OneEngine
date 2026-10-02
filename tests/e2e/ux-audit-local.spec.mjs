import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

async function ownCompany(page) {
  return page.evaluate(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("onepos_user") || "{}");
      return String(user.companyId || user.company_id || "");
    } catch { return ""; }
  });
}

async function forceOwnDeveloperCompany(page) {
  const companyId = await ownCompany(page);
  if (!companyId) return;
  await page.evaluate((id) => sessionStorage.setItem("onepos_developer_target_company_id", id), companyId);
}

async function openObject(page, labelOrKey) {
  await page.goto("developer/objects");
  await forceOwnDeveloperCompany(page);
  await page.reload();
  const search = page.getByPlaceholder("Search objects");
  await expect(search).toBeVisible({ timeout: 20_000 });
  await search.fill(labelOrKey);
  const item = page.locator(".objects-list-item").first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
}

test.beforeEach(async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Local UX audit requires configured QA credentials.");
  await loginIfConfigured(page);
  await forceOwnDeveloperCompany(page);
});

test("T1 custom object -> field -> runtime record", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/objects");
  await expect(page.getByRole("button", { name: /New Object/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /New Object/i }).click();

  const dialog = page.locator("form.objects-object-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Label").fill("UX Audit Case");
  await dialog.getByLabel("Plural Label").fill("UX Audit Cases");
  await dialog.getByLabel("Object Key").fill("ux_audit_case");
  await dialog.getByLabel("API Name").fill("ux_audit_case");
  // A Salesforce-style custom object should not require an administrator to know
  // or create a physical SQL table. Leave Source Table empty deliberately.
  await dialog.getByLabel("Description").fill("Disposable black-box UX audit object");
  await dialog.getByRole("button", { name: "Create Object", exact: true }).click();

  await expect(page.getByText("UX Audit Case", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Fields", exact: true }).click();
  await page.getByRole("button", { name: "Field", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New Field", exact: true })).toBeVisible();
  await page.getByLabel("Field Label").fill("Reference");
  await page.getByRole("button", { name: "Save Field", exact: true }).click();
  await expect(page.getByText("Reference", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /View Records/i }).click();
  await expect(page).toHaveURL(/workspace\/ux_audit_case/, { timeout: 15_000 });
  await expect(page.getByText("UX Audit Case", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  const newRecord = page.getByRole("button", { name: /New UX Audit Case|New/i }).first();
  await expect(newRecord).toBeVisible({ timeout: 10_000 });
  await newRecord.click();
  const editor = page.locator("form.workspace-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Reference").fill("TEST-001");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("TEST-001", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T2 record-triggered flow can be authored, activated and debugged", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await expect(page.getByRole("button", { name: /New Workflow/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /New Workflow/i }).click();
  const workspace = page.getByLabel("Workflow Builder workspace");
  await workspace.getByRole("button", { name: "View Properties", exact: true }).click();
  const props = page.getByRole("dialog", { name: "Flow Properties" });
  await props.getByPlaceholder("Flow Label").fill("UX Audit Record Trigger");
  await props.getByLabel("Flow Type").selectOption("RECORD_TRIGGERED");
  await props.getByRole("button", { name: "Done", exact: true }).click();

  await page.locator(".workflow-start-node").click();
  await page.getByLabel("Flow trigger").selectOption("after_update");
  // Use a standard object exposed by the picker. If the object selector is not
  // accessible by label, that itself is a UX blocker.
  const objectSelect = page.locator(".workflow-properties-panel select").filter({ has: page.locator("option") }).nth(1);
  if (await objectSelect.isVisible().catch(() => false)) {
    const options = await objectSelect.locator("option").allTextContents();
    const customerIndex = options.findIndex((x) => /customer/i.test(x));
    if (customerIndex >= 0) await objectSelect.selectOption({ index: customerIndex });
  }

  await page.getByRole("button", { name: "Add element after Start", exact: true }).click();
  const palette = page.locator(".workflow-node-palette");
  await palette.getByLabel("Search flow elements").fill("End");
  await palette.getByRole("button", { name: "End", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("UX Audit Record Trigger", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await workspace.getByRole("button", { name: "Debug", exact: true }).click();
  await expect(page.getByText("Debug / Test Flow", { exact: true })).toBeVisible();
  const run = page.getByRole("button", { name: "Run Debug", exact: true });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByText(/Debug (completed successfully|did not enter the workflow|found a problem)/)).toBeVisible({ timeout: 20_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T3 screen flow exposes real screen components, validation and navigation", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await page.getByRole("button", { name: /New Workflow/i }).click();
  const workspace = page.getByLabel("Workflow Builder workspace");
  await workspace.getByRole("button", { name: "View Properties", exact: true }).click();
  const props = page.getByRole("dialog", { name: "Flow Properties" });
  await props.getByPlaceholder("Flow Label").fill("UX Audit Screen Flow");
  await props.getByLabel("Flow Type").selectOption("SCREEN_FLOW");
  await props.getByRole("button", { name: "Done", exact: true }).click();

  await page.getByRole("button", { name: "Add element after Start", exact: true }).click();
  const palette = page.locator(".workflow-node-palette");
  await palette.getByLabel("Search flow elements").fill("Screen");
  await palette.getByRole("button", { name: "Screen", exact: true }).click();

  await expect(page.getByText(/Screen Label/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Next button label|Next/i).first()).toBeVisible();
  await expect(page.getByText(/Previous|Back/i).first()).toBeVisible();
  await expect(page.getByText(/Finish/i).first()).toBeVisible();
  await expect(page.getByText(/Conditional Visibility/i).first()).toBeVisible();
  await expect(page.getByText(/Validation/i).first()).toBeVisible();
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T4 approval process supports criteria, approvers and safe test", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/approval-builder");
  await page.getByRole("button", { name: /New Approval/i }).click();
  await expect(page.getByText("Approval path", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Submitter’s manager" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Specific user" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Queue / group" })).toHaveCount(1);
  await expect(page.getByText("On submission", { exact: true })).toBeVisible();
  await expect(page.getByText("On approval", { exact: true })).toBeVisible();
  await expect(page.getByText("On rejection", { exact: true })).toBeVisible();
  await expect(page.getByText("Test Approval", { exact: true })).toBeVisible();
  await expect(page.getByText(/No records are changed/i)).toBeVisible();
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T5 validation rule exposes permission-based bypass", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await openObject(page, "Customer");
  await page.getByRole("button", { name: "Validation Rules", exact: true }).click();
  await page.getByRole("button", { name: "Rule", exact: true }).click();
  await expect(page.getByText(/Validation/i).first()).toBeVisible();
  // Salesforce-style admin UX needs an explicit bypass mechanism tied to
  // permission/permission-set context, not a hidden code-only exception.
  await expect(page.getByText(/bypass/i).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/permission/i).first()).toBeVisible({ timeout: 8_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T6 permission set can configure object and field access", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await openObject(page, "Customer");
  await page.getByRole("button", { name: "More object configuration" }).click();
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByRole("button", { name: "Permission Sets", exact: true }).click();
  await expect(page.getByText("Object and Field Access", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder("Name").fill("UX Audit Restricted Access");
  await page.getByPlaceholder("API key").fill("ux_audit_restricted_access");
  const customerView = page.getByLabel(/Customer can_view/i).or(page.getByLabel(/Customer view/i)).first();
  if (await customerView.isVisible().catch(() => false)) await customerView.check();
  await page.getByRole("button", { name: "Save Permission Set", exact: true }).click();
  await expect(page.getByText("UX Audit Restricted Access", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T7 report builder saves and runs grouped report", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/report-builder");
  await expect(page.getByText("Create Report", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Report name").fill("UX Audit Sales Report");
  await page.getByLabel("Group by").selectOption("date");
  await page.getByRole("button", { name: "Save & Run", exact: true }).click();
  await expect(page.getByText("Report saved.", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Results", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T8 dashboard builder saves, previews and provides drill-through", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/dashboard-builder");
  const newDashboard = page.getByRole("button", { name: /New dashboard/i });
  if (await newDashboard.isVisible().catch(() => false)) await newDashboard.click();
  await expect(page.getByText("Dashboard Builder", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Dashboard name").fill("UX Audit Dashboard");
  const addKpi = page.locator('[data-testid="add-component-kpi"]');
  await expect(addKpi).toBeVisible();
  await addKpi.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText(/Live preview rendered by the shared dashboard runtime/i)).toBeVisible();
  // Require a discoverable drill/open-record action from a data component.
  await expect(page.getByRole("button", { name: /drill|view records|open report|view report/i }).first()).toBeVisible({ timeout: 8_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T9 duplicate management can define match + action and exposes merge/resolution UX", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await openObject(page, "Customer");
  await page.getByRole("button", { name: "More object configuration" }).click();
  await page.getByRole("button", { name: "Duplicate Management", exact: true }).click();
  await page.getByRole("button", { name: "New Matching Rule", exact: true }).click();
  await expect(page.getByText("New Matching Rule", { exact: true })).toBeVisible();
  await page.locator(".duplicate-editor").getByText("Name", { exact: true }).locator("..").getByRole("textbox").fill("UX Audit Customer Match");
  const fieldSelect = page.locator(".duplicate-match-field select").first();
  await expect(fieldSelect).toBeVisible();
  const fieldOptions = await fieldSelect.locator("option").all();
  if (fieldOptions.length > 1) await fieldSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save Matching Rule", exact: true }).click();
  await page.getByRole("button", { name: "New Duplicate Rule", exact: true }).click();
  await expect(page.getByText("New Duplicate Rule", { exact: true })).toBeVisible();
  await page.locator(".duplicate-editor").getByText("Name", { exact: true }).locator("..").getByRole("textbox").fill("UX Audit Block Duplicate");
  await page.locator(".duplicate-editor").getByText("Action", { exact: true }).locator("..").getByRole("combobox").selectOption("WARN");
  await page.getByRole("button", { name: "Save Duplicate Rule", exact: true }).click();
  // A complete duplicate-management UX must give the user a way to inspect
  // matches and merge or resolve them, not only define detection rules.
  await expect(page.getByText(/merge|potential duplicates|duplicate record sets|resolve/i).first()).toBeVisible({ timeout: 8_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T10 workflow debug exposes run-as-user context", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await page.getByRole("button", { name: /New Workflow/i }).click();
  const workspace = page.getByLabel("Workflow Builder workspace");
  await workspace.getByRole("button", { name: "View Properties", exact: true }).click();
  const props = page.getByRole("dialog", { name: "Flow Properties" });
  await props.getByPlaceholder("Flow Label").fill("UX Audit Debug User");
  await props.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Add element after Start", exact: true }).click();
  const palette = page.locator(".workflow-node-palette");
  await palette.getByLabel("Search flow elements").fill("End");
  await palette.getByRole("button", { name: "End", exact: true }).click();
  await workspace.getByRole("button", { name: "Debug", exact: true }).click();
  await expect(page.getByText("Debug / Test Flow", { exact: true })).toBeVisible();
  await expect(page.getByText(/run as user|debug as user|user context/i).first()).toBeVisible({ timeout: 8_000 });
  expect(failures, failures.join("\n")).toEqual([]);
});
