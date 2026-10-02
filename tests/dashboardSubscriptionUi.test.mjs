import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard subscription delivery ignores viewer filter state", async () => {
  const runtime = await readFile(new URL("../server/services/dashboardSubscriptionRuntime.js", import.meta.url), "utf8");
  assert.match(runtime, /ignoreGlobalFilters:true/);
  assert.match(runtime, /Dashboard filters are not applied to subscription email delivery/);
});

test("dashboard page exposes subscriptions only through RBAC", async () => {
  const page = await readFile(new URL("../src/pages/dashboard/DashboardPage.jsx", import.meta.url), "utf8");
  assert.match(page, /dashboard\.subscribe/);
  assert.match(page, /dashboard\.subscribe\.recipients/);
  assert.match(page, /Dynamic dashboards cannot be subscribed/);
});
