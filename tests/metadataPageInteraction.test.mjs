import assert from "node:assert/strict";
import test from "node:test";
import { executePageInteraction } from "../src/actions/metadata/executePageInteraction.js";

test("metadata navigation resolves at runtime without a business action name", async () => {
  let route = "";
  const result = await executePageInteraction({
    node: { interaction: { type: "navigate", navigationTarget: { registryKey: "target-1" } } },
    record: { id: "record-9" },
    navigationContext: { customPages: [] },
    resolveNavigationTarget: (_target, context) => ({ ok: true, route: `/records/${context.currentRecordId}` }),
    navigate: (next) => { route = next; },
  });
  assert.equal(result.handled, true);
  assert.equal(route, "/records/record-9");
});

test("workflow interactions use the single generic runtime endpoint", async () => {
  const calls = [];
  await executePageInteraction({
    node: { interaction: { type: "workflow", workflowId: "flow-42" }, collection: { objectKey: "dynamic_object" } },
    record: { id: "record-3" },
    request: async (...args) => { calls.push(args); return { success: true }; },
  });
  assert.equal(calls[0][0], "/api/platform/runtime/page-interactions/execute");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    type: "workflow",
    workflowId: "flow-42",
    objectKey: "dynamic_object",
    recordId: "record-3",
  });
});
