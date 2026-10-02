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
  "settings/security-identity",
  "settings/mfa-administration",
  "settings/identity-verification-history",
  "settings/security-governance",
  "settings/data-protection",
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
  await expect(newWorkflow).toBeVisible({ timeout: 30_000 });
  await newWorkflow.click();
  await expect(page.getByRole("dialog", { name: "New Flow" })).toBeVisible();
  await page.getByRole("button", { name: "Autolaunched Flow (No Trigger)", exact: true }).click();

  await expect(page.getByText("Elements", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add element after Start", exact: true }).click();
  const palette = page.locator(".workflow-node-palette");
  const paletteSearch = palette.getByLabel("Search flow elements");
  if (await paletteSearch.isVisible().catch(() => false)) await paletteSearch.fill("Create Record");
  const createRecord = palette.getByRole("button", { name: /Create Record/ }).first();
  await expect(createRecord).toBeVisible();
  await createRecord.click();

  const cards = page.locator(".workflow-node-card");
  await expect(cards).toHaveCount(1);
  await cards.first().click();

  const remove = page.locator(".workflow-node-delete").first();
  await expect(remove).toBeVisible();
  await remove.click();

  await expect(page.locator(".workflow-node-card")).toHaveCount(0);
  await expect(page.getByText("Select Start or a flow element to configure it.")).toBeVisible();
  expect(failures, failures.join("\n")).toEqual([]);
});


test("approval builder exposes enterprise assignment, deadlines and safe debug", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/approval-builder");
  const newApproval=page.getByRole("button",{name:/new approval/i});
  await expect(newApproval).toBeVisible({ timeout: 30_000 });
  await newApproval.click();
  await expect(page.getByRole("option",{name:"Submitter’s manager"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"Any one approver can decide"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"Everyone must approve"})).toHaveCount(1);
  await expect(page.getByPlaceholder("Due in hours")).toBeVisible();
  await expect(page.getByText("Test Approval",{exact:true})).toBeVisible();
  await expect(page.getByText(/No records are changed/i)).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});

test("approval work items expose hierarchy, queues and delegation without unsafe decisions", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/work-items");
  await expect(page.getByText("Approval Administration",{exact:true})).toBeVisible();
  await expect(page.getByText("Queues / Groups",{exact:true})).toBeVisible();
  await expect(page.getByText("Manager hierarchy",{exact:true})).toBeVisible();
  await expect(page.getByText("My delegate",{exact:true})).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});


test("approval record submission separates manual and automatic paths", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/approval-builder");
  const newApproval=page.getByRole("button",{name:/new approval/i});
  await expect(newApproval).toBeVisible({ timeout: 30_000 });
  await newApproval.click();
  await expect(page.getByRole("option",{name:"User submits from record"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"Automatically when criteria match"})).toHaveCount(1);
  expect(failures,failures.join("\n")).toEqual([]);
});

test("approval work items show deadline reminder and escalation audit fields when a work item is available", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/work-items");

  // The shared CI tenant can legitimately have no pending approval records.
  // In that state the detail pane is intentionally not rendered, so validate
  // the empty state instead of treating missing record-only fields as a UI bug.
  const emptyState = page.getByText("No approvals found",{exact:true});
  const timing = page.getByText("Timing",{exact:true});
  await expect(emptyState.or(timing)).toBeVisible({ timeout: 15_000 });
  if (await emptyState.isVisible().catch(() => false)) {
    await expect(page.getByText("Approval Administration",{exact:true})).toBeVisible();
    await expect(page.getByText("Queues / Groups",{exact:true})).toBeVisible();
    expect(failures,failures.join("\n")).toEqual([]);
    return;
  }

  await expect(timing).toBeVisible();
  await expect(page.getByText("Reminder",{exact:true})).toBeVisible();
  await expect(page.getByText("Escalated",{exact:true})).toBeVisible();
  await expect(page.getByText("Approval History",{exact:true})).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});


test("approval UX is record first and uses human language", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/approval-builder");
  const create=page.getByRole("button",{name:"New Approval Flow",exact:true});
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.click();
  await expect(page.getByText("Why is approval required?",{exact:true})).toBeVisible();
  await expect(page.getByText("Review before activation",{exact:true})).toBeVisible();
  await expect(page.getByRole("option",{name:"Any one approver can decide"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"Everyone must approve"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"Choose a record…"})).toHaveCount(1);
  expect(failures,failures.join("\n")).toEqual([]);
});

