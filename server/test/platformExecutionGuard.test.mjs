import test from "node:test";
import assert from "node:assert/strict";
import {
  createExecutionGuard,
  executionFingerprint,
  PlatformExecutionGuardError,
  claimPersistentExecution,
} from "../services/platformExecutionGuard.js";

test("execution guard detects recursive workflow entry", () => {
  const root = createExecutionGuard({ maxDepth: 8 }).enter("flow-a");
  const child = root.enter("flow-b");
  assert.throws(
    () => child.enter("flow-a"),
    (error) => error instanceof PlatformExecutionGuardError
      && error.code === "EXECUTION_RECURSION_DETECTED",
  );
});

test("execution guard enforces maximum depth", () => {
  const root = createExecutionGuard({ maxDepth: 2 }).enter("flow-a").enter("flow-b");
  assert.throws(
    () => root.enter("flow-c"),
    (error) => error.code === "EXECUTION_DEPTH_EXCEEDED",
  );
});

test("execution guard local claims suppress duplicate identities", () => {
  const guard = createExecutionGuard();
  assert.equal(guard.claim("record:1").claimed, true);
  assert.equal(guard.claim("record:1").duplicate, true);
});

test("execution fingerprints are stable across key order", () => {
  assert.equal(
    executionFingerprint({ b: 2, a: 1 }),
    executionFingerprint({ a: 1, b: 2 }),
  );
});


test("failed persistent claim can be reclaimed for retry", async () => {
  const rows = new Map();
  let seq = 0;
  const db = async (sql, params) => {
    if (sql.includes("INSERT INTO platform_execution_claims")) {
      const key = params.slice(0, 3).join("|");
      if (rows.has(key)) return { rows: [] };
      const row = { id: String(++seq), company_id: params[0], scope_key: params[1], idempotency_key: params[2], fingerprint: params[3], status: "CLAIMED" };
      rows.set(key, row);
      return { rows: [row] };
    }
    if (sql.includes("SELECT * FROM platform_execution_claims")) {
      return { rows: [...rows.values()] };
    }
    if (sql.includes("UPDATE platform_execution_claims") && sql.includes("status='CLAIMED'")) {
      const row = [...rows.values()].find((item) => item.id === params[0] && item.status === "FAILED");
      if (!row) return { rows: [] };
      row.status = "CLAIMED";
      return { rows: [row] };
    }
    throw new Error("Unexpected SQL");
  };

  const first = await claimPersistentExecution({
    db,
    companyId: "c1",
    scope: "workflow:w1",
    idempotencyKey: "k1",
    fingerprint: "f1",
  });
  first.row.status = "FAILED";

  const retry = await claimPersistentExecution({
    db,
    companyId: "c1",
    scope: "workflow:w1",
    idempotencyKey: "k1",
    fingerprint: "f1",
  });
  assert.equal(retry.claimed, true);
  assert.equal(retry.retried, true);
});

test("persistent claim rejects idempotency key reuse with different input", async () => {
  const existing = { id: "1", fingerprint: "original", status: "COMPLETED" };
  const db = async (sql) => {
    if (sql.includes("INSERT INTO platform_execution_claims")) return { rows: [] };
    if (sql.includes("SELECT * FROM platform_execution_claims")) return { rows: [existing] };
    throw new Error("Unexpected SQL");
  };

  await assert.rejects(
    () => claimPersistentExecution({
      db,
      companyId: "c1",
      scope: "workflow:w1",
      idempotencyKey: "same-key",
      fingerprint: "different",
    }),
    (error) => error instanceof PlatformExecutionGuardError
      && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});
