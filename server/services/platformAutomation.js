import { randomUUID } from "node:crypto";
import { evaluateCondition } from "./platformConditions.js";
import { isSafeIdentifier } from "./platformMetadata.js";
import { executeWorkflowActions } from "./platformWorkflow.js";
import { systemObject, isExtensionField } from "./platformSystemObjects.js";
import { createPlatformExecutionContext } from "./platformExecutionContext.js";
import { createExecutionGuard } from "./platformExecutionGuard.js";

function apiRecord(fields, record) {
  const result = { ...(record || {}) };
  for (const field of fields) {
    if (result[field.api_name] === undefined && field.source_column && record?.[field.source_column] !== undefined) {
      result[field.api_name] = record[field.source_column];
    }
  }
  return result;
}

function ruleMatches(rule, fields, record, previousRecord) {
  return evaluateCondition({
    match: rule.action?.match || "all",
    conditions: rule.conditions,
  }, fields, record, previousRecord);
}

export async function executePlatformAutomations({ db, object, fields, record, previousRecord = null, recordId, trigger, req, writeExtension, mutateField }) {
  if (!req) return { record, messages: [], executions: [] };
  const allowedTriggers = new Set(["after_create", "after_update", "after_save", "before_save", "before_create", "before_update", "field_changed", "before_delete", "after_delete"]);
  if (!allowedTriggers.has(trigger)) return { record, messages: [], executions: [] };

  const parentGuard = req._platformAutomationGuard || createExecutionGuard({ maxDepth: 8 });
  const identity = `automation:${object?.id || object?.object_key || "object"}:${recordId || record?.id || "new"}:${trigger}`;
  let guard;
  try {
    guard = parentGuard.enter(identity);
  } catch (error) {
    if (error?.code === "EXECUTION_RECURSION_DETECTED") {
      return { record, messages: [], executions: [{ action: "AUTOMATION", status: "skipped", reason: "recursive_execution", identity }] };
    }
    throw error;
  }
  req._platformAutomationGuard = guard;
  try {
  let rules;
  try {
    rules = await db(
      `SELECT * FROM platform_rules
        WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)
          AND (
            trigger_key=$3
            OR ($3 IN ('before_create','before_update') AND trigger_key='before_save')
            OR ($3 IN ('after_create','after_update') AND trigger_key='after_save')
            OR ($3='after_update' AND trigger_key='field_changed')
          )
        ORDER BY id`,
      [object.id, req.user.companyId, trigger]
    );
  } catch (error) {
    if (error.code) throw error;
    console.warn("Platform automation rules are unavailable; record saved without after-save automation.");
    return { record, messages: [], executions: [] };
  }
  const messages = [];
  const executions = [];
  const preSave = ["before_create", "before_update", "before_save"].includes(trigger);
  let nextRecord = apiRecord(fields, record);
  const prior = apiRecord(fields, previousRecord);

  for (const rule of rules.rows) {
    if (!ruleMatches(rule, fields, nextRecord, prior)) continue;
    const actions = Array.isArray(rule.action?.actions) ? rule.action.actions : [rule.action];
    for (const action of actions) {
      if (preSave && !["set_field", "show_message"].includes(action.type)) {
        executions.push({ ruleId: rule.id, action: action.type || "unknown", status: "skipped", reason: "Before-save automation is mutation-only" });
        continue;
      }
      if (action.type === "workflow") {
        const executionContext = await createPlatformExecutionContext({
          db,
          req,
          object,
          record: nextRecord,
          previousRecord: prior,
          trigger: {
            type: trigger,
            operation: trigger.includes("create") ? "create" : trigger.includes("delete") ? "delete" : "update",
          },
          executionContext: req.platformExecutionContext || req.executionContext || null,
        });
        const workflowResults = await executeWorkflowActions({
          actions: action.actions || [],
          db,
          object,
          fields,
          record: nextRecord,
          previousRecord: prior,
          recordId,
          trigger,
          req,
          companyId: req.user.companyId,
          executionContext,
        });
        executions.push({ ruleId: rule.id, action: action.type, status: "completed", details: workflowResults });
        continue;
      }
      if (action.type === "show_message") {
        if (typeof action.message === "string" && action.message.trim()) messages.push(action.message.trim());
        executions.push({ ruleId: rule.id, action: action.type, status: "completed" });
        continue;
      }
      if (["SEND_EMAIL", "SEND_SMS", "SEND_WHATSAPP", "CALL_WEBHOOK", "HTTP_REQUEST"].includes(action.type)) {
        const requestExecutionKey = req.headers?.["x-idempotency-key"]
          || req.headers?.["x-request-id"]
          || req.executionContext?.globals?.$Request?.correlationId
          || req._platformAutomationExecutionId
          || randomUUID();
        req._platformAutomationExecutionId ||= requestExecutionKey;
        const idempotencyKey = `${requestExecutionKey}:${rule.id}:${recordId || "new"}:${executions.length}:${action.type}`;
        const jobAction = {
          type: action.type,
          templateId: action.templateId || null,
          recipient: action.recipient || null,
          connectorId: action.connectorId || null,
          endpoint: action.endpoint || null,
          method: action.method || null,
        };
        await db(
          "INSERT INTO platform_action_jobs (company_id,kind,payload,status,attempts,next_attempt_at,idempotency_key) VALUES ($1,$2,$3::jsonb,'PENDING',0,NOW(),$4) ON CONFLICT (company_id,idempotency_key) DO NOTHING",
          [req.user.companyId, action.type, JSON.stringify({ ruleId: rule.id, objectId: object.id, recordId, action: jobAction }), idempotencyKey]
        );
        executions.push({ ruleId: rule.id, action: action.type, status: "queued" });
        continue;
      }
      if (action.type !== "set_field") {
        executions.push({ ruleId: rule.id, action: action.type || "unknown", status: "skipped" });
        continue;
      }
      const field = fields.find((candidate) => candidate.api_name === action.field && candidate.active !== false);
      if (field && field.writable !== false && typeof mutateField === "function") {
        nextRecord = await mutateField(field, action.value, nextRecord);
        executions.push({ ruleId: rule.id, action: action.type, field: action.field, status: "completed", mode: "in_memory" });
        continue;
      }
      if (field && isExtensionField(field) && field.writable !== false && writeExtension) {
        nextRecord = await writeExtension(field, action.value, nextRecord);
        executions.push({ ruleId: rule.id, action: action.type, field: action.field, status: "completed" });
        continue;
      }
      if (systemObject(object)) {
        executions.push({ ruleId: rule.id, action: action.type, status: "skipped", reason: "Business fields require their domain operation" });
        continue;
      }
      if (!field || field.writable === false || !field.source_column || !isSafeIdentifier(field.source_column) || ["id", "company_id", "store_id"].includes(field.source_column)) {
        executions.push({ ruleId: rule.id, action: action.type, status: "skipped", reason: "Field is not writable or safely mapped" });
        continue;
      }
      const params = [action.value, recordId];
      const clauses = ["id=$2"];
      if (object.company_scoped) { params.push(req.user.companyId); clauses.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { params.push(req.user.storeId); clauses.push(`store_id=$${params.length}`); }
      const result = await db(
        `UPDATE "${object.source_table}" SET "${field.source_column}"=$1 WHERE ${clauses.join(" AND ")} RETURNING "${field.source_column}" AS "${field.api_name}"`,
        params
      );
      if (result.rows.length) {
        nextRecord = { ...nextRecord, ...result.rows[0] };
        executions.push({ ruleId: rule.id, action: action.type, field: action.field, status: "completed" });
      } else executions.push({ ruleId: rule.id, action: action.type, status: "skipped", reason: "Record not found in tenant scope" });
    }
  }

  try {
    for (const execution of executions) {
      await db("INSERT INTO platform_automation_logs (rule_id,object_id,record_id,company_id,trigger,status,details) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)", [execution.ruleId, object.id, recordId, req.user.companyId, trigger, execution.status, JSON.stringify(execution)]);
    }
  } catch (error) {
    if (error.code) throw error;
    console.warn("Platform automation history is unavailable; returning execution details without persisted logs.");
  }
  return { record: nextRecord, messages, executions };
  } finally {
    req._platformAutomationGuard = parentGuard;
  }
}
