import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";
import { resolveBindingTree } from "../server/services/platformRecordPaths.js";

test("workflow decisions can route on outputs from previous steps", async () => {
  const decision = getWorkflowActionDefinition("CONDITION");
  assert.ok(decision);
  const result = await decision.executor({
    action: {
      outcomes: [{
        id: "matched",
        label: "Matched",
        condition: {
          match: "all",
          conditions: [{ field: "steps.lookup.status", operator: "equals", value: "READY" }],
        },
        branch: [],
      }],
      defaultBranch: [],
    },
    fields: [],
    record: {},
    previousRecord: null,
    req: { user: { companyId: "company-1" } },
    object: null,
    workflowVariables: { steps: { lookup: { status: "READY" } }, variables: {} },
  });
  assert.equal(result.outcomeId, "matched");
  assert.equal(result.matched, true);
});

test("generic binding resolver supports indexed collection paths", () => {
  const resolved = resolveBindingTree(
    { value: { path: "steps.lookup.records.0.name" } },
    { variables: { steps: { lookup: { records: [{ name: "First" }] } }, variables: {} } },
  );
  assert.deepEqual(resolved, { value: "First" });
});

test("generic Flow HTTP preserves provider base URL paths without connector-definition coupling", () => {
  const coreSource = readFileSync(new URL("../server/services/oneCoreFunctions.js", import.meta.url), "utf8");
  const start = coreSource.indexOf("export async function oneHttpRequest");
  const end = coreSource.indexOf("export function oneHttpRequestDefinition", start);
  const runtime = coreSource.slice(start, end);
  assert.match(runtime, /absoluteEndpoint/);
  assert.doesNotMatch(runtime, /platform_connector_definitions/);
  assert.match(runtime, /FROM integration_connections/);
});

test("retired business assistant runtime is not a registered platform function", async () => {
  const { PLATFORM_FUNCTIONS } = await import("../server/services/platformFunctionRegistry.js");
  const keys = PLATFORM_FUNCTIONS.map((item) => String(item?.key || "").toUpperCase());
  assert.equal(keys.some((key) => key.includes("APPOINTMENT")), false);
  assert.equal(keys.some((key) => key.includes("ONE_ASSISTANT")), false);
});
