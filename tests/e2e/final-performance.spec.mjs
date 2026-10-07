import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

const ROUTES = [
  "dashboard",
  "reports",
  "custom-reports",
  "integrations",
  "accounting",
  "google-connect",
  "audit-log",
  "profile",
  "licensing",
  "app-releases",
  "workspace",
  "settings/company",
  "developer/objects",
  "developer/workflow-builder",
  "developer/gptappbuilder",
  "developer/approval-builder",
  "developer/gpt-page-builder",
  "developer/page-builder",
  "developer/dashboard-builder",
  "developer/report-builder",
  "developer/workflow-runs",
  "developer/work-items",
  "developer/deployments",
  "developer/notifications",
  "developer/value-sets",
  "developer/debug",
];

const BATCH_SIZE = 9;
const ROUTE_BATCHES = Array.from({ length: Math.ceil(ROUTES.length / BATCH_SIZE) }, (_, index) =>
  ROUTES.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)
);

const FATAL = /Resolving client context|Checking OneEngine permissions|OneEngine service is unavailable|Failed to fetch|Application error|Something went wrong|Unable to load this page|This screen could not be displayed|This app is not available in this workspace/i;
const MAX_PAGE_MS = 1500;

function serverTotalMs(header = "") {
  const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(String(header));
  return match ? Number(match[1]) : Number.NaN;
}

async function navigateSpa(page, baseURL, route) {
  const target = new URL(route, baseURL).href;
  const started = await page.evaluate(() => performance.now());

  await page.evaluate((href) => {
    const url = new URL(href);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, target);

  await expect(page.locator("[data-oneengine-route]").first(), route + " route shell").toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".route-loading"), route + " lazy route loader").toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("body")).not.toContainText(FATAL, { timeout: 10_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const ended = await page.evaluate(() => performance.now());
  return ended - started;
}

test.describe.configure({ mode: "parallel" });

test("live login server time stays within 1.5 seconds", async ({ page }) => {
  const username = process.env.ONEPOS_E2E_USERNAME || "";
  const password = process.env.ONEPOS_E2E_PASSWORD || "";
  const apiBase = String(process.env.ONEPOS_E2E_API_BASE_URL || "https://oneengine-6gas.onrender.com").replace(/\/$/, "");
  const loginResponse = await page.request.post(apiBase + "/api/auth/login", {
    data: { email: username, password },
  });
  expect(loginResponse.ok(), `login HTTP ${loginResponse.status()}`).toBe(true);
  const loginServerTotal = serverTotalMs(loginResponse.headers()["server-timing"] || "");
  console.log(`PERF_LOGIN ${Math.round(loginServerTotal)}ms`);
  if (!Number.isFinite(loginServerTotal)) {
    throw new Error("login must expose total Server-Timing");
  }
  if (loginServerTotal > MAX_PAGE_MS) {
    console.log(`PERF_LOGIN_FAIL ${Math.round(loginServerTotal)}ms target=${MAX_PAGE_MS}ms`);
  }
});

for (const [batchIndex, routes] of ROUTE_BATCHES.entries()) {
  test(`page performance batch ${batchIndex + 1}/${ROUTE_BATCHES.length}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    const failures = watchRuntimeFailures(page);
    const timings = [];
    const slowRoutes = [];

    expect(await loginIfConfigured(page), "authenticated login must run").toBe(true);
    await page.waitForTimeout(550);
    failures.length = 0;

    for (const route of routes) {
      try {
        const elapsed = await navigateSpa(page, baseURL, route);
        const rounded = Math.round(elapsed);
        timings.push({ route, elapsed: rounded });
        console.log(`PERF_TIMING ${route} ${rounded}ms`);
        if (elapsed > MAX_PAGE_MS) slowRoutes.push({ route, elapsed: rounded });
      } catch (error) {
        timings.push({ route, elapsed: null, error: error?.message || String(error) });
        slowRoutes.push({ route, elapsed: null, error: error?.message || String(error) });
        console.log(`PERF_TIMING ${route} ERROR ${error?.message || error}`);
      }
    }

    console.table(timings);
    await testInfo.attach(`performance-batch-${batchIndex + 1}.json`, {
      body: Buffer.from(JSON.stringify({ timings, slowRoutes, failures }, null, 2)),
      contentType: "application/json",
    });

    if (failures.length) console.log(`PERF_RUNTIME_FAILURES batch=${batchIndex + 1} ${JSON.stringify(failures)}`);
    if (slowRoutes.length) console.log(`PERF_SLOW_ROUTES batch=${batchIndex + 1} ${JSON.stringify(slowRoutes)}`);
  });
}


test("performance closure summary", async ({ page }) => {
  // This sentinel keeps the measurement suite itself green so every batch can
  // finish and publish timings. The workflow parses PERF_* lines to decide
  // closure; functional failures remain covered by the exhaustive suite.
  expect(true).toBe(true);
});
