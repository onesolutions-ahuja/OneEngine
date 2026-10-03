import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

async function firstObjectValue(dialog) {
  const search = dialog.getByRole("combobox", { name: "Search objects" });
  await expect(search).toBeVisible();
  await expect(search).toBeInViewport();
  await search.click();
  const option = dialog.locator(".onebuilder-new-flow-object-results [role='option']").first();
  await expect(option).toBeVisible();
  const value = await option.getAttribute("data-object-key");
  expect(value).toBeTruthy();
  await option.click();
  return value;
}

async function createFlowOfType(page, typeLabel, { requireObject = false } = {}) {
  const newFlow = page.getByRole("button", { name: /new flow/i }).first();
  await expect(newFlow).toBeVisible({ timeout: 20_000 });
  await newFlow.click();

  const dialog = page.getByRole("dialog", { name: "New Flow" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Select a Flow Type", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: typeLabel, exact: false }).click();

  const create = dialog.getByRole("button", { name: "Create", exact: true });
  let objectKey = "";
  if (requireObject) {
    await expect(create).toBeDisabled();
    objectKey = await firstObjectValue(dialog);
    await expect(create).toBeEnabled();
  }

  await create.click();
  await expect(page.locator(".b2-shell")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".b2-top")).toContainText("Workflow Builder");
  return objectKey;
}

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

test("merged Workflow Builder restores list -> type chooser -> Builder2 and requires a record object", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");

  await expect(page.locator(".onebuilder-list-view")).toBeVisible({ timeout: 20_000 });
  const objectKey = await createFlowOfType(page, "Record-Triggered Flow", { requireObject: true });

  const startPanel = page.locator(".b2-start-panel");
  await expect(startPanel).toBeVisible();
  await expect(startPanel.getByRole("combobox", { name: "Search objects" })).toHaveAttribute("data-object-key", objectKey);

  await expect(page.getByRole("button", { name: "Elements", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manager", exact: true })).toBeVisible();
  await expect(page.locator(".b2-palette-group").getByRole("button", { name: /Get Records/ }).first()).toBeVisible();
  await expect(page.locator(".b2-palette-group").getByRole("button", { name: /Decision/ }).first()).toBeVisible();

  await page.getByTitle("Flow Properties").click();
  const properties = page.locator(".b2-modal").filter({ hasText: "Flow Properties" });
  await expect(properties).toBeVisible();
  await expect(properties.locator("label").filter({ hasText: "Flow Type" }).locator("input")).toBeDisabled();
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Back to flows", exact: true }).click();
  await expect(page.locator(".onebuilder-list-view")).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});

test("merged Builder2 keeps core element and resource authoring surfaces functional", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await createFlowOfType(page, "Autolaunched Flow (No Trigger)");

  const search = page.locator(".b2-search input");
  await search.fill("Assignment");
  const assignment = page.locator(".b2-palette-group").getByRole("button", { name: /Assignment/ }).first();
  await expect(assignment).toBeVisible();
  await assignment.click();
  await expect(page.locator(".b2-properties")).toContainText("Assignment");

  await page.getByRole("button", { name: "Manager", exact: true }).click();
  await page.getByRole("button", { name: /New Resource/i }).click();
  const resourceDialog = page.locator(".b2-modal").filter({ hasText: "New Resource" });
  await expect(resourceDialog).toBeVisible();
  await expect(resourceDialog.getByText("Resource Type", { exact: true })).toBeVisible();
  await resourceDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByRole("button", { name: "Save", exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate", exact: true })).toBeVisible();

  expect(failures, failures.join("\n")).toEqual([]);
});


test("persisted appointment workflow renders without OEFR101", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder/1d5e7954-ce74-4637-a2b8-04780fab168c");
  await expect(page.locator(".b2-shell")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/OEFR101/)).toHaveCount(0);
  expect(failures, failures.join("\n")).toEqual([]);
});
