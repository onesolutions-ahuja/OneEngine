import test from "node:test";
import assert from "node:assert/strict";
import {
  createPlatformExecutionContext,
  applyExecutionContext,
} from "../services/platformExecutionContext.js";

function dbWithActor({ active = true, roleId = "current-role", rolePermissions = ["records.update"], setPermissions = [] } = {}) {
  return async (sql) => {
    if (sql.includes("FROM users")) {
      return active
        ? { rows: [{ id: "u1", company_id: "c1", store_id: "s1", role_id: roleId, is_superadmin: false }] }
        : { rows: [] };
    }
    if (sql.includes("FROM role_permissions rp") && sql.includes("WHERE rp.role_id=$1")) {
      return { rows: rolePermissions.map((code) => ({ code })) };
    }
    if (sql.includes("FROM platform_permission_sets ps")) {
      return {
        rows: setPermissions.length
          ? [{
              id: "ps1",
              name: "Extra",
              api_key: "extra",
              system_permissions: setPermissions,
              object_permissions: {},
              field_permissions: {},
              permission_set_groups: [],
            }]
          : [],
      };
    }
    return { rows: [] };
  };
}

test("authenticated request cannot impersonate explicit userId", async () => {
  await assert.rejects(
    () => createPlatformExecutionContext({
      db: dbWithActor(),
      req: { user: { id: "u1", companyId: "c1" } },
      companyId: "c1",
      userId: "u2",
    }),
    (error) => error.code === "EXECUTION_CONTEXT_USER_MISMATCH" && error.status === 403,
  );
});

test("USER execution reloads live role and projects it back into runtime request", async () => {
  const ctx = await createPlatformExecutionContext({
    db: dbWithActor({ roleId: "live-role", rolePermissions: ["records.update"], setPermissions: ["workflow.execute"] }),
    req: { user: { id: "u1", companyId: "c1", roleId: "stale-role" } },
    companyId: "c1",
    executionMode: "USER",
  });

  assert.equal(ctx.globals.$User.roleId, "live-role");
  assert.equal(ctx.globals.$Permission.records.update, true);
  assert.equal(ctx.globals.$Permission.workflow.execute, true);

  const runtime = applyExecutionContext({ req: { user: { id: "u1", companyId: "c1", roleId: "stale-role" } } }, ctx);
  assert.equal(runtime.req.user.roleId, "live-role");
  assert.equal(runtime.executionMode, "USER");
});

test("inactive USER actor is rejected", async () => {
  await assert.rejects(
    () => createPlatformExecutionContext({
      db: dbWithActor({ active: false }),
      req: { user: { id: "u1", companyId: "c1" } },
      companyId: "c1",
      executionMode: "USER",
    }),
    (error) => error.code === "RUNTIME_ACTOR_UNAVAILABLE",
  );
});

test("SYSTEM execution requires trust and records mode in globals", async () => {
  await assert.rejects(
    () => createPlatformExecutionContext({
      db: async () => ({ rows: [] }),
      req: { user: { companyId: "c1" } },
      companyId: "c1",
      executionMode: "SYSTEM",
    }),
    (error) => error.code === "UNTRUSTED_SYSTEM_EXECUTION",
  );

  const ctx = await createPlatformExecutionContext({
    db: async () => ({ rows: [] }),
    req: { user: { companyId: "c1" }, trustedSystemExecution: true },
    companyId: "c1",
    executionMode: "SYSTEM",
    trustedSystem: true,
  });
  assert.equal(ctx.globals.$System.executionMode, "SYSTEM");
  assert.equal(ctx.globals.$System.trusted, true);
  assert.equal(ctx.globals.$User.id ?? null, null);
});


test("inherited execution context cannot switch company through request context", async () => {
  await assert.rejects(
    () => createPlatformExecutionContext({
      db: async () => ({ rows: [] }),
      req: { user: { id: "u2", companyId: "c2" } },
      executionContext: {
        globals: {
          $Company: { id: "c1" },
          $User: { id: "u1", companyId: "c1" },
          $System: { executionMode: "USER", trusted: false },
        },
      },
      executionMode: "USER",
    }),
    (error) => error.code === "EXECUTION_CONTEXT_COMPANY_MISMATCH" && error.status === 403,
  );
});

test("inherited execution context cannot switch actor through request context", async () => {
  await assert.rejects(
    () => createPlatformExecutionContext({
      db: async () => ({ rows: [] }),
      req: { user: { id: "u2", companyId: "c1" } },
      executionContext: {
        globals: {
          $Company: { id: "c1" },
          $User: { id: "u1", companyId: "c1" },
          $System: { executionMode: "USER", trusted: false },
        },
      },
      executionMode: "USER",
    }),
    (error) => error.code === "EXECUTION_CONTEXT_USER_MISMATCH" && error.status === 403,
  );
});
