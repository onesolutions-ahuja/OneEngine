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

test("decision collapse keeps branch summaries visible and expand restores the child nodes", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await createFlowOfType(page, "Autolaunched Flow (No Trigger)");

  const decisionPalette = page.locator(".b2-palette-group").getByRole("button", { name: /Decision/ }).first();
  await decisionPalette.click();
  const properties = page.locator(".b2-properties");
  await expect(properties).toContainText("Decision");

  await properties.getByRole("button", { name: /Add Element to Path/i }).first().click();
  const selector = page.locator(".b2-selector");
  await expect(selector).toBeVisible();
  await selector.locator(".b2-selector-search input").fill("Assignment");
  await selector.getByRole("button", { name: /Assignment/ }).first().click();

  const decisionNode = page.locator(".b2-node").filter({ hasText: "Decision" }).first();
  const decisionWrap = decisionNode.locator("..");
  await expect(decisionWrap.getByRole("button", { name: "Collapse Paths", exact: true })).toBeVisible();
  await expect(page.locator(".b2-node").filter({ hasText: "Assignment" })).toHaveCount(1);

  await decisionWrap.getByRole("button", { name: "Collapse Paths", exact: true }).click();
  const collapsed = decisionWrap.locator(".b2-collapsed-paths");
  await expect(collapsed).toBeVisible();
  await expect(collapsed).toContainText("Outcome 1");
  await expect(collapsed).toContainText("1 step");
  await expect(page.locator(".b2-node").filter({ hasText: "Assignment" })).toHaveCount(0);

  await decisionWrap.getByRole("button", { name: "Expand Paths", exact: true }).click();
  await expect(collapsed).toHaveCount(0);
  await expect(page.locator(".b2-node").filter({ hasText: "Assignment" })).toHaveCount(1);

  expect(failures, failures.join("\n")).toEqual([]);
});

test("properties panel uses the reviewed geometry and really scrolls with long nested configuration", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await createFlowOfType(page, "Autolaunched Flow (No Trigger)");

  await page.locator(".b2-palette-group").getByRole("button", { name: /Decision/ }).first().click();
  const properties = page.locator(".b2-properties");
  const form = properties.locator(".b2-form");

  for (let i = 0; i < 4; i += 1) {
    await properties.getByRole("button", { name: "New Outcome", exact: true }).click();
  }

  const geometry = await page.evaluate(() => {
    const toolbox = document.querySelector(".b2-toolbox");
    const props = document.querySelector(".b2-properties");
    const form = props?.querySelector(".b2-form");
    const firstInput = form?.querySelector("input:not([type='checkbox']):not([type='radio'])");
    const firstLabel = form?.querySelector("label");
    if (!toolbox || !props || !form || !firstInput || !firstLabel) return null;
    const inputStyle = getComputedStyle(firstInput);
    const labelStyle = getComputedStyle(firstLabel);
    const formStyle = getComputedStyle(form);
    return {
      toolboxWidth: toolbox.getBoundingClientRect().width,
      propertiesWidth: props.getBoundingClientRect().width,
      inputHeight: firstInput.getBoundingClientRect().height,
      labelFontSize: labelStyle.fontSize,
      overflowY: formStyle.overflowY,
      clientHeight: form.clientHeight,
      scrollHeight: form.scrollHeight,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry.toolboxWidth).toBeGreaterThanOrEqual(250);
  expect(geometry.propertiesWidth).toBeGreaterThanOrEqual(380);
  expect(geometry.inputHeight).toBeGreaterThanOrEqual(37);
  expect(geometry.labelFontSize).toBe("12px");
  expect(["auto", "scroll"]).toContain(geometry.overflowY);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);

  const scrollTop = await form.evaluate((el) => {
    el.scrollTop = Math.min(240, el.scrollHeight - el.clientHeight);
    return el.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);

  expect(failures, failures.join("\n")).toEqual([]);
});

test("screen switches and subflow configuration stay functional after the UI-only styling pass", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await createFlowOfType(page, "Autolaunched Flow (No Trigger)");

  const palette = page.locator(".b2-palette-group");
  await palette.getByRole("button", { name: /^Screen\b/ }).first().click();
  await expect(page.locator(".b2-screen-editor")).toBeVisible();

  await page.locator(".b2-screen-palette").getByRole("button", { name: /^Text\b/ }).first().click();
  const required = page.locator(".b2-screen-properties").getByRole("checkbox", { name: "Required" });
  await expect(required).not.toBeChecked();
  await required.check();
  await expect(required).toBeChecked();
  await page.locator(".b2-screen-top").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".b2-screen-editor")).toHaveCount(0);

  await page.locator(".b2-node").filter({ hasText: "Screen" }).first().click();
  await expect(page.locator(".b2-screen-editor")).toBeVisible();
  await page.locator(".b2-screen-canvas .b2-screen-component").first().click();
  await expect(page.locator(".b2-screen-properties").getByRole("checkbox", { name: "Required" })).toBeChecked();
  await page.locator(".b2-screen-top").getByRole("button", { name: "Done", exact: true }).click();

  await palette.getByRole("button", { name: /Subflow/ }).first().click();
  const props = page.locator(".b2-properties");
  const flowName = props.getByLabel("Flow API Name");
  const inputs = props.getByLabel("Input Values");
  const outputs = props.getByLabel("Output Values");
  await flowName.fill("Child_Flow");
  await inputs.fill('{"customerId":"variables.customerId"}');
  await outputs.fill('{"result":"variables.result"}');

  await palette.getByRole("button", { name: /Assignment/ }).first().click();
  await page.locator(".b2-node").filter({ hasText: "Subflow" }).first().click();
  await expect(props.getByLabel("Flow API Name")).toHaveValue("Child_Flow");
  await expect(props.getByLabel("Input Values")).toHaveValue('{"customerId":"variables.customerId"}');
  await expect(props.getByLabel("Output Values")).toHaveValue('{"result":"variables.result"}');

  expect(failures, failures.join("\n")).toEqual([]);
});