test("approval inbox uses business language and dated delegation", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/work-items");
  await expect(page.getByText("Approvals",{exact:true})).toBeVisible();
  await expect(page.getByText("My delegate",{exact:true})).toBeVisible();
  await expect(page.getByText("From",{exact:true})).toBeVisible();
  await expect(page.getByText("Until",{exact:true})).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});


test("security settings expose phase-one Salesforce parity controls", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("settings/security-identity");
  await expect(page.getByRole("tab",{name:"Password Policies"})).toBeVisible({timeout:30_000});
  await expect(page.getByRole("tab",{name:"Session Settings"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Login Access Policies"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Network Access"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Login History"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Active Sessions"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"MFA & Assurance"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Authentication Providers"})).toBeVisible();
  await page.getByRole("tab",{name:"Session Settings"}).click();
  await expect(page.getByText("Enforce login IP ranges on every request",{exact:true})).toBeVisible();
  await expect(page.getByText("Lock sessions to originating IP",{exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"MFA & Assurance"}).click();
  await expect(page.getByText("Require MFA",{exact:true})).toBeVisible();
  await expect(page.getByText("Require phishing-resistant MFA",{exact:true})).toBeVisible();
  await expect(page.getByText("Sensitive Operation Policies",{exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"Authentication Providers"}).click();
  await expect(page.getByText("Authentication Providers",{exact:true})).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});


test("phase-two identity assurance controls are available", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("settings/security-identity");
  await expect(page.getByRole("tab",{name:"MFA & Assurance"})).toBeVisible({timeout:30_000});
  await expect(page.getByRole("tab",{name:"Authentication Providers"})).toBeVisible();
  await expect(page.getByRole("tab",{name:"Verification History"})).toBeVisible();
  await page.getByRole("tab",{name:"MFA & Assurance"}).click();
  await expect(page.getByText("Require phishing-resistant MFA",{exact:true})).toBeVisible();
  await expect(page.getByText("Reports and dashboards",{exact:true})).toBeVisible();
  await expect(page.getByText("Manage authentication providers",{exact:true})).toBeVisible();
  await expect(page.getByText("Unlock users and reset passwords",{exact:true})).toBeVisible();
  await expect(page.getByText("Manage login access policies",{exact:true})).toBeVisible();
  await expect(page.getByText("Manage password policies",{exact:true})).toBeVisible();
  await expect(page.getByText("Manage permission sets and profiles",{exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"Authentication Providers"}).click();
  await expect(page.getByText("Discovery URL",{exact:true})).toBeVisible();
  await expect(page.getByText("Issuer",{exact:true})).toBeVisible();
  await expect(page.getByText("JWKS URI",{exact:true})).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});


test("phase-three security governance controls are available", async ({ page }) => {
  const failures = watchRuntimeFailures(page)
  await page.goto("settings/security-governance")
  await expect(page.getByRole("button",{name:"Security Health"})).toBeVisible({timeout:30_000})
  await expect(page.getByRole("button",{name:"API & OAuth"})).toBeVisible()
  await expect(page.getByRole("button",{name:"Connected Apps"})).toBeVisible()
  await expect(page.getByRole("button",{name:"Trusted Origins"})).toBeVisible()
  await expect(page.getByRole("button",{name:"Credential Vault"})).toBeVisible()
  await expect(page.getByRole("button",{name:"Certificates & Keys"})).toBeVisible()
  await page.getByRole("button",{name:"API & OAuth"}).click()
  await expect(page.getByText("Connected-app enforcement",{exact:true})).toBeVisible()
  await page.getByRole("button",{name:"Connected Apps"}).click()
  await expect(page.getByText("Connected Apps",{exact:true})).toBeVisible()
  expect(failures,failures.join("\n")).toEqual([])
})


test("phase-four data protection controls are available", async ({ page }) => {
  const failures = watchRuntimeFailures(page)
  await page.goto("settings/data-protection")
  await expect(page.getByRole("button",{name:"Data Export"})).toBeVisible({timeout:30_000})
  await expect(page.getByRole("button",{name:"Data Retention"})).toBeVisible()
  await expect(page.getByRole("button",{name:"Email Security"})).toBeVisible()
  await expect(page.getByRole("button",{name:"Delegated Administration"})).toBeVisible()
  await page.getByRole("button",{name:"Email Security"}).click()
  await expect(page.getByText("Email Deliverability",{exact:true})).toBeVisible()
  await expect(page.getByText("Sending Domains / DKIM",{exact:true})).toBeVisible()
  await page.getByRole("button",{name:"Delegated Administration"}).click()
  await expect(page.getByText("Delegated Administration Groups",{exact:true})).toBeVisible()
  expect(failures,failures.join("\n")).toEqual([])
})
