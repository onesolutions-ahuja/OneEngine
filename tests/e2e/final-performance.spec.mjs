import { test, expect } from "@playwright/test";

const ROUTES = [
  "dashboard",
  "products",
  "customers",
  "suppliers",
  "purchases",
  "reports",
  "settings",
  "developer/objects",
  "developer/workflow-builder",
  "till",
];

function serverTotalMs(header = "") {
  const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(String(header));
  return match ? Number(match[1]) : Number.NaN;
}

test("final live login and page-loading performance gate", async ({ page }) => {
  const username = process.env.ONEPOS_E2E_USERNAME || "";
  const password = process.env.ONEPOS_E2E_PASSWORD || "";
  test.skip(!(username && password), "Authenticated E2E credentials are required.");

  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Email or username").fill(username);
  await page.getByPlaceholder("Password").fill(password);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/login") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /^Sign In$/ }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok(), `login HTTP ${loginResponse.status()}`).toBe(true);

  const timing = loginResponse.headers()["server-timing"] || "";
  const totalMs = serverTotalMs(timing);
  expect(Number.isFinite(totalMs), `missing total Server-Timing: ${timing}`).toBe(true);
  expect(totalMs, `server login time ${totalMs}ms exceeded 1500ms`).toBeLessThanOrEqual(1500);

  await expect(page.getByPlaceholder("Email or username")).toBeHidden({ timeout: 10_000 });

  for (const route of ROUTES) {
    const started = Date.now();
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|Failed to fetch|Application error|Something went wrong/i,
      { timeout: 8_000 },
    );
    const elapsed = Date.now() - started;
    expect(elapsed, `${route} navigation took ${elapsed}ms`).toBeLessThanOrEqual(8_000);
  }

  expect(failures, failures.join("\n")).toEqual([]);
});
