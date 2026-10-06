import { evaluateCondition } from "./platformConditions.js";
import { isSafeIdentifier } from "./platformIdentifiers.js";
import { evaluateWorkflowFormula } from "./platformFormula.js";
import { createWorkflowRun, executeWorkflowActions, workflowResultsContainStatus } from "./platformWorkflow.js";
import { systemObject, isExtensionField } from "./platformSystemObjects.js";

function apiRecord(fields, record) {
  const result = { ...(record || {}) };
  for (const field of fields) {
    if (result[field.api_name] === undefined && field.source_column && record?.[field.source_column] !== undefined) {
      result[field.api_name] = record[field.source_column];
    }
  }
  return result;
}

export function normalizeStartFormula(expression) {
  let value = String(expression || "").trim();
  value = value
    .replace(/\{!\s*\$Record__Prior\.([A-Za-z_][A-Za-z0-9_]*)\s*\}/g, "Prior_$1")
    .replace(/\{!\s*\$Record\.([A-Za-z_][A-Za-z0-9_]*)\s*\}/g, "Record_$1")
    .replace(/\$Record__Prior\.([A-Za-z_][A-Za-z0-9_]*)/g, "Prior_$1")
    .replace(/\$Record\.([A-Za-z_][A-Za-z0-9_]*)/g, "Record_$1")
    .replace(/ISCHANGED\s*\(\s*Record_([A-Za-z_][A-Za-z0-9_]*)\s*\)/gi, "Changed_$1")
    .replace(/PRIORVALUE\s*\(\s*Record_([A-Za-z_][A-Za-z0-9_]*)\s*\)/gi, "Prior_$1")
    .replace(/\bISNEW\s*\(\s*\)/gi, "IsNew")
    .replace(/\bTRUE\b/gi, "true")
    .replace(/\bFALSE\b/gi, "false")
    .replace(/<>/g, "!=")
    .replace(/(?<![<>=!])=(?!=)/g, "==");
  return value;
}

export function startFormulaInputs(fields, record, previousRecord) {
  const inputs = {
    IsNew: !previousRecord,
    Record_id: record?.id ?? null,
    Prior_id: previousRecord?.id ?? null,
    Changed_id: (record?.id ?? null) !== (previousRecord?.id ?? null),
  };
  for (const field of fields || []) {
    if (!field?.api_name) continue;
    const current = record?.[field.api_name] !== undefined ? record[field.api_name] : field.source_column ? record?.[field.source_column] : undefined;
    const prior = previousRecord?.[field.api_name] !== undefined ? previousRecord[field.api_name] : field.source_column ? previousRecord?.[field.source_column] : undefined;
    inputs["Record_" + field.api_name] = current ?? null;
    inputs["Prior_" + field.api_name] = prior ?? null;
    inputs["Changed_" + field.api_name] = JSON.stringify(current ?? null) !== JSON.stringify(prior ?? null);
  }
  return inputs;
}

function ruleMatches(rule, fields, record, previousRecord) {
  const formula = String(rule.action?.entryFormula || "").trim();
  if (formula) {
    const result = evaluateWorkflowFormula(normalizeStartFormula(formula), startFormulaInputs(fields, record, previousRecord));
    return result === true;
  }
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (!conditions.length) return true;
  return evaluateCondition({
    match: rule.action?.match || "all",
    conditionLogic: rule.action?.conditionLogic || rule.action?.customConditionLogic || "",
    conditions,
  }, fields, record, previousRecord);
}

function workflowRecordSnapshot(fields = [], record = null) {
  if (!record || typeof record !== "object") return null;
  const snapshot = {};
  if (record.id !== undefined) snapshot.id = record.id;
  for (const field of fields || []) {
    if (!field || field.active === false || field.readable === false || !field.api_name) continue;
    const value = record[field.api_name] !== undefined ? record[field.api_name] : field.source_column ? record[field.source_column] : undefined;
    if (value !== undefined) snapshot[field.api_name] = value;
  }
  return snapshot;
}

