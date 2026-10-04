import { evaluateCondition } from './platformConditions.js';
import { enqueuePlatformJob } from './platformJobs.js';

// Direct connector inserts bypass the metadata CRUD endpoint. Dispatch the
// same after-create definitions, using a durable job rather than blocking a webhook.
export async function enqueueRecordCreatedWorkflows({ db, companyId, objectKey, record }) {
  if (!record?.id) return [];
  const objects = await db(
    `SELECT * FROM platform_objects WHERE object_key=$1 AND active=TRUE
       AND (company_id IS NULL OR company_id=$2)
       ORDER BY company_id NULLS LAST LIMIT 1`, [objectKey, companyId]);
  const object = objects.rows[0];
  if (!object) return [];
  const fields = await db(
    `SELECT * FROM platform_fields WHERE object_id=$1 AND active=TRUE
       AND (company_id IS NULL OR company_id=$2)`, [object.id, companyId]);
  const snapshot = { ...record };
  for (const field of fields.rows) {
    if (field.source_column && snapshot[field.api_name] === undefined) snapshot[field.api_name] = record[field.source_column];
  }
  const rules = await db(
    `SELECT * FROM platform_rules WHERE object_id=$1 AND company_id=$2
       AND active=TRUE AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
       AND trigger_key IN ('after_create','after_save') AND action->>'type'='workflow'
       ORDER BY created_at,id`, [object.id, companyId]);
  const jobs = [];
  for (const rule of rules.rows) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    if (conditions.length && !evaluateCondition({ match: rule.action?.match || 'all', conditions }, fields.rows, snapshot, null)) continue;
    jobs.push(await enqueuePlatformJob({ db, companyId, kind: 'PLATFORM_EVENT_WORKFLOW',
      payload: { workflowId: rule.id, eventId: `record-create:${object.id}:${record.id}`,
        eventType: rule.trigger_key, objectId: object.id, recordId: record.id, record: snapshot },
      idempotencyKey: `record-create-workflow:${rule.id}:${record.id}` }));
  }
  return jobs;
}