test("shared decision continuations stay near the parent instead of stretching the canvas", async ({ page }) => {
  const failures = watchRuntimeFailures(page);
  await page.goto("developer/workflow-builder");
  await createFlowOfType(page, "Autolaunched Flow (No Trigger)");

  const palette = page.locator(".b2-palette-group");
  await palette.getByRole("button", { name: /Decision/ }).first().click();
  await palette.getByRole("button", { name: /Assignment/ }).first().click();

  const decisionNode = page.locator(".b2-node").filter({ hasText: "Decision" }).first();
  await decisionNode.click();

  const properties = page.locator(".b2-properties");
  const branchSelects = properties.locator(".b2-branch-steps select");
  await expect(branchSelects).toHaveCount(2);
  await branchSelects.nth(0).selectOption({ label: "Assignment" });
  await branchSelects.nth(1).selectOption({ label: "Assignment" });

  const shared = page.locator(".b2-shared-continuation");
  await expect(shared).toBeVisible();
  await expect(shared).toContainText("Shared continuation");
  await expect(shared.locator(".b2-node").filter({ hasText: "Assignment" })).toHaveCount(1);

  const geometry = await page.evaluate(() => {
    const decision = [...document.querySelectorAll(".b2-node")].find((node) => node.textContent?.includes("Decision"));
    const paths = document.querySelector(".b2-decision-paths");
    const shared = document.querySelector(".b2-shared-continuation");
    if (!decision || !paths || !shared) return null;
    const d = decision.getBoundingClientRect();
    const p = paths.getBoundingClientRect();
    const s = shared.getBoundingClientRect();
    return {
      decisionCenter: d.left + d.width / 2,
      pathCenter: p.left + p.width / 2,
      sharedCenter: s.left + s.width / 2,
      pathWidth: p.width,
    };
  });

  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.pathCenter - geometry.decisionCenter)).toBeLessThan(80);
  expect(Math.abs(geometry.sharedCenter - geometry.decisionCenter)).toBeLessThan(80);
  expect(geometry.pathWidth).toBeLessThan(900);

  expect(failures, failures.join("\n")).toEqual([]);
});

