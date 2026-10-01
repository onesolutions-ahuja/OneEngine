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


test("approval builder exposes enterprise assignment, deadlines and safe debug", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/approval-builder");
  const newApproval=page.getByRole("button",{name:/new approval/i});
  if(await newApproval.isVisible().catch(()=>false)) await newApproval.click();
  await expect(page.getByRole("option",{name:"Submitter’s manager"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"First response decides"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"All approvers must approve"})).toHaveCount(1);
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
  if(await newApproval.isVisible().catch(()=>false)) await newApproval.click();
  await expect(page.getByRole("option",{name:"User submits from record"})).toHaveCount(1);
  await expect(page.getByRole("option",{name:"Automatically when criteria match"})).toHaveCount(1);
  expect(failures,failures.join("\n")).toEqual([]);
});

test("approval work items show deadline reminder and escalation audit fields", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/work-items");
  await expect(page.getByText("Timing",{exact:true})).toBeVisible();
  await expect(page.getByText("Reminder",{exact:true})).toBeVisible();
  await expect(page.getByText("Escalated",{exact:true})).toBeVisible();
  await expect(page.getByText("Approval History",{exact:true})).toBeVisible();
  expect(failures,failures.join("\n")).toEqual([]);
});


test("approval UX is record first and uses human language", async ({ page }) => {
  const failures=watchRuntimeFailures(page);
  await page.goto("developer/approval-builder");
  const create=page.getByRole("button",{name:/new process/i}); if(await create.isVisible().catch(()=>false)) await create.click();
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
