import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueRecordCreatedWorkflows } from '../server/services/recordCreatedWorkflows.js';

test('direct connector creates dispatch only matching record flows with tenant scope and durable identity', async () => {
  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM platform_objects')) return { rows: [{ id: 'object-1' }] };
    if (sql.includes('FROM platform_fields')) return { rows: [{ api_name: 'direction', source_column: 'direction', field_type: 'text', active: true }] };
    if (sql.includes('FROM platform_rules')) return { rows: [
      { id: 'inbound', trigger_key: 'after_create', conditions: [{ field: 'direction', operator: 'equals', value: 'INBOUND' }], action: { match: 'all' } },
      { id: 'outbound', trigger_key: 'after_create', conditions: [{ field: 'direction', operator: 'equals', value: 'OUTBOUND' }], action: { match: 'all' } },
    ] };
    return { rows: [{ id: 'job-1' }] };
  };
  const jobs = await enqueueRecordCreatedWorkflows({ db, companyId: 'tenant-1', objectKey: 'communication_event', record: { id: 'message-1', direction: 'INBOUND' } });
  assert.equal(jobs.length, 1);
  const job = calls.find(call => call.sql.includes('INSERT INTO platform_action_jobs'));
  const payload = JSON.parse(job.params[2]);
  assert.equal(payload.workflowId, 'inbound');
  assert.equal(payload.eventType, 'after_create');
  assert.equal(payload.recordId, 'message-1');
  assert.equal(payload.record.direction, 'INBOUND');
  assert.equal(job.params[0], 'tenant-1');
  assert.equal(job.params[4], 'record-create-workflow:inbound:message-1');
  assert.match(calls.find(call => call.sql.includes('FROM platform_rules')).sql, /company_id=\$2/);
});

test('unregistered record object does not dispatch a workflow', async () => {
  let count = 0;
  await enqueueRecordCreatedWorkflows({ db: async () => { count++; return { rows: [] }; }, companyId: 'tenant', objectKey: 'missing', record: { id: 'record' } });
  assert.equal(count, 1);
});
