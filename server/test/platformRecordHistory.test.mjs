import test from "node:test";
import assert from "node:assert/strict";
import {
  writePlatformRecordHistory,
  readableHistoryRows,
} from "../services/platformRecordHistory.js";

const object = { id: "11111111-1111-1111-1111-111111111111", object_key: "thing" };
const fields = [
  { api_name: "name", source_column: "name", active: true, readable: true },
  { api_name: "status", source_column: "status", active: true, readable: true },
  { api_name: "secret", source_column: "secret", active: true, readable: false },
];

function historyDb(rows) {
  return async (sql, params) => {
    if (!sql.includes("INSERT INTO platform_record_history")) throw new Error(`Unexpected SQL: ${sql}`);
    const row = {
      field_api_name: params[4],
      old_value: JSON.parse(params[5]),
      new_value: JSON.parse(params[6]),
      action: params[7],
      actor_user_id: params[8],
      correlation_id: params[9],
      transaction_id: params[10],
      workflow_run_id: params[11],
      event_id: params[12],
      source: params[13],
      execution_mode: params[14],
      runtime_contract_version: params[15],
    };
    rows.push(row);
    return { rows: [row] };
  };
}

test("create history writes each active field from null to value with trace metadata", async () => {
  const rows = [];
  await writePlatformRecordHistory({
    db: historyDb(rows),
    companyId: "22222222-2222-2222-2222-222222222222",
    object,
    recordId: "33333333-3333-3333-3333-333333333333",
    fields,
    record: { name: "A", status: "OPEN", secret: "x" },
    action: "create",
    actorUserId: "44444444-4444-4444-4444-444444444444",
    transactionId: "55555555-5555-5555-5555-555555555555",
    source: "API",
    executionMode: "USER",
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].old_value, null);
  assert.equal(rows[0].correlation_id, "55555555-5555-5555-5555-555555555555");
  assert.equal(rows[0].execution_mode, "USER");
});

test("update history stores only changed fields", async () => {
  const rows = [];
  await writePlatformRecordHistory({
    db: historyDb(rows),
    companyId: "22222222-2222-2222-2222-222222222222",
    object,
    recordId: "33333333-3333-3333-3333-333333333333",
    fields,
    previousRecord: { name: "A", status: "OPEN", secret: "same" },
    record: { name: "A", status: "CLOSED", secret: "same" },
    action: "update",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field_api_name, "status");
  assert.equal(rows[0].old_value, "OPEN");
  assert.equal(rows[0].new_value, "CLOSED");
});

test("delete history records previous values transitioning to null", async () => {
  const rows = [];
  await writePlatformRecordHistory({
    db: historyDb(rows),
    companyId: "22222222-2222-2222-2222-222222222222",
    object,
    recordId: "33333333-3333-3333-3333-333333333333",
    fields,
    previousRecord: { name: "A", status: "OPEN", secret: "x" },
    action: "delete",
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.field_api_name === "name").old_value, "A");
  assert.equal(rows.find((row) => row.field_api_name === "name").new_value, null);
});

test("readable history removes fields hidden by FLS", () => {
  const rows = [
    { field_api_name: "name" },
    { field_api_name: "secret" },
    { field_api_name: null },
  ];
  assert.deepEqual(readableHistoryRows(rows, fields), [rows[0], rows[2]]);
});
