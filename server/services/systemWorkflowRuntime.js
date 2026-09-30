import { randomUUID } from "node:crypto";
import { ensureSystemWorkflowCatalog } from "./systemWorkflowCatalog.js";
import { createWorkflowRun, executeWorkflowActions } from "./platformWorkflow.js";

function safeSource(req, source = null) {
  return {
    type: source?.type || "api",
    method: source?.method || req?.method || null,
    path: source?.path || req?.originalUrl || req?.path || null,
    capability: source?.capability || null,
  };
}

function runtimeAction(action, capabilityType, runtimeInput = {}) {
  if (!action || typeof action !== "object") return action;
  if (capabilityType === "function" && action.type === "CALL_FUNCTION") {
    return { ...action, inputs: { ...(action.inputs || {}), ...(runtimeInput || {}) } };
  }
  if (action.systemTemplate === true) {
    return { ...action, ...(runtimeInput || {}) };
  }
  return action;
}

export async function executeSystemWorkflow({
  db,
  companyId,
  userId = null,
  systemKey,
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
  if (!systemKey) throw new Error("System workflow key is required");

  await ensureSystemWorkflowCatalog({ db, companyId, userId });

  const workflowResult = await db(
    `SELECT * FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey'=$2
        AND active=TRUE
        AND lifecycle_status='ACTIVE'
      LIMIT 1`,
    [companyId, systemKey]
  );
  const workflow = workflowResult.rows[0];
  if (!workflow) {
    const error = new Error(`System workflow "${systemKey}" is unavailable or inactive`);
    error.code = "SYSTEM_WORKFLOW_UNAVAILABLE";
    error.status = 409;
    throw error;
  }

  const correlationId = String(
    req?.headers?.["x-request-id"]
      || req?.headers?.["x-correlation-id"]
      || randomUUID()
  );
  const sourceInfo = safeSource(req, source);
  const capabilityType = workflow.action?.capabilityType || null;
  const capabilityKey = workflow.action?.capabilityKey || null;
  const actions = (workflow.action?.actions || []).map((action) =>
    runtimeAction(action, capabilityType, input)
  );

  const run = await createWorkflowRun({
    db,
    companyId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    objectId: object?.id || workflow.object_id || null,
    recordId: recordId || record?.id || null,
    triggerKey: workflow.trigger_key || "system",
    status: "RUNNING",
    metadata: {
      systemKey,
      capabilityType,
      capabilityKey,
      actorUserId: userId || req?.user?.id || null,
      storeId: storeId || req?.user?.storeId || null,
      tillId: tillId || req?.user?.tillId || null,
      correlationId,
      source: sourceInfo,
    },
  });

  try {
    const results = await executeWorkflowActions({
      actions,
      db,
      req,
      companyId,
      object,
      record,
      recordId: recordId || record?.id || null,
      storeId: storeId || req?.user?.storeId || null,
      tillId: tillId || req?.user?.tillId || null,
      connectorDrivers,
      writeAudit,
      actorUserId: userId || req?.user?.id || null,
      runId: run?.id || null,
      trigger: workflow.trigger_key || "system",
      ...extraContext,
    });
    await db(
      "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
      [run.id, companyId]
    );
    return { runId: run.id, correlationId, results, result: results.at(-1)?.result ?? null };
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
