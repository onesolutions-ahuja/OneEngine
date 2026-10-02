import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const API_BASE = "https://oneengine.onrender.com";

async function proxyApiForLocalPreview(page) {
  await page.route(`${API_BASE}/**`, async (route) => {
    const request = route.request();
    try {
      const response = await route.fetch();
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

function centerX(box) {
  return box.x + box.width / 2;
}

test("Welcome Message Customer canvas matches compact split-merge geometry", async ({ page }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Authenticated QA credentials required.");

  await proxyApiForLocalPreview(page);
  await loginIfConfigured(page);

  await page.goto("developer/workflow-builder");
  await expect(page.getByRole("button", { name: /new workflow/i })).toBeVisible({ timeout: 20_000 });

  const workflowSearch = page.getByPlaceholder(/Search workflows/i);
  await workflowSearch.fill("Welcome Message Customer");
  const savedRow = page.locator(".onebuilder-list-row").filter({ hasText: "Welcome Message Customer" }).first();
  await expect(savedRow).toBeVisible({ timeout: 15_000 });
  await savedRow.click();

  const canvas = page.locator(".workflow-canvas-surface");
  await expect(canvas).toBeVisible();

  const start = page.locator(".workflow-start-node");
  const decisions = page.locator('.workflow-node-card[data-node-type="CONDITION"]');
  await expect(start).toBeVisible();
  await expect(decisions).toHaveCount(2);

  const emailDecision = decisions.filter({ hasText: "Email available?" }).first();
  const phoneDecision = decisions.filter({ hasText: "Phone number available?" }).first();
  await expect(emailDecision).toBeVisible();
  await expect(phoneDecision).toBeVisible();

  const yesLabels = page.locator('.workflow-branch-label-input').filter({ hasValue: "Yes" });
  const skipLabels = page.locator('.workflow-branch-label-input').filter({ hasValue: /No \/ Skip/i });
  await expect(yesLabels).toHaveCount(2);
  await expect(skipLabels).toHaveCount(2);

  const emailAction = page.locator(".workflow-branch-node-card").filter({ hasText: "Send welcome email" }).first();
  const smsAction = page.locator(".workflow-branch-node-card").filter({ hasText: "Send welcome SMS" }).first();
  await expect(emailAction).toBeVisible();
  await expect(smsAction).toBeVisible();

  const [startBox, emailBox, phoneBox, emailActionBox, smsActionBox, canvasBox] = await Promise.all([
    start.boundingBox(),
    emailDecision.boundingBox(),
    phoneDecision.boundingBox(),
    emailAction.boundingBox(),
    smsAction.boundingBox(),
    canvas.boundingBox(),
  ]);

  for (const [name, box] of Object.entries({ startBox, emailBox, phoneBox, emailActionBox, smsActionBox, canvasBox })) {
    expect(box, `${name} must have layout geometry`).not.toBeNull();
  }

  // Main lane stays visually centered.
  expect(Math.abs(centerX(startBox) - centerX(emailBox))).toBeLessThanOrEqual(6);
  expect(Math.abs(centerX(emailBox) - centerX(phoneBox))).toBeLessThanOrEqual(6);

  // Cards remain compact rather than expanding into large panels.
  expect(emailBox.width).toBeGreaterThanOrEqual(238);
  expect(emailBox.width).toBeLessThanOrEqual(258);
  expect(emailBox.height).toBeGreaterThanOrEqual(44);
  expect(emailBox.height).toBeLessThanOrEqual(62);

  // First decision resolves its branch before the next main-lane decision.
  expect(emailActionBox.y).toBeGreaterThan(emailBox.y + emailBox.height);
  expect(phoneBox.y).toBeGreaterThan(emailActionBox.y + emailActionBox.height);

  // Second decision action stays below the second decision.
  expect(smsActionBox.y).toBeGreaterThan(phoneBox.y + phoneBox.height);

  // No branch action is allowed to drift off the visible canvas.
  for (const box of [emailActionBox, smsActionBox]) {
    expect(box.x).toBeGreaterThanOrEqual(canvasBox.x - 2);
    expect(box.x + box.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 2);
  }

  // Outcome branches must sit on opposite sides of the owning decision.
  const emailStage = emailDecision.locator("xpath=ancestor::div[contains(@class,'workflow-node-wrap')][1]");
  const emailPaths = emailStage.locator(".workflow-decision-map > .workflow-branch-path");
  await expect(emailPaths).toHaveCount(2);
  const firstPathBox = await emailPaths.nth(0).boundingBox();
  const secondPathBox = await emailPaths.nth(1).boundingBox();
  expect(centerX(firstPathBox)).toBeLessThan(centerX(emailBox));
  expect(centerX(secondPathBox)).toBeGreaterThan(centerX(emailBox));

  // Connector and type styling is intentional and consistent.
  const styleSnapshot = await emailDecision.evaluate((node) => {
    const card = getComputedStyle(node);
    const title = getComputedStyle(node.querySelector(".workflow-node-title"));
    const kind = getComputedStyle(node.querySelector(".workflow-node-kind"));
    return {
      radius: card.borderRadius,
      borderColor: card.borderColor,
      titleSize: title.fontSize,
      titleWeight: title.fontWeight,
      kindSize: kind.fontSize,
    };
  });
  expect(parseFloat(styleSnapshot.radius)).toBeLessThanOrEqual(7);
  expect(parseFloat(styleSnapshot.titleSize)).toBeLessThanOrEqual(11);
  expect(parseFloat(styleSnapshot.kindSize)).toBeLessThanOrEqual(8);

  const rails = page.locator(".workflow-decision-rail");
  await expect(rails).toHaveCount(4);
  const railColor = await rails.first().evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(railColor).toMatch(/rgb\((174, 183, 195|173, 183, 195)\)/);

  await page.screenshot({
    path: "test-results/workflow-builder-visual/welcome-message-customer.png",
    fullPage: true,
  });
});