export async function executePlatformAutomations({ db, object, fields, record, previousRecord = null, recordId, trigger, req, writeExtension }) {
  if (!req || req._platformAutomationDepth > 0) return { record, messages: [], executions: [] };
  const allowedTriggers = new Set(["after_create", "after_update", "after_save", "before_save", "before_create", "before_update", "field_changed", "before_delete", "after_delete"]);
  if (!allowedTriggers.has(trigger)) return { record, messages: [], executions: [] };
  req._platformAutomationDepth = (req._platformAutomationDepth || 0) + 1;
  try {
  let rules;
  try {
    rules = await db(
      `SELECT * FROM platform_rules
        WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)
          AND (
            trigger_key=$3
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
  let nextRecord = apiRecord(fields, record);
  const prior = apiRecord(fields, previousRecord);

  for (const rule of rules.rows) {
    const currentMatches = ruleMatches(rule, fields, nextRecord, prior);
    if (!currentMatches) continue;

    const entryTransition = String(rule.action?.entryTransition || "EVERY_TIME").toUpperCase();
    if (entryTransition === "UPDATED_TO_MEET") {
      const updateTrigger = ["after_update","before_update","field_changed","before_save"].includes(trigger);
      if (!updateTrigger || !previousRecord) continue;
      const previousMatches = ruleMatches(rule, fields, prior, prior);
      if (previousMatches) continue;
    }

    if (rule.action?.type === "workflow") {
      const workflowActions = Array.isArray(rule.action.actions) ? rule.action.actions : [];
      if (!workflowActions.length) {
        executions.push({ ruleId: rule.id, action: "workflow", status: "skipped", reason: "Workflow has no actions" });
        continue;
      }
      const workflowVariables = { variables: {}, steps: {} };
      const run = await createWorkflowRun({
        db,
        companyId: req.user.companyId,
        workflowId: rule.id,
        workflowName: rule.name,
        workflowVersion: Number(rule.active_version || rule.version || 1),
        objectId: object.id,
        recordId,
        triggerKey: trigger,
        status: "RUNNING",
        metadata: {
          actorUserId: req.user.id || null,
          storeId: req.user.storeId || null,
          tillId: req.user.tillId || null,
          entryTransition,
          initialVariables: workflowVariables,
          initialPreviousRecord: workflowRecordSnapshot(fields, previousRecord),
        },
      });
      try {
        const workflowResults = await executeWorkflowActions({
          actions: workflowActions,
          db,
          object,
          fields,
          record: nextRecord,
          previousRecord: prior,
          recordId,
          trigger,
          req,
          companyId: req.user.companyId,
          runId: run?.id || null,
          workflowVersion: Number(rule.active_version || rule.version || 1),
          workflowVariables,
        });
        const waiting = workflowResultsContainStatus(workflowResults, "waiting");
        if (run?.id && !waiting) {
          await db(
            "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3",
            [JSON.stringify({ childResults: workflowResults, finalVariables: workflowVariables }), run.id, req.user.companyId]
          );
        }
        executions.push({ ruleId: rule.id, action: "workflow", status: waiting ? "waiting" : "completed", runId: run?.id || null, details: workflowResults });
      } catch (error) {
        if (run?.id) {
          await db(
            "UPDATE platform_workflow_runs SET status='FAILED',completed_at=NOW(),error_text=$1,metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=NOW() WHERE id=$3 AND company_id=$4",
            [String(error?.message || error).slice(0,2000), JSON.stringify({ finalVariables: workflowVariables }), run.id, req.user.companyId]
          );
        }
        throw error;
      }
      continue;
    }

    const actions = Array.isArray(rule.action?.actions) ? rule.action.actions : [rule.action];
    for (const action of actions) {
      if (action.type === "workflow") {
        const nestedActions = Array.isArray(action.actions) ? action.actions : [];
        if (!nestedActions.length) {
          executions.push({ ruleId: rule.id, action: action.type, status: "skipped", reason: "Nested workflow has no actions" });
          continue;
        }
        const workflowVariables = { variables: {}, steps: {} };
        const run = await createWorkflowRun({
          db,
          companyId: req.user.companyId,
          workflowId: rule.id,
          workflowName: rule.name || "Workflow",
          workflowVersion: Number(rule.active_version || rule.version || 1),
          objectId: object.id,
          recordId,
          triggerKey: trigger,
          status: "RUNNING",
          metadata: {
            legacyNestedWorkflow: true,
            actorUserId: req.user.id || null,
            storeId: req.user.storeId || null,
            tillId: req.user.tillId || null,
            initialVariables: workflowVariables,
            initialPreviousRecord: workflowRecordSnapshot(fields, previousRecord),
          },
        });
        try {
          const workflowResults = await executeWorkflowActions({
            actions: nestedActions,
            db,
            object,
            fields,
            record: nextRecord,
            previousRecord: prior,
            recordId,
            trigger,
            req,
            companyId: req.user.companyId,
            runId: run?.id || null,
            workflowVersion: Number(rule.active_version || rule.version || 1),
            workflowVariables,
          });
          const waiting = workflowResultsContainStatus(workflowResults, "waiting");
          if (run?.id && !waiting) {
            await db(
              "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3",
              [JSON.stringify({ childResults: workflowResults, finalVariables: workflowVariables }), run.id, req.user.companyId]
            );
          }
          executions.push({ ruleId: rule.id, action: action.type, status: waiting ? "waiting" : "completed", runId: run?.id || null, details: workflowResults });
        } catch (error) {
          if (run?.id) {
            await db(
              "UPDATE platform_workflow_runs SET status='FAILED',completed_at=NOW(),error_text=$1,metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=NOW() WHERE id=$3 AND company_id=$4",
              [String(error?.message || error).slice(0,2000), JSON.stringify({ finalVariables: workflowVariables }), run.id, req.user.companyId]
            );
          }
          throw error;
        }
        continue;
      }
      if (action.type === "show_message") {
        if (typeof action.message === "string" && action.message.trim()) messages.push(action.message.trim());
        executions.push({ ruleId: rule.id, action: action.type, status: "completed" });
        continue;
      }
      if (["SEND_EMAIL", "SEND_SMS", "SEND_WHATSAPP", "CALL_WEBHOOK", "HTTP_REQUEST"].includes(action.type)) {
        const idempotencyKey = `${rule.id}:${recordId}:${executions.length}:${action.type}`;
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
    req._platformAutomationDepth -= 1;
  }
}
