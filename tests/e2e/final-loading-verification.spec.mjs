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

test("final loading performance verification", async ({ page, baseURL }) => {
  test.skip(!(process.env.ONEPOS_E2E_USERNAME && process.env.ONEPOS_E2E_PASSWORD), "Authenticated QA credentials required.");

  let loginServerTotal = null;
  const contextCalls = [];
  const apiFailures = [];
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

  const blockingLoader = /Checking till…|Loading catalogue…|Loading custom reports…|Loading Settings…|Loading settings…|Loading objects…|Loading existing definitions…|Workspace\s+0 objects\s+Loading…/i;

  for (const route of ROUTES) {
    const started = Date.now();
    await page.goto(new URL(route, baseURL).href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("body")).toBeVisible();

    let bodyText = "";
    let settled = false;
    const settleDeadline = Date.now() + 5000;
    while (Date.now() < settleDeadline) {
      bodyText = await page.locator("body").innerText();
      if (!blockingLoader.test(bodyText)) {
        settled = true;
        break;
      }
      await page.waitForTimeout(150);
    }
    bodyText = await page.locator("body").innerText();

    const fatal = /Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|Application error|Something went wrong/i.test(bodyText);
    if (fatal || !settled) loadingFailures.push({ route, fatal, stuck: !settled, excerpt: bodyText.slice(0, 500) });

    routeTimings.push({ route, ms: Date.now() - started });
  }

  console.log("FINAL_LOADING_PERF", JSON.stringify({
    loginServerTotal,
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

  expect(loginServerTotal, "server-reported login duration").not.toBeNull();
  expect(loginServerTotal, "login server duration must stay <= 1500ms").toBeLessThanOrEqual(1500);
});
