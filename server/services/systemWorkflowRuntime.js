import { randomUUID } from "node:crypto";
import { ensureSystemWorkflowCatalog } from "./systemWorkflowCatalog.js";
import { createWorkflowRun, executeWorkflowActions, workflowResultsContainStatus } from "./platformWorkflow.js";
import { resolveWorkflowResource } from "./platformRecordPaths.js";

function safeSource(req, source = null) {
  return {
    type: source?.type || "api",
    method: source?.method || req?.method || null,
    path: source?.path || req?.originalUrl || req?.path || null,
    capability: source?.capability || null,
    packageKey: source?.packageKey || null,
    appName: source?.appName || null,
    connectorInstanceId: source?.connectorInstanceId || null,
  };
}

async function resolveSystemWorkflowActor({ db, companyId, userId = null, req = null }) {
  const requestedId = userId || req?.user?.id || null;
  if (requestedId) {
    const preferred = await db(
      `SELECT u.id,u.role_id,u.store_id,NULL::uuid AS till_id
         FROM users u
         JOIN roles r ON r.id=u.role_id
        WHERE u.id=$1 AND u.company_id=$2 AND u.active=true
          AND u.role_id IS NOT NULL
          AND (r.company_id=$2 OR r.company_id IS NULL)
        LIMIT 1`,
      [requestedId, companyId]
    );
    if (preferred.rows[0]) return preferred.rows[0];
  }
  const fallback = await db(
    `SELECT u.id,u.role_id,u.store_id,NULL::uuid AS till_id
       FROM users u
       JOIN roles r ON r.id=u.role_id
      WHERE u.company_id=$1 AND u.active=true
        AND r.api_key='platform_superadmin'
        AND (r.company_id=$1 OR r.company_id IS NULL)
      ORDER BY u.created_at,u.id
      LIMIT 1`,
    [companyId]
  );
  if (!fallback.rows[0]) {
    const error = new Error("System workflow has no active RBAC execution user");
    error.code = "WORKFLOW_RBAC_ACTOR_REQUIRED";
    error.status = 409;
    throw error;
  }
  return fallback.rows[0];
}

function runtimeAction(action, capabilityType, runtimeInput = {}) {
  if (!action || typeof action !== "object") return action;
  if (action.systemTemplate === true) {
    return { ...action, ...(runtimeInput || {}) };
  }
  return action;
}

function systemFlowInputs(contract, supplied) {
  if (!Array.isArray(contract) || !contract.length) return {};
  const allowed = new Set(contract.map((item) => String(item?.name || "")).filter(Boolean));
  const unexpected = Object.keys(supplied).find((name) => !allowed.has(name));
  if (unexpected) throw new Error(`System Flow input "${unexpected}" is not declared`);
  const variables = {};
  for (const item of contract) {
    const name = String(item?.name || "");
    const hasValue = Object.prototype.hasOwnProperty.call(supplied, name);
    const value = hasValue ? supplied[name] : item?.defaultValue;
    if (item?.required === true && (value === undefined || value === null || value === "")) {
      throw new Error(`System Flow input "${item.label || name}" is required`);
    }
    if (value === undefined) continue;
    if (value === null) {
      variables[name] = null;
      continue;
    }
    const type = String(item.type || "text").toLowerCase();
    if (["number", "currency"].includes(type)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error(`System Flow input "${item.label || name}" must be numeric`);
      variables[name] = numeric;
    } else if (type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`System Flow input "${item.label || name}" must be true or false`);
      variables[name] = value;
    } else if (type === "collection") {
      if (!Array.isArray(value)) throw new Error(`System Flow input "${item.label || name}" must be a collection`);
      variables[name] = value;
    } else if (type === "object" || type === "record") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`System Flow input "${item.label || name}" must be an object`);
      variables[name] = value;
    } else {
      variables[name] = String(value);
    }
  }
  return variables;
}

