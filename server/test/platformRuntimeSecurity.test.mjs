import test from "node:test";
import assert from "node:assert/strict";
import {
  EXECUTION_MODES,
  RuntimeSecurityError,
  assertRuntimeObjectPermission,
  assertRuntimeFieldWriteAccess,
  resolveExecutionMode,
} from "../services/platformRuntimeSecurity.js";

test("USER mode fails closed without actor context", async () => {
  const db = async () => ({ rows: [] });
  await assert.rejects(
    () => assertRuntimeObjectPermission({
      db,
      req: { user: { companyId: "c1" } },
      object: { id: "o1", object_key: "thing" },
      action: "edit",
      executionMode: "USER",
    }),
    (error) => error instanceof RuntimeSecurityError && error.code === "OBJECT_PERMISSION_REQUIRED",
  );
});

test("trusted SYSTEM mode bypasses user CRUD but remains explicit", async () => {
  const db = async () => ({ rows: [] });
  assert.equal(
    await assertRuntimeObjectPermission({
      db,
      req: { trustedSystemExecution: true, user: { companyId: "c1" } },
      object: { id: "o1", object_key: "thing" },
      action: "delete",
      executionMode: "SYSTEM",
      trustedSystem: true,
    }),
    true,
  );

  await assert.rejects(
    () => assertRuntimeObjectPermission({
      db,
      req: { user: { companyId: "c1" } },
      object: { id: "o1", object_key: "thing" },
      action: "delete",
      executionMode: "SYSTEM",
    }),
    (error) => error instanceof RuntimeSecurityError && error.code === "UNTRUSTED_SYSTEM_EXECUTION",
  );
});

test("USER object permission accepts explicit object grant", async () => {
  const db = async (sql) => {
    if (sql.includes("platform.manage")) return { rows: [] };
    if (sql.includes("platform_object_permissions")) return { rows: [{ can_edit: true }] };
    if (sql.includes("platform_permission_sets")) return { rows: [] };
    return { rows: [] };
  };
  const req = { user: { id: "u1", companyId: "c1", roleId: "r1" } };
  assert.equal(
    await assertRuntimeObjectPermission({
      db,
      req,
      object: { id: "o1", object_key: "thing" },
      action: "edit",
      executionMode: "USER",
    }),
    true,
  );
});

test("field security denies non-writable fields in USER mode", async () => {
  const fields = [
    { id: "f1", object_id: "o1", api_name: "allowed", source_column: "allowed", field_type: "text", active: true, readable: true, writable: true, company_id: "c1" },
    { id: "f2", object_id: "o1", api_name: "blocked", source_column: "blocked", field_type: "text", active: true, readable: true, writable: true, company_id: "c1" },
  ];
  const db = async (sql) => {
    if (sql.includes("platform_field_security")) {
      return { rows: [{ field_id: "f2", readable: true, writable: false }] };
    }
    if (sql.includes("platform_permission_sets")) return { rows: [] };
    return { rows: [] };
  };
  const req = { user: { id: "u1", companyId: "c1", roleId: "r1" } };

  const allowed = await assertRuntimeFieldWriteAccess({
    db,
    req,
    object: { id: "o1" },
    fields,
    fieldNames: ["allowed"],
    executionMode: "USER",
  });
  assert.equal(allowed[0].api_name, "allowed");

  await assert.rejects(
    () => assertRuntimeFieldWriteAccess({
      db,
      req,
      object: { id: "o1" },
      fields,
      fieldNames: ["blocked"],
      executionMode: "USER",
    }),
    (error) => error instanceof RuntimeSecurityError && error.code === "FIELD_WRITE_PERMISSION_REQUIRED",
  );
});

test("execution mode defaults to USER and respects explicit SYSTEM", () => {
  assert.equal(resolveExecutionMode({}), EXECUTION_MODES.USER);
  assert.equal(resolveExecutionMode({ executionMode: "SYSTEM" }), EXECUTION_MODES.SYSTEM);
});
