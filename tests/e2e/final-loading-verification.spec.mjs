import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const ROUTES = [
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
  "developer/objects",
  "developer/workflow-builder",
  "developer/page-builder",
  "developer/dashboard-builder",
  "developer/report-builder",
];

test("final loading performance verification", async ({ page, baseURL, request }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Authenticated QA credentials required.");

  let loginServerTotal = null;
  const loginTotals = [];
  const apiBase = String(process.env.ONEPOS_E2E_API_BASE_URL || "https://oneengine-6gas.onrender.com").replace(/\/$/, "");
  const username = process.env.ONEPOS_E2E_USERNAME || "";
  const password = process.env.ONEPOS_E2E_PASSWORD || "";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await request.post(`${apiBase}/api/auth/login`, {
      data: { username, password, actingCompanyId: null },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
    });
    expect(response.ok(), `login attempt ${attempt} HTTP ${response.status()}`).toBe(true);
    const serverTiming = response.headers()["server-timing"] || "";
    const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(serverTiming);
    expect(match, `login attempt ${attempt} missing total Server-Timing: ${serverTiming}`).not.toBeNull();
    loginTotals.push(Number(match[1]));
  }

  const contextCalls = [];
  const apiFailures = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/auth/login")) {
      const serverTiming = response.headers()["server-timing"] || "";
      const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(serverTiming);
      if (match) {
        loginServerTotal = Number(match[1]);
        loginTotals.push(loginServerTotal);
      }
    }
    if (
      url.includes("/api/auth/bootstrap")
      || url.includes("/api/auth/me/stores")
      || url.includes("/api/auth/me/permissions")
      || url.includes("/api/platform/developer/acting-company")
    ) {
      contextCalls.push(url);
    }
    if (url.includes("/api/") && response.status() >= 400) {
      apiFailures.push({ status: response.status(), url });
    }
  });

  await loginIfConfigured(page);

  contextCalls.length = 0;
  apiFailures.length = 0;
  const routeTimings = [];
  const loadingFailures = [];

  for (const route of ROUTES) {
    const started = Date.now();
    await page.goto(new URL(route, baseURL).href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(500);

    const bodyText = await page.locator("body").innerText();
    const fatal = /Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|Application error|Something went wrong/i.test(bodyText);
    const stuck = /Loading(?:\s+[A-Za-z ]+)?…|Loading\.\.\.|Please wait/i.test(bodyText);
    if (fatal || stuck) loadingFailures.push({ route, fatal, stuck, excerpt: bodyText.slice(0, 500) });

    routeTimings.push({ route, ms: Date.now() - started });
  }

  console.log("FINAL_LOADING_PERF", JSON.stringify({
    loginServerTotal,
    loginTotals,
    routeTimings,
    contextCalls,
    apiFailures,
    loadingFailures,
  }));

  expect(contextCalls, "page navigation must not repeat base auth/company/store/RBAC bootstrap").toEqual([]);
  expect(apiFailures, "audited routes must not produce API 4xx/5xx responses").toEqual([]);
  expect(loadingFailures, "audited routes must not remain in a loading/error state").toEqual([]);

  const overLimit = routeTimings.filter((item) => item.ms > 5000);
  expect(overLimit, "no primary route should remain loading beyond 5s on a full deployed navigation").toEqual([]);

  expect(loginServerTotal, "server-reported browser login duration").not.toBeNull();
  expect(loginTotals, "five consecutive live login timings").toHaveLength(5);
  const slowLogins = loginTotals.filter((ms) => !Number.isFinite(ms) || ms > 1500);
  expect(slowLogins, `all five logins must stay <=1500ms; observed ${loginTotals.join(", ")}ms`).toEqual([]);
});
