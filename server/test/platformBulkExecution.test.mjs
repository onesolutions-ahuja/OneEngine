import test from "node:test";
import assert from "node:assert/strict";
import { executeBulk } from "../services/platformBulkExecution.js";

test("bulk executor preserves input result order", async () => {
  const result = await executeBulk({
    items: [3, 1, 2],
    concurrency: 3,
    handler: async (value) => value * 2,
  });
  assert.deepEqual(result, [6, 2, 4]);
});

test("bulk executor suppresses duplicate keys", async () => {
  let calls = 0;
  const result = await executeBulk({
    items: [{ id: "a" }, { id: "a" }, { id: "b" }],
    concurrency: 2,
    keyForItem: (item) => item.id,
    handler: async (item) => {
      calls += 1;
      return { status: "completed", id: item.id };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result[1].duplicate, true);
});

test("bulk executor isolates item failures", async () => {
  const result = await executeBulk({
    items: [1, 2, 3],
    concurrency: 2,
    handler: async (value) => {
      if (value === 2) throw Object.assign(new Error("bad row"), { code: "BAD_ROW" });
      return { status: "completed", value };
    },
  });
  assert.equal(result[0].status, "completed");
  assert.equal(result[1].status, "failed");
  assert.equal(result[1].error.code, "BAD_ROW");
  assert.equal(result[2].status, "completed");
});
