import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowInputContract, parseWorkflowInputs } from '../shared/workflowInputs.js';
import { nativeRuntimeAction } from '../src/pages/developer/builder2Runtime.js';
import { executeWorkflowActions, getWorkflowActionDefinition } from '../server/services/platformWorkflow.js';

test('saved legacy input resources become typed, deduplicated test inputs', () => {
  const resources = [{ apiName: 'productInput', type: 'Variable', dataType: 'Record', availableInput: true }, { value: 'lines', type: 'Variable', isCollection: true, availableInput: true }, { value: 'private', type: 'Variable', dataType: 'Text' }];
  const contract = workflowInputContract([{ name: 'productInput', type: 'record', required: true }], resources);
  assert.deepEqual(contract.map(x => [x.name, x.type]), [['productInput', 'record'], ['lines', 'collection']]);
  const inputs = parseWorkflowInputs(contract, { productInput: '{"name":"Product","price":0}', lines: '[]' });
  assert.deepEqual(inputs.productInput, { name: 'Product', price: 0 });
  assert.deepEqual(inputs.lines, []);
  assert.throws(() => parseWorkflowInputs(contract, { productInput: '[]' }), /JSON object/);
  assert.throws(() => parseWorkflowInputs(contract, { productInput: '' }), /required input/);
});

test('record and collection create modes compile to supported core actions', () => {
  for (const [mode, key] of [['record', 'recordResource'], ['collection', 'recordCollectionResource']]) {
    const action = nativeRuntimeAction({ type: 'CREATE_RECORDS', config: { objectKey: 'product', valueMode: mode, sourceRecord: 'productInput' } });
    assert.deepEqual(action[key], { path: 'variables.productInput' });
    assert.doesNotThrow(() => getWorkflowActionDefinition('CREATE_RECORD').validation(action));
  }
  assert.throws(() => nativeRuntimeAction({ type: 'CREATE_RECORDS', config: { valueMode: 'record' } }), /choose a record resource/);
});

test('failed database action keeps the original error when execution transaction is aborted', async () => {
  let calls = 0;
  const executionDb = async (query) => {
    if (query.includes('FROM role_permissions')) return { rows: [{ code: 'records.create' }] };
    calls++;
    throw Object.assign(new Error(calls === 1 ? 'null value in column name violates not-null constraint' : 'current transaction is aborted'), { code: calls === 1 ? '23502' : '25P02' });
  };
  const traces = [];
  const traceDb = async (query, params) => { traces.push([query, params]); return { rows: [{ id: 'step-run' }] }; };
  await assert.rejects(executeWorkflowActions({ actions: [{ id: 'create', key: 'CREATE_RECORD', objectKey: 'product', fieldValues: { name: null } }], db: executionDb, traceDb, runId: 'run', companyId: 'company', req: { user: { companyId: 'company', roleId: 'role' }, _workflowEffectivePermissionSets: [] }, debugMode: true }), /null value in column name/);
  assert.ok(traces.some(([query]) => query.includes("status='FAILED'")));
});
