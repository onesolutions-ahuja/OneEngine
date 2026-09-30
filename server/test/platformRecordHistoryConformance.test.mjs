import test from "node:test";
import assert from "node:assert/strict";

import {
  readableHistoryRows,
  writePlatformRecordHistory,
} from "../services/platformRecordHistory.js";

const object = { id: "o1", object_key: "thing" };
const fields = [
  { api_name: "name", source_column: "name", active: true, readable: true },
  { api_name: "status", source_column: "status", active: true, readable: true },
  { api_name: "secret_note", source_column: "secret_note", active: true, readable: false },
];

test("update history writes only changed fields with canonical trace metadata", async () => {
  const inserts = [];
  const db = async (sql, params) => {
    assert.equal(sql.includes("INSERT INTO platform_record_history"), true);
    inserts.push(params);
    return { rows: [{ id: `h${inserts.length}`, field_api_name: params[4], correlation_id: params[9] }] };
  };

  const rows = await writePlatformRecordHistory({
    db,
    companyId: "c1",
    object,
    recordId: "r1",
    fields,
    previousRecord: { id: "r1", name: "Old", status: "OPEN", secret_note: "same" },
    record: { id: "r1", name: "New", status: "OPEN", secret_note: "same" },
    action: "update",
    actorUserId: "u1",
    correlationId: "corr-1",
    transactionId: "11111111-1111-1111-1111-111111111111",
    workflowRunId: "22222222-2222-2222-2222-222222222222",
    eventId: "33333333-3333-3333-3333-333333333333",
    source: "WORKFLOW",
    executionMode: "USER",
  });

  assert.equal(rows.length, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0][4], "name");
  assert.equal(inserts[0][9], "corr-1");
  assert.equal(inserts[0][10], "11111111-1111-1111-1111-111111111111");
  assert.equal(inserts[0][11], "22222222-2222-2222-2222-222222222222");
  assert.equal(inserts[0][12], "33333333-3333-3333-3333-333333333333");
  assert.equal(inserts[0][13], "WORKFLOW");
  assert.equal(inserts[0][14], "USER");
});

test("create and delete history use explicit null before/after semantics", async () => {
  const calls = [];
  const db = async (_sql, params) => {
    calls.push(params);
    return { rows: [{ id: `h${calls.length}` }] };
  };

  await writePlatformRecordHistory({
    db,
    companyId: "c1",
    object,
    recordId: "r1",
    fields: fields.slice(0, 1),
    record: { name: "Created" },
    action: "create",
  });

  await writePlatformRecordHistory({
    db,
    companyId: "c1",
    object,
    recordId: "r1",
    fields: fields.slice(0, 1),
    previousRecord: { name: "Created" },
    action: "delete",
  });

  assert.equal(calls[0][5], "null");
  assert.equal(calls[0][6], JSON.stringify("Created"));
  assert.equal(calls[1][5], JSON.stringify("Created"));
  assert.equal(calls[1][6], "null");
});

test("history reads filter fields using current FLS", () => {
  const rows = [
    { id: "h1", field_api_name: "name" },
    { id: "h2", field_api_name: "secret_note" },
  ];
  const visible = readableHistoryRows(rows, fields);
  assert.deepEqual(visible.map((row) => row.id), ["h1"]);
});
