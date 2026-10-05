import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeExecutionQuery, executeObjectButton, executeObjectButtonForRecords } from "../src/actions/metadata/executeObjectButton.js";

test("object button execution builds one generic metadata endpoint", async () => {
  const calls = [];
  const response = await executeObjectButton({
    request: async (...args) => { calls.push(args); return { success: true, data: { ok: true } }; },
    objectKey: "dynamic_object",
    recordId: "record-1",
    button: { button_key: "button-9" },
    formFactor: "desktop",
    appKey: "app-2",
    body: { inputs: { value: 4 } },
  });
  assert.equal(response.data.ok, true);
  assert.equal(calls[0][0], "/api/platform/objects/dynamic_object/records/record-1/buttons/button-9/execute?formFactor=desktop&appKey=app-2");
  assert.deepEqual(JSON.parse(calls[0][1].body), { inputs: { value: 4 } });
});

test("runtime query omits empty metadata", () => {
  assert.equal(buildRuntimeExecutionQuery({}), "");
  assert.equal(buildRuntimeExecutionQuery({ formFactor: "mobile" }), "formFactor=mobile");
});

test("bulk execution reuses the same generic action", async () => {
  const endpoints = [];
  await executeObjectButtonForRecords({
    request: async (url) => { endpoints.push(url); return { success: true }; },
    objectKey: "thing",
    button: { button_key: "archive" },
  }, ["1", "2"]);
  assert.deepEqual(endpoints, [
    "/api/platform/objects/thing/records/1/buttons/archive/execute",
    "/api/platform/objects/thing/records/2/buttons/archive/execute",
  ]);
});
