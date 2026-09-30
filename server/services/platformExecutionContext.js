import { randomUUID } from "node:crypto";

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

async function loadPermissions(db, user) {
  if (!db || typeof db !== "function" || !user?.roleId) return Object.freeze({});
  const result = await db(
    `SELECT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=$1`,
    [user.roleId]
  );
  return deepFreeze(permissionTree((result.rows || []).map((row) => row.code)));
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
} = {}) {
  const reqUser = req?.user || {};
  const inherited = executionContext?.globals || executionContext || {};
  const inheritedCompany = inherited.$Company?.id || inherited.companyId || null;
  const authoritativeCompanyId = reqUser.companyId || inheritedCompany || companyId || null;

  let persistedUser = null;
  const actorId = userId || reqUser.id || inherited.$User?.id || null;
  if (db && typeof db === "function" && actorId && authoritativeCompanyId && !reqUser.roleId && !inherited.$User?.roleId) {
    try {
      const result = await db(
        `SELECT id,company_id,store_id,role_id,is_superadmin
           FROM users
          WHERE id=$1 AND company_id=$2
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
          isSuperadmin: row.is_superadmin === true,
        };
      }
    } catch {
      persistedUser = null;
    }
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
    ...(safeObject(persistedUser) || {}),
    ...(safeObject(reqUser) || {}),
    id: actorId,
    companyId: authoritativeCompanyId,
  }) || {};
  const permissions = actor.roleId
    ? await loadPermissions(db, actor)
    : Object.freeze({ ...(inherited.$Permission || {}) });

  const startedAt = executionTimestamp(inherited.$Flow?.startedAt);
  const correlationId = request?.correlationId
    || req?.businessCommandCorrelationId
    || req?.headers?.["x-request-id"]
    || req?.headers?.["x-correlation-id"]
    || inherited.$System?.correlationId
    || randomUUID();

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
      runtime: "OneEngine",
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
  return {
    ...context,
    executionContext,
    globals,
    ...globals,
    companyId: executionContext?.companyId ?? context.companyId ?? null,
    storeId: executionContext?.storeId ?? context.storeId ?? null,
    tillId: executionContext?.tillId ?? context.tillId ?? null,
    userId: executionContext?.userId ?? context.userId ?? null,
    record: globals.$Record ?? context.record ?? null,
    previousRecord: globals.$RecordPrior ?? context.previousRecord ?? null,
  };
}
