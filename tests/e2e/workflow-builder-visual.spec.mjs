import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const API_BASE = "https://oneengine.onrender.com";

async function proxyApiForLocalPreview(page) {
  await page.route(`${API_BASE}/**`, async (route) => {
    const request = route.request();
    try {
      const forwardedHeaders = {
        ...request.headers(),
        origin: "https://onesolutions-ahuja.github.io",
        referer: "https://onesolutions-ahuja.github.io/OneEngine/",
      };
      const response = await route.fetch({ headers: forwardedHeaders });
      const headers = { ...response.headers() };
      headers["access-control-allow-origin"] = "http://127.0.0.1:4173";
      headers["access-control-allow-credentials"] = "true";
      headers["access-control-allow-headers"] = request.headers()["access-control-request-headers"] || "*";
      headers["access-control-allow-methods"] = request.headers()["access-control-request-method"] || "GET,POST,PUT,PATCH,DELETE,OPTIONS";
      await route.fulfill({ response, headers });
    } catch (error) {
      await route.abort();
      throw error;
    }
  });
}

test("merged Workflow Builder keeps the list, chooser, and three-pane Builder2 geometry intact", async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Authenticated QA credentials required.");

  await proxyApiForLocalPreview(page);
  await loginIfConfigured(page);
  await page.evaluate(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("onepos_user") || "{}");
      const companyId = String(user.companyId || user.company_id || "");
      if (companyId) sessionStorage.setItem("onepos_developer_target_company_id", companyId);
    } catch {}
  });

  await page.goto("developer/workflow-builder");
  await expect(page.locator(".onebuilder-list-view")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /new flow/i }).first().click();

  const dialog = page.getByRole("dialog", { name: "New Flow" });
  await expect(dialog.getByText("Select a Flow Type", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Record-Triggered Flow", exact: false }).click();

  const objectSearch = dialog.getByRole("combobox", { name: "Search objects" });
  await expect(objectSearch).toBeVisible();
  await expect(objectSearch).toBeInViewport();
  await objectSearch.click();
  const firstObject = dialog.locator(".onebuilder-new-flow-object-results [role='option']").first();
  await expect(firstObject).toBeVisible();
  await firstObject.click();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  const shell = page.locator(".b2-shell");
  await expect(shell).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".b2-top")).toContainText("Workflow Builder");

  const startPanel = page.locator(".b2-start-panel");
  if (await startPanel.isVisible().catch(() => false)) {
    await startPanel.locator("header button").click();
  }

  await page.locator(".b2-palette-group").getByRole("button", { name: /Decision/ }).first().click();
  await page.locator(".b2-palette-group").getByRole("button", { name: /Assignment/ }).first().click();

  const [toolboxBox, canvasBox, propertiesBox, topBox] = await Promise.all([
    page.locator(".b2-toolbox").boundingBox(),
    page.locator(".b2-canvas").boundingBox(),
    page.locator(".b2-properties").boundingBox(),
    page.locator(".b2-top").boundingBox(),
  ]);

  for (const [name, box] of Object.entries({ toolboxBox, canvasBox, propertiesBox, topBox })) {
    expect(box, `${name} must have layout geometry`).not.toBeNull();
  }

  expect(toolboxBox.x).toBeLessThan(canvasBox.x);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(propertiesBox.x + 2);
  expect(topBox.height).toBeGreaterThanOrEqual(48);
  await expect(page.locator(".b2-node")).toHaveCount(2);

  await page.screenshot({
    path: "test-results/workflow-builder-visual/merged-workflow-builder.png",
    fullPage: true,
  });
});
