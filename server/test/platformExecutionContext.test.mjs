import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformExecutionContext, applyExecutionContext } from "../services/platformExecutionContext.js";
import { resolveBindingTree } from "../services/platformRecordPaths.js";

function permissionDb(codes = []) {
  return async (sql, params) => {
    const text = String(sql);
    if (text.includes("FROM users")) {
      return {
        rows: [{
          id: params?.[0] || "user-1",
          company_id: params?.[1] || "company-1",
          store_id: null,
          role_id: "role-1",
          is_superadmin: false,
        }],
      };
    }
    if (text.includes("FROM role_permissions")) {
      return { rows: codes.map((code) => ({ code })) };
    }
    if (text.includes("FROM platform_permission_sets ps")) return { rows: [] };
    return { rows: [] };
  };
}

test("execution context exposes canonical record and prior record globals", async () => {
  const record = { id: "sale-1", status: "PAID", total: 20 };
  const previousRecord = { id: "sale-1", status: "OPEN", total: 20 };
  const context = await createPlatformExecutionContext({
    db: permissionDb(["sale.view"]),
    req: { user: { id: "user-1", roleId: "role-1", companyId: "company-1", storeId: "store-1", tillId: "till-1" } },
    record,
    previousRecord,
    runId: "run-1",
    workflowId: "flow-1",
    workflowVersion: 3,
    workflowDepth: 2,
    trigger: { type: "after_update", operation: "UPDATE" },
  });

  assert.equal(context.globals.$Record.status, "PAID");
  assert.equal(context.globals.$RecordPrior.status, "OPEN");
  assert.equal(context.globals.$User.id, "user-1");
  assert.equal(context.globals.$Company.id, "company-1");
  assert.equal(context.globals.$Store.id, "store-1");
  assert.equal(context.globals.$Till.id, "till-1");
  assert.equal(context.globals.$Permission.sale.view, true);
  assert.equal(context.globals.$Flow.runId, "run-1");
  assert.equal(context.globals.$Flow.id, "flow-1");
  assert.equal(context.globals.$Flow.version, 3);
  assert.equal(context.globals.$Flow.depth, 2);
  assert.equal(context.globals.$Trigger.operation, "UPDATE");
  assert.equal(context.globals.$System.runtime, "OneEngine");
});

test("create has null prior record and store/till are nullable", async () => {
  const context = await createPlatformExecutionContext({
    db: permissionDb(),
    req: { user: { id: "user-1", companyId: "company-1" } },
    record: { id: "record-1" },
    trigger: "after_create",
  });
  assert.equal(context.globals.$RecordPrior, null);
  assert.equal(context.globals.$Store, null);
  assert.equal(context.globals.$Till, null);
});

test("tenant spoofing is rejected", async () => {
  await assert.rejects(
    () => createPlatformExecutionContext({
      db: permissionDb(),
      req: { user: { id: "user-1", companyId: "company-a" } },
      companyId: "company-b",
      record: { id: "record-1" },
    }),
    (error) => error?.code === "EXECUTION_CONTEXT_COMPANY_MISMATCH" && error?.status === 403,
  );
});

test("child context inherits tenant and stable system timestamp", async () => {
  const parent = await createPlatformExecutionContext({
    db: permissionDb(["workflow.execute"]),
    req: { user: { id: "user-1", roleId: "role-1", companyId: "company-1" } },
    record: { id: "record-1" },
    runId: "parent-run",
    workflowId: "parent-flow",
  });
  const child = await createPlatformExecutionContext({
    db: permissionDb(["workflow.execute"]),
    executionContext: parent,
    companyId: "company-1",
    record: { id: "record-1", status: "UPDATED" },
    runId: "child-run",
    parentRunId: "parent-run",
    workflowId: "child-flow",
    workflowDepth: 1,
  });

  assert.equal(child.globals.$Company.id, "company-1");
  assert.equal(child.globals.$Flow.runId, "child-run");
  assert.equal(child.globals.$Flow.parentRunId, "parent-run");
  assert.equal(child.globals.$Flow.depth, 1);
  assert.equal(child.globals.$System.now, parent.globals.$System.now);
  assert.equal(child.globals.$System.correlationId, parent.globals.$System.correlationId);
});

test("global resources are deeply read-only", async () => {
  const context = await createPlatformExecutionContext({
    db: permissionDb(),
    req: { user: { id: "user-1", companyId: "company-1" } },
    record: { id: "record-1", nested: { status: "OPEN" } },
  });
  assert.equal(Object.isFrozen(context.globals), true);
  assert.equal(Object.isFrozen(context.globals.$Record), true);
  assert.equal(Object.isFrozen(context.globals.$Record.nested), true);
  assert.throws(() => { context.globals.$Company.id = "other"; }, TypeError);
});

test("binding resolver supports canonical global paths while preserving legacy paths", async () => {
  const context = await createPlatformExecutionContext({
    db: permissionDb(["sale.refund"]),
    req: { user: { id: "user-1", roleId: "role-1", companyId: "company-1" } },
    record: { id: "sale-1", status: "PAID" },
    previousRecord: { id: "sale-1", status: "OPEN" },
  });
  const variables = { ...context.globals, customValue: 42 };
  const resolved = resolveBindingTree({
    current: { path: "$Record.status" },
    prior: { path: "$RecordPrior.status" },
    actor: { path: "$User.id" },
    canRefund: { path: "$Permission.sale.refund" },
    company: { path: "$Company.id" },
    legacy: { path: "status" },
  }, { record: context.globals.$Record, variables });

  assert.deepEqual(resolved, {
    current: "PAID",
    prior: "OPEN",
    actor: "user-1",
    canRefund: true,
    company: "company-1",
    legacy: "PAID",
  });
});

test("legacy workflow context aliases come from the canonical context", async () => {
  const executionContext = await createPlatformExecutionContext({
    db: permissionDb(),
    req: { user: { id: "user-1", companyId: "company-1", storeId: "store-1" } },
    record: { id: "record-1" },
    previousRecord: { id: "record-1", value: "before" },
  });
  const runtime = applyExecutionContext({ companyId: "wrong", record: null }, executionContext);
  assert.equal(runtime.companyId, "company-1");
  assert.equal(runtime.storeId, "store-1");
  assert.equal(runtime.record.id, "record-1");
  assert.equal(runtime.previousRecord.value, "before");
  assert.equal(runtime.$Record.id, "record-1");
});
