import { applyFieldSecurity } from "./platformFieldValues.js";
import {
  loadEffectivePermissionSets,
  permissionSetAllowsObject,
  permissionSetAllowsSystemPermission,
} from "./platformPermissionSets.js";
import { systemObjectRbacPermission } from "./platformSystemObjects.js";

export const EXECUTION_MODES = Object.freeze({
  USER: "USER",
  SYSTEM: "SYSTEM",
});

export class RuntimeSecurityError extends Error {
  constructor(message, { code = "RUNTIME_SECURITY_DENIED", status = 403, details = null } = {}) {
    super(message);
    this.name = "RuntimeSecurityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function resolveExecutionMode(context = {}) {
  const inherited = context.executionContext?.globals?.$System || context.globals?.$System || {};
  const requested = String(
    context.executionMode
      || context.req?.executionMode
      || inherited.executionMode
      || EXECUTION_MODES.USER
  ).toUpperCase();
  return requested === EXECUTION_MODES.SYSTEM ? EXECUTION_MODES.SYSTEM : EXECUTION_MODES.USER;
}

export function assertTrustedSystemExecution(context = {}) {
  const inherited = context.executionContext?.globals?.$System || context.globals?.$System || {};
  const trusted = context.trustedSystem === true
    || context.req?.trustedSystemExecution === true
    || inherited.trusted === true;
  if (!trusted) {
    throw new RuntimeSecurityError("SYSTEM execution requires a trusted runtime entry point", {
      code: "UNTRUSTED_SYSTEM_EXECUTION",
    });
  }
  return true;
}

export function authoritativeRuntimeCompanyId(context = {}) {
  const reqCompany = context.req?.user?.companyId || null;
  const inherited = context.executionContext?.globals?.$Company?.id
    || context.globals?.$Company?.id
    || context.companyId
    || null;
  if (reqCompany && inherited && String(reqCompany) !== String(inherited)) {
    throw new RuntimeSecurityError("Cross-company runtime execution is not allowed", {
      code: "RUNTIME_COMPANY_MISMATCH",
    });
  }
  return reqCompany || inherited || null;
}

async function hasRolePermission(db, roleId, permissionCode) {
  if (!db || !roleId || !permissionCode) return false;
  const result = await db(
    "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code=$2 LIMIT 1",
    [roleId, permissionCode]
  );
  return result.rows.length > 0;
}

export async function hasRuntimeObjectPermission({
  db,
  req,
  object,
  action,
  executionMode = EXECUTION_MODES.USER,
  trustedSystem = false,
}) {
  if (!object?.id) return false;
  const mode = String(executionMode || EXECUTION_MODES.USER).toUpperCase();

  if (mode === EXECUTION_MODES.SYSTEM) {
    assertTrustedSystemExecution({ req, trustedSystem, executionMode: mode });
    return true;
  }

  const user = req?.user || {};
  if (!user.id || !user.companyId || !user.roleId) return false;
  if (await hasRolePermission(db, user.roleId, "platform.manage")) return true;

  const [objectPermission, permissionSets] = await Promise.all([
    db(
      "SELECT can_view,can_create,can_edit,can_delete,can_import,can_export FROM platform_object_permissions WHERE object_id=$1 AND role_id=$2 AND company_id=$3",
      [object.id, user.roleId, user.companyId]
    ),
    loadEffectivePermissionSets(db, user, req),
  ]);

  if (objectPermission.rows[0]?.[`can_${action}`] === true) return true;
  if (permissionSetAllowsObject(permissionSets, object.object_key, action)) return true;

  const permission = systemObjectRbacPermission(object, action);
  if (!permission) return false;
  if (permissionSetAllowsSystemPermission(permissionSets, permission)) return true;
  return hasRolePermission(db, user.roleId, permission);
}

export async function assertRuntimeObjectPermission(options) {
  if (await hasRuntimeObjectPermission(options)) return true;
  throw new RuntimeSecurityError(
    `Object ${options.action || "access"} permission is required`,
    {
      code: "OBJECT_PERMISSION_REQUIRED",
      details: {
        objectId: options.object?.id || null,
        objectKey: options.object?.object_key || null,
        action: options.action || null,
      },
    }
  );
}

export async function secureRuntimeFields({
  db,
  req,
  fields = [],
  executionMode = EXECUTION_MODES.USER,
  trustedSystem = false,
}) {
  const mode = String(executionMode || EXECUTION_MODES.USER).toUpperCase();
  if (mode === EXECUTION_MODES.SYSTEM) {
    assertTrustedSystemExecution({ req, trustedSystem, executionMode: mode });
    return fields.map((field) => ({ ...field, readable: field.readable !== false, writable: field.writable === true }));
  }
  if (!req?.user?.id || !req?.user?.companyId) {
    throw new RuntimeSecurityError("USER execution requires an authenticated actor", {
      code: "RUNTIME_ACTOR_REQUIRED",
    });
  }
  return applyFieldSecurity(db, fields, req);
}

export async function assertRuntimeFieldWriteAccess({
  db,
  req,
  object,
  fields,
  fieldNames,
  executionMode = EXECUTION_MODES.USER,
  trustedSystem = false,
}) {
  const secured = await secureRuntimeFields({ db, req, fields, executionMode, trustedSystem });
  const byName = new Map(secured.map((field) => [field.api_name, field]));
  const denied = [];
  const selected = [];
  for (const name of fieldNames || []) {
    const field = byName.get(name)
      || secured.find((candidate) => candidate.source_column === name);
    if (!field || field.active === false || field.writable !== true || field.field_type === "formula" || field.field_type === "rollup") {
      denied.push(name);
      continue;
    }
    selected.push(field);
  }
  if (denied.length) {
    throw new RuntimeSecurityError("One or more fields are not writable in this execution context", {
      code: "FIELD_WRITE_PERMISSION_REQUIRED",
      details: { objectId: object?.id || null, fields: denied },
    });
  }
  return selected;
}
