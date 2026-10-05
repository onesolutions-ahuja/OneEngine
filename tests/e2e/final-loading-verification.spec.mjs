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

test("final loading performance verification", async ({ page, baseURL }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Authenticated QA credentials required.");

  let loginServerTotal = null;
  const contextCalls = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/auth/login")) {
      const serverTiming = response.headers()["server-timing"] || "";
      const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(serverTiming);
      if (match) loginServerTotal = Number(match[1]);
    }
    if (
      url.includes("/api/auth/bootstrap")
      || url.includes("/api/auth/me/stores")
      || url.includes("/api/auth/me/permissions")
    ) {
      contextCalls.push(url);
    }
  });

  await loginIfConfigured(page);

  expect(loginServerTotal, "server-reported login duration").not.toBeNull();
  expect(loginServerTotal, "login server duration must stay <= 1500ms").toBeLessThanOrEqual(1500);

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

  console.log("FINAL_LOADING_PERF", JSON.stringify({ loginServerTotal, routeTimings, contextCalls }));
});
