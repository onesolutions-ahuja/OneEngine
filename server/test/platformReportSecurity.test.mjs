import test from "node:test";
import assert from "node:assert/strict";
import { hasPlatformObjectPermission } from "../services/platformReportSecurity.js";

function request() {
  return { user: { id: "user-1", companyId: "company-1", roleId: "role-1" } };
}

test("object permission reads are deduplicated within a request without crossing requests", async () => {
  const calls = [];
  const db = async (sql) => {
    calls.push(sql);
    if (sql.startsWith("SELECT can_view")) {
      return { rows: [{ can_view: false, can_create: false, can_edit: false, can_delete: false, can_import: false, can_export: false }] };
    }
    if (sql.startsWith("SELECT DISTINCT ps.id")) return { rows: [] };
    if (sql.startsWith("SELECT object_key")) return { rows: [{ object_key: "settings_host", source_table: "settings" }] };
    throw new Error(`Unexpected query: ${sql}`);
  };

  const firstRequest = request();
  const firstResults = await Promise.all(["view", "create", "edit", "delete"].map((action) =>
    hasPlatformObjectPermission(db, firstRequest, "object-1", action)
  ));
  assert.deepEqual(firstResults, [false, false, false, false]);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT can_view")).length, 1);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT object_key")).length, 1);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT DISTINCT ps.id")).length, 1);

  const secondRequest = request();
  await hasPlatformObjectPermission(db, secondRequest, "object-1", "view");
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT can_view")).length, 2);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT object_key")).length, 2);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT DISTINCT ps.id")).length, 2);
});

test("direct object grants remain authoritative and avoid fallback object reads", async () => {
  const calls = [];
  const db = async (sql) => {
    calls.push(sql);
    if (sql.startsWith("SELECT can_view")) {
      return { rows: [{ can_view: true, can_create: false, can_edit: false, can_delete: false, can_import: false, can_export: false }] };
    }
    if (sql.startsWith("SELECT DISTINCT ps.id")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  };

  assert.equal(await hasPlatformObjectPermission(db, request(), "object-1", "view"), true);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT can_view")).length, 1);
  assert.equal(calls.filter((sql) => sql.startsWith("SELECT object_key")).length, 0);
});
