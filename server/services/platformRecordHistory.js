import { normalizeTraceEnvelope, PLATFORM_RUNTIME_CONTRACT_VERSION } from "./platformConformance.js";

function valueFor(record, field) {
  if (!record || !field) return null;
  if (Object.prototype.hasOwnProperty.call(record, field.api_name)) return record[field.api_name] ?? null;
  if (field.source_column && Object.prototype.hasOwnProperty.call(record, field.source_column)) return record[field.source_column] ?? null;
  return null;
}

function changed(left, right) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

export async function writePlatformRecordHistory({
  db,
  companyId,
  object,
  recordId,
  fields = [],
  previousRecord = null,
  record = null,
  action,
  actorUserId = null,
  correlationId = null,
  transactionId = null,
  workflowRunId = null,
  eventId = null,
  source = null,
  executionMode = null,
} = {}) {
  if (!db || typeof db !== "function") throw new Error("History database context is required");
  if (!companyId || !object?.id || !object?.object_key || !recordId) return [];
  const normalizedAction = String(action || "").toLowerCase();
  if (!["create","update","delete"].includes(normalizedAction)) throw new Error("Unsupported record history action");

  const trace = normalizeTraceEnvelope({
    correlationId,
    transactionId,
    workflowRunId,
    eventId,
    source,
    executionMode,
    runtimeContractVersion: PLATFORM_RUNTIME_CONTRACT_VERSION,
  });

  const writableFields = (fields || []).filter((field) => field?.api_name && field.active !== false);
  const rows = [];
  for (const field of writableFields) {
    const oldValue = normalizedAction === "create" ? null : valueFor(previousRecord, field);
    const newValue = normalizedAction === "delete" ? null : valueFor(record, field);
    if (normalizedAction === "update" && !changed(oldValue, newValue)) continue;

    const result = await db(
      `INSERT INTO platform_record_history
        (company_id,object_id,object_key,record_id,field_api_name,old_value,new_value,action,actor_user_id,
         correlation_id,transaction_id,workflow_run_id,event_id,source,execution_mode,runtime_contract_version)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        companyId,
        object.id,
        object.object_key,
        recordId,
        field.api_name,
        JSON.stringify(oldValue),
        JSON.stringify(newValue),
        normalizedAction,
        actorUserId || null,
        trace.correlationId,
        trace.transactionId,
        trace.workflowRunId,
        trace.eventId,
        trace.source,
        trace.executionMode,
        trace.runtimeContractVersion,
      ]
    );
    if (result.rows?.[0]) rows.push(result.rows[0]);
  }
  return rows;
}

export function readableHistoryRows(rows = [], fields = []) {
  const readable = new Set((fields || [])
    .filter((field) => field?.api_name && field.active !== false && field.readable !== false)
    .map((field) => field.api_name));
  return (rows || []).filter((row) => !row.field_api_name || readable.has(row.field_api_name));
}
