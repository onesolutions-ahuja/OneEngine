import { test, expect } from "@playwright/test";
import { loginIfConfigured, watchRuntimeFailures } from "./helpers.mjs";

const ROUTES = [
  "dashboard",
  "till",
  "sales",
  "products",
  "categories",
  "global-products",
  "purchases",
  "suppliers",
  "customers",
  "gift-cards",
  "employees",
  "stores",
  "supplier-returns",
  "online-orders",
  "own-delivery",
  "reports",
  "custom-reports",
  "integrations",
  "accounting",
  "google-connect",
  "kiosk-display",
  "kiosk-devices",
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

test("live login and every app page stay within 1.5 seconds", async ({ page, baseURL }) => {
  const failures = watchRuntimeFailures(page);
  const timings = [];

  let loginServerTotal = Number.NaN;
  page.on("response", (response) => {
    if (!response.url().includes("/api/auth/login")) return;
    const timing = response.headers()["server-timing"] || "";
    const total = serverTotalMs(timing);
    if (Number.isFinite(total)) loginServerTotal = total;
  });

  expect(await loginIfConfigured(page), "authenticated login must run").toBe(true);
  expect(Number.isFinite(loginServerTotal), "login must expose total Server-Timing").toBe(true);
  expect(loginServerTotal, `server login time ${loginServerTotal}ms exceeded 1500ms`).toBeLessThanOrEqual(1500);

  // Let authenticated idle-prefetch start before measuring navigation. This is
  // part of the real post-login experience and removes first-click chunk cost.
  await page.waitForTimeout(550);
  failures.length = 0;

  for (const route of ROUTES) {
    const elapsed = await navigateSpa(page, baseURL, route);
    timings.push({ route, elapsed: Math.round(elapsed) });
    expect(elapsed, `${route} navigation took ${Math.round(elapsed)}ms; limit is ${MAX_PAGE_MS}ms`).toBeLessThanOrEqual(MAX_PAGE_MS);
  }

  expect(failures, failures.join("\n")).toEqual([]);
  console.table(timings);
});
