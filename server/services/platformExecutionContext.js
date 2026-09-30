import { randomUUID } from "node:crypto";
import { loadEffectivePermissionSets } from "./platformPermissionSets.js";
import { platformRuntimeContract } from "./platformConformance.js";

const SECRET_KEY = /(password|token|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i;

function safeObject(value) {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function requestSource(req, explicit = null) {
  const source = explicit && typeof explicit === "object" ? explicit : {};
  return {
    type: source.type || req?.executionSource || req?.source || "API",
    method: source.method || req?.method || null,
    path: source.path || req?.originalUrl || req?.path || null,
    capability: source.capability || req?.trustedCapability || null,
  };
}

function permissionTree(codes = []) {
  const root = {};
  for (const code of codes) {
    const parts = String(code || "").split(".").filter(Boolean);
    if (!parts.length) continue;
    let cursor = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor[parts[index]] ||= {};
      cursor = cursor[parts[index]];
    }
    cursor[parts.at(-1)] = true;
  }
  return root;
}

async function loadPermissions(db, user, req = null) {
  if (!db || typeof db !== "function" || !user?.companyId) return Object.freeze({});
  const roleResult = user.roleId
    ? await db(
        `SELECT p.code
           FROM role_permissions rp
           JOIN permissions p ON p.id=rp.permission_id
          WHERE rp.role_id=$1`,
        [user.roleId]
      )
    : { rows: [] };
  const permissionSets = user.id
    ? await loadEffectivePermissionSets(db, user, req)
    : [];
  const codes = new Set((roleResult.rows || []).map((row) => row.code));
  for (const set of permissionSets) {
    for (const code of Array.isArray(set.system_permissions) ? set.system_permissions : []) codes.add(code);
  }
  return deepFreeze(permissionTree([...codes]));
}

function executionTimestamp(existing = null) {
  const value = existing || new Date().toISOString();
  return new Date(value).toISOString();
}

export async function createPlatformExecutionContext({
  db = null,
  req = null,
  companyId = null,
  userId = null,
  storeId = null,
  tillId = null,
  record = null,
  previousRecord = null,
  object = null,
  runId = null,
  parentRunId = null,
  workflowId = null,
  workflowVersion = null,
  workflowDepth = 0,
  trigger = null,
  source = null,
  device = null,
  channel = null,
  app = null,
  packageInfo = null,
  system = null,
  request = null,
  executionContext = null,
  executionMode = null,
  trustedSystem = false,
} = {}) {
  const reqUser = req?.user || {};
  const inherited = executionContext?.globals || executionContext || {};
  const inheritedCompany = inherited.$Company?.id || inherited.companyId || null;
  const inheritedUserId = inherited.$User?.id || null;
  if (reqUser.companyId && inheritedCompany && String(reqUser.companyId) !== String(inheritedCompany)) {
    const error = new Error("Request company does not match inherited execution context");
    error.code = "EXECUTION_CONTEXT_COMPANY_MISMATCH";
    error.status = 403;
    throw error;
  }
  if (reqUser.id && inheritedUserId && String(reqUser.id) !== String(inheritedUserId)) {
    const error = new Error("Request actor does not match inherited execution context");
    error.code = "EXECUTION_CONTEXT_USER_MISMATCH";
    error.status = 403;
    throw error;
  }
  const authoritativeCompanyId = reqUser.companyId || inheritedCompany || companyId || null;
  const inheritedMode = inherited.$System?.executionMode || null;
  const requestedMode = String(executionMode || req?.executionMode || inheritedMode || "USER").toUpperCase();
  const mode = requestedMode === "SYSTEM" ? "SYSTEM" : "USER";
  const isTrustedSystem = trustedSystem === true || req?.trustedSystemExecution === true || inherited.$System?.trusted === true;
  if (mode === "SYSTEM" && !isTrustedSystem) {
    const error = new Error("SYSTEM execution requires a trusted runtime entry point");
    error.code = "UNTRUSTED_SYSTEM_EXECUTION";
    error.status = 403;
    throw error;
  }

  let persistedUser = null;
  const actorId = reqUser.id || inheritedUserId || (mode === "SYSTEM" ? userId : null);
  if (db && typeof db === "function" && actorId && authoritativeCompanyId) {
    try {
      const result = await db(
        `SELECT id,company_id,store_id,role_id
           FROM users
          WHERE id=$1 AND company_id=$2 AND active=true
          LIMIT 1`,
        [actorId, authoritativeCompanyId]
      );
      if (result.rows?.[0]) {
        const row = result.rows[0];
        persistedUser = {
          id: row.id,
          companyId: row.company_id,
          storeId: row.store_id,
          roleId: row.role_id,
        };
      }
    } catch {
      persistedUser = null;
    }
  }

  if (reqUser.id && userId && String(reqUser.id) !== String(userId)) {
    const error = new Error("Authenticated execution cannot impersonate another user");
    error.code = "EXECUTION_CONTEXT_USER_MISMATCH";
    error.status = 403;
    throw error;
  }
  if (mode === "USER" && !actorId) {
    const error = new Error("USER execution requires an authenticated actor");
    error.code = "EXECUTION_CONTEXT_ACTOR_REQUIRED";
    error.status = 403;
    throw error;
  }
  if (mode === "USER" && db && typeof db === "function" && actorId && !persistedUser) {
    const error = new Error("Runtime actor is unavailable or inactive");
    error.code = "RUNTIME_ACTOR_UNAVAILABLE";
    error.status = 403;
    throw error;
  }

  if (reqUser.companyId && companyId && String(reqUser.companyId) !== String(companyId)) {
    const error = new Error("Cross-company execution context is not allowed");
    error.code = "EXECUTION_CONTEXT_COMPANY_MISMATCH";
    error.status = 403;
    throw error;
  }
  if (inheritedCompany && companyId && String(inheritedCompany) !== String(companyId)) {
    const error = new Error("Child execution context cannot switch company");
    error.code = "EXECUTION_CONTEXT_COMPANY_MISMATCH";
    error.status = 403;
    throw error;
  }

  const actor = safeObject({
    ...(safeObject(inherited.$User) || {}),
    ...(safeObject(reqUser) || {}),
    ...(safeObject(persistedUser) || {}),
    id: actorId,
    companyId: authoritativeCompanyId,
  }) || {};
  const permissions = actor.id && authoritativeCompanyId
    ? await loadPermissions(db, actor, req)
    : Object.freeze({ ...(inherited.$Permission || {}) });

  const startedAt = executionTimestamp(inherited.$Flow?.startedAt);
  const correlationId = request?.correlationId
    || req?.businessCommandCorrelationId
    || req?.headers?.["x-request-id"]
    || req?.headers?.["x-correlation-id"]
    || inherited.$System?.correlationId
    || randomUUID();

  const runtimeContract = platformRuntimeContract();
  const globals = {
    $Record: record ?? inherited.$Record ?? null,
    $RecordPrior: previousRecord ?? inherited.$RecordPrior ?? null,
    $User: actor,
    $Company: authoritativeCompanyId ? { id: authoritativeCompanyId } : null,
    $Store: { id: storeId || reqUser.storeId || inherited.$Store?.id || null },
    $Till: { id: tillId || reqUser.tillId || inherited.$Till?.id || null },
    $Permission: permissions,
    $Flow: {
      id: workflowId || inherited.$Flow?.id || null,
      version: workflowVersion || inherited.$Flow?.version || null,
      runId: runId || inherited.$Flow?.runId || null,
      parentRunId: parentRunId || inherited.$Flow?.parentRunId || null,
      startedAt,
      depth: Number(workflowDepth || 0),
    },
    $Trigger: {
      type: typeof trigger === "string" ? trigger : trigger?.type || inherited.$Trigger?.type || null,
      operation: trigger?.operation || inherited.$Trigger?.operation || null,
      source: requestSource(req, source).type,
    },
    $Request: {
      correlationId,
      method: request?.method || req?.method || inherited.$Request?.method || null,
      path: request?.path || req?.originalUrl || req?.path || inherited.$Request?.path || null,
      timestamp: request?.timestamp || startedAt,
      source: requestSource(req, source),
    },
    $Device: safeObject(device || inherited.$Device || req?.device || null),
    $Channel: safeObject(channel || inherited.$Channel || req?.channel || null),
    $App: safeObject(app || inherited.$App || null),
    $Package: safeObject(packageInfo || inherited.$Package || null),
    $System: {
      now: inherited.$System?.now || startedAt,
      correlationId,
      environment: system?.environment || process.env.NODE_ENV || inherited.$System?.environment || null,
      runtime: runtimeContract.runtime,
      runtimeContractVersion: runtimeContract.runtimeContractVersion,
      metadataSchemaVersion: runtimeContract.metadataSchemaVersion,
      apiVersion: runtimeContract.apiVersion,
      executionMode: mode,
      trusted: isTrustedSystem,
    },
  };

  if (globals.$Store && !globals.$Store.id) globals.$Store = null;
  if (globals.$Till && !globals.$Till.id) globals.$Till = null;

  const frozenGlobals = deepFreeze(globals);
  return Object.freeze({
    globals: frozenGlobals,
    companyId: authoritativeCompanyId,
    storeId: globals.$Store?.id || null,
    tillId: globals.$Till?.id || null,
    userId: actor.id || null,
    objectId: object?.id || null,
    recordId: record?.id || null,
    correlationId,
  });
}

export function applyExecutionContext(context = {}, executionContext) {
  const globals = executionContext?.globals || {};
  const canonicalUser = globals.$User || null;
  const runtimeReq = context.req
    ? {
        ...context.req,
        executionMode: globals.$System?.executionMode || context.req.executionMode || "USER",
        trustedSystemExecution: globals.$System?.trusted === true || context.req.trustedSystemExecution === true,
        user: canonicalUser
          ? {
              ...(context.req.user || {}),
              ...canonicalUser,
              id: canonicalUser.id || null,
              companyId: executionContext?.companyId ?? canonicalUser.companyId ?? context.req.user?.companyId ?? null,
              storeId: executionContext?.storeId ?? canonicalUser.storeId ?? context.req.user?.storeId ?? null,
            }
          : (context.req.user || {}),
      }
    : context.req;
  return {
    ...context,
    req: runtimeReq,
    executionContext,
    globals,
    ...globals,
    executionMode: globals.$System?.executionMode || context.executionMode || "USER",
    trustedSystem: globals.$System?.trusted === true || context.trustedSystem === true,
    companyId: executionContext?.companyId ?? context.companyId ?? null,
    storeId: executionContext?.storeId ?? context.storeId ?? null,
    tillId: executionContext?.tillId ?? context.tillId ?? null,
    userId: executionContext?.userId ?? context.userId ?? null,
    record: globals.$Record ?? context.record ?? null,
    previousRecord: globals.$RecordPrior ?? context.previousRecord ?? null,
  };
}
