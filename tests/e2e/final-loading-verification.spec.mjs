import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const ROUTES = [
  "dashboard",
  "developer/objects",
  "settings/security-identity",
  "till",
  "customers",
  "products",
  "inventory",
  "reports",
];

test("final loading performance verification", async ({ page, baseURL, request }) => {
  const username = process.env.ONEPOS_E2E_USERNAME || "";
  const password = process.env.ONEPOS_E2E_PASSWORD || "";
  test.skip(!(username && password), "Authenticated QA credentials required.");

  const apiBase = String(process.env.ONEPOS_E2E_API_BASE_URL || "https://oneengine-6gas.onrender.com").replace(/\/$/, "");
  const loginSamples = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request.post(`${apiBase}/api/auth/login`, {
      data: { username, password },
      timeout: 30000,
    });
    expect(response.ok(), `login sample ${attempt} HTTP status`).toBe(true);
    const body = await response.json();
    expect(body?.success, `login sample ${attempt} success`).toBe(true);
    const serverTiming = response.headers()["server-timing"] || "";
    const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(serverTiming);
    expect(match, `login sample ${attempt} server timing`).not.toBeNull();
    const totalMs = Number(match[1]);
    loginSamples.push(totalMs);
    expect(totalMs, `login sample ${attempt} must stay <= 1500ms`).toBeLessThanOrEqual(1500);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const contextCalls = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("/api/auth/bootstrap")
      || url.includes("/api/auth/me/stores")
      || url.includes("/api/auth/me/permissions")
    ) {
      contextCalls.push(url);
    }
  });

  await loginIfConfigured(page);

  contextCalls.length = 0;
  const routeTimings = [];

  for (const route of ROUTES) {
    const started = Date.now();
    await page.goto(new URL(route, baseURL).href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(350);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|Application error|Something went wrong/i);

    routeTimings.push({ route, ms: Date.now() - started });
  }

  expect(contextCalls, "page navigation must not repeat base auth/company/store/RBAC bootstrap").toEqual([]);

  const overLimit = routeTimings.filter((item) => item.ms > 5000);
  expect(overLimit, "no primary route should remain loading beyond 5s on a full deployed navigation").toEqual([]);

  console.log("FINAL_LOADING_PERF", JSON.stringify({
    loginSamples,
    loginMaxMs: Math.max(...loginSamples),
    loginAverageMs: Math.round(loginSamples.reduce((sum, value) => sum + value, 0) / loginSamples.length),
    routeTimings,
    contextCalls,
  }));
});
