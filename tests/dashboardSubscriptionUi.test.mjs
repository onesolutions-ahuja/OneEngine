import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard subscription delivery ignores viewer filter state", async () => {
  const runtime = await readFile(new URL("../server/services/dashboardSubscriptionRuntime.js", import.meta.url), "utf8");
  assert.match(runtime, /ignoreGlobalFilters:true/);
  assert.match(runtime, /Dashboard filters are not applied to subscription email delivery/);
});