export async function executeSystemWorkflow({
  db,
  companyId,
  userId = null,
  systemKey = null,
  apiName = null,
  req = null,
  input = {},
  object = null,
  record = null,
  recordId = null,
  storeId = null,
  tillId = null,
  connectorDrivers = null,
  writeAudit = null,
  source = null,
  extraContext = {},
}) {
  if (!db || typeof db !== "function") throw new Error("System workflow requires database context");
  if (!companyId) throw new Error("System workflow requires company context");
  if (!systemKey && !apiName) throw new Error("System workflow key or API name is required");

  await ensureSystemWorkflowCatalog({ db, companyId, userId });
  const actor = await resolveSystemWorkflowActor({ db, companyId, userId, req });
  const runtimeReq = {
    ...(req || {}),
    user: {
      ...(req?.user || {}),
      id: actor.id,
      roleId: actor.role_id,
      companyId,
      storeId: storeId || actor.store_id || req?.user?.storeId || null,
      tillId: tillId || actor.till_id || req?.user?.tillId || null,
    },
  };

  const workflowResult = systemKey
    ? await db(
      `SELECT * FROM platform_rules
        WHERE company_id=$1
          AND action->>'systemGenerated'='true'
          AND action->>'systemKey'=$2
          AND active=TRUE
          AND lifecycle_status='ACTIVE'
        LIMIT 1`,
      [companyId, systemKey]
    )
    : await db(
      `SELECT * FROM platform_rules
        WHERE company_id=$1
          AND action->>'apiName'=$2
          AND active=TRUE
          AND lifecycle_status='ACTIVE'
        ORDER BY updated_at DESC,created_at DESC
        LIMIT 1`,
      [companyId, apiName]
    );
  const workflow = workflowResult.rows[0];
  if (!workflow) {
    const error = new Error(`Workflow "${systemKey || apiName}" is unavailable or inactive`);
    error.code = "SYSTEM_WORKFLOW_UNAVAILABLE";
    error.status = 409;
    throw error;
  }

  const correlationId = String(
    req?.businessCommandCorrelationId
      || req?.headers?.["x-request-id"]
      || req?.headers?.["x-correlation-id"]
      || randomUUID()
  );
  const sourceInfo = safeSource(req, source);
  const capabilityType = workflow.action?.capabilityType || (workflow.action?.type === "workflow" ? "workflow" : null);
  const capabilityKey = workflow.action?.capabilityKey || workflow.action?.apiName || apiName || null;
  const actions = (workflow.action?.actions || []).map((action) =>
    runtimeAction(action, capabilityType, input)
  );
  const workflowVariables = {
    variables: capabilityType === "workflow"
      ? systemFlowInputs(workflow.action?.inputContract, input)
      : {},
    steps: {},
  };

  const parentRunId = req?.ensureBusinessCommandRun
    ? await req.ensureBusinessCommandRun({ companyId, userId, storeId, tillId })
    : (req?.businessCommandRunId || null);

  const run = await createWorkflowRun({
    db,
    companyId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowVersion: Number(workflow.active_version || workflow.version || 1),
    objectId: object?.id || workflow.object_id || null,
    recordId: recordId || record?.id || null,
    triggerKey: workflow.trigger_key || "system",
    parentRunId: parentRunId || null,
    status: "RUNNING",
    metadata: {
      systemKey: systemKey || null,
      apiName: workflow.action?.apiName || apiName || null,
      capabilityType,
      capabilityKey,
      actorUserId: actor.id,
      storeId: runtimeReq.user.storeId || null,
      tillId: runtimeReq.user.tillId || null,
      correlationId,
      source: sourceInfo,
      inputNames: Object.keys(workflowVariables.variables),
    },
  });

  try {
    const results = await executeWorkflowActions({
      actions,
      db,
      req: runtimeReq,
      companyId,
      object,
      record,
      recordId: recordId || record?.id || null,
      storeId: runtimeReq.user.storeId || null,
      tillId: runtimeReq.user.tillId || null,
      connectorDrivers,
      writeAudit,
      actorUserId: actor.id,
      runId: run?.id || null,
      workflowVersion: Number(workflow.active_version || workflow.version || 1),
      trigger: workflow.trigger_key || "system",
      workflowVariables,
      ...extraContext,
    });
    const waiting = workflowResultsContainStatus(results, "waiting");
    if (!waiting) {
      await db(
        "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [run.id, companyId]
      );
    }
    let result = results.at(-1)?.result ?? null;
    if (capabilityType === "workflow" && Array.isArray(workflow.action?.outputContract) && workflow.action.outputContract.length) {
      result = {};
      for (const output of workflow.action.outputContract) {
        const name = String(output?.name || "");
        const sourcePath = String(output?.source || `variables.${name}`);
        const value = resolveWorkflowResource(sourcePath, { variables: workflowVariables, record, object, user: runtimeReq.user });
        if (!name || value === undefined) throw new Error(`System Flow output "${output?.label || name}" is unavailable`);
        result[name] = value;
      }
    }
    return { runId: run.id, correlationId, status: waiting ? "WAITING" : "COMPLETED", results, result, workflowVariables };
  } catch (error) {
    await db(
      `UPDATE platform_workflow_runs
          SET status='FAILED',error_text=COALESCE(error_text,$1),completed_at=NOW(),
              metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=NOW()
        WHERE id=$3 AND company_id=$4`,
      [
        String(error?.message || error).slice(0, 2000),
        JSON.stringify({ correlationId, source: sourceInfo }),
        run.id,
        companyId,
      ]
    );
    error.workflowRunId = run.id;
    error.correlationId = correlationId;
    throw error;
  }
}


