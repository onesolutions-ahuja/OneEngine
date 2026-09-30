import test from "node:test";
import assert from "node:assert/strict";
import { executeWorkflowAction } from "../services/platformWorkflow.js";

test("workflow action USER mode fails closed without current permission", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM role_permissions")) return { rows: [] };
    if (sql.includes("FROM platform_permission_sets ps")) return { rows: [] };
    return { rows: [] };
  };

  await assert.rejects(
    () => executeWorkflowAction({
      db,
      req: {
        executionMode: "USER",
        user: { id: "u1", companyId: "c1", roleId: "r1" },
      },
      companyId: "c1",
      executionMode: "USER",
      action: { type: "IN_APP_NOTIFICATION", message: "hello" },
    }),
    (error) => error.code === "WORKFLOW_ACTION_PERMISSION_REQUIRED" && error.status === 403,
  );
});

test("trusted SYSTEM workflow action executes without user permission bypass ambiguity", async () => {
  const calls = [];
  const db = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("INSERT INTO platform_notifications")) return { rows: [] };
    return { rows: [] };
  };

  const result = await executeWorkflowAction({
    db,
    req: {
      executionMode: "SYSTEM",
      trustedSystemExecution: true,
      user: { companyId: "c1" },
    },
    companyId: "c1",
    executionMode: "SYSTEM",
    trustedSystem: true,
    action: { type: "IN_APP_NOTIFICATION", message: "system notice" },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.persistent, true);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO platform_notifications")), true);
});

test("untrusted SYSTEM workflow action is rejected", async () => {
  await assert.rejects(
    () => executeWorkflowAction({
      db: async () => ({ rows: [] }),
      req: { executionMode: "SYSTEM", user: { companyId: "c1" } },
      companyId: "c1",
      executionMode: "SYSTEM",
      action: { type: "IN_APP_NOTIFICATION", message: "bad" },
    }),
    (error) => error.code === "UNTRUSTED_SYSTEM_EXECUTION",
  );
});