export async function executeSystemAction({
  db,
  companyId,
  userId = null,
  actionKey,
  req = null,
  input = {},
  object = null,
  record = null,
  recordId = null,
  storeId = null,
  tillId = null,
  connectorDrivers = null,
  writeAudit = null,
  source = null,
  extraContext = {},
}) {
  if (!db || typeof db !== "function") throw new Error("System action requires database context");
  if (!companyId) throw new Error("System action requires company context");
  const normalizedActionKey = String(actionKey || "").trim().toUpperCase();
  if (!normalizedActionKey) throw new Error("System action key is required");

  const actor = await resolveSystemWorkflowActor({ db, companyId, userId, req });
  const runtimeReq = {
    ...(req || {}),
    user: {
      ...(req?.user || {}),
      id: actor.id,
      roleId: actor.role_id,
      companyId,
      storeId: storeId || actor.store_id || req?.user?.storeId || null,
      tillId: tillId || actor.till_id || req?.user?.tillId || null,
    },
  };
  const correlationId = String(
    req?.businessCommandCorrelationId
      || req?.headers?.["x-request-id"]
      || req?.headers?.["x-correlation-id"]
      || randomUUID()
  );
  const sourceInfo = safeSource(req, source);
  const parentRunId = req?.ensureBusinessCommandRun
    ? await req.ensureBusinessCommandRun({ companyId, userId, storeId, tillId })
    : (req?.businessCommandRunId || null);
  const run = await createWorkflowRun({
    db,
    companyId,
    workflowId: null,
    workflowName: `System Action · ${normalizedActionKey}`,
    workflowVersion: 1,
    objectId: object?.id || null,
    recordId: recordId || record?.id || null,
    triggerKey: "system_action",
    parentRunId: parentRunId || null,
    status: "RUNNING",
    metadata: {
      capabilityType: "action",
      capabilityKey: normalizedActionKey,
      actorUserId: actor.id,
      storeId: runtimeReq.user.storeId || null,
      tillId: runtimeReq.user.tillId || null,
      correlationId,
      source: sourceInfo,
    },
  });

  try {
    const workflowVariables = { variables: {}, steps: {} };
    const actions = [{ type: normalizedActionKey, systemTemplate: true, ...(input || {}) }];
    const results = await executeWorkflowActions({
      actions,
      db,
      req: runtimeReq,
      companyId,
      object,
      record,
      recordId: recordId || record?.id || null,
      storeId: runtimeReq.user.storeId || null,
      tillId: runtimeReq.user.tillId || null,
      connectorDrivers,
      writeAudit,
      actorUserId: actor.id,
      runId: run?.id || null,
      workflowVersion: 1,
      trigger: "system_action",
      workflowVariables,
      ...extraContext,
    });
    const waiting = workflowResultsContainStatus(results, "waiting");
    if (!waiting) {
      await db(
        "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [run.id, companyId]
      );
    }
    return {
      runId: run.id,
      correlationId,
      status: waiting ? "WAITING" : "COMPLETED",
      results,
      result: results.at(-1)?.result ?? null,
      workflowVariables,
    };
  } catch (error) {
    await db(
      `UPDATE platform_workflow_runs
          SET status='FAILED',error_text=COALESCE(error_text,$1),completed_at=NOW(),
              metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=NOW()
        WHERE id=$3 AND company_id=$4`,
      [
        String(error?.message || error).slice(0, 2000),
        JSON.stringify({ correlationId, source: sourceInfo }),
        run.id,
        companyId,
      ]
    );
    error.workflowRunId = run.id;
    error.correlationId = correlationId;
    throw error;
  }
}
