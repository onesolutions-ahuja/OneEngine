import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowFormula } from '../server/services/platformFormula.js';
import { getWorkflowActionDefinition } from '../server/services/platformWorkflow.js';

test('strict customer dates reject rollovers and accept valid leap days', () => {
  assert.equal(evaluateWorkflowFormula('PARSEDATE(reply)', { reply: '29/02/2028' }), '2028-02-29');
  for (const reply of ['31/02/2026', '29/02/2026', '32/01/2026', '01/13/2026', '1/1/2026', '2026-01-01', 'bad']) assert.equal(evaluateWorkflowFormula('PARSEDATE(reply)', { reply }), null);
  assert.equal(evaluateWorkflowFormula('UPPER(TRIM(reply))', { reply: ' appointment ' }), 'APPOINTMENT');
});

test('time windows expand real metadata over a bounded date range', async () => {
  const definition = getWorkflowActionDefinition('TIME_WINDOW_EXPAND');
  const result = await definition.executor({ action: { collection: [{ weekday: 0, start_time: '10:00', end_time: '11:00', slot_interval_minutes: 30 }], date: '2026-10-04', days: 8, durationMinutes: 30 } });
  assert.equal(result.count, 4);
  assert.deepEqual([...new Set(result.collection.map(row => row.date))], ['2026-10-04', '2026-10-11']);
  await assert.rejects(definition.executor({ action: { collection: [], date: '31/02/2026', durationMinutes: 30 } }), /invalid/);
  await assert.rejects(definition.executor({ action: { collection: [], date: '2026-10-04', days: 32, durationMinutes: 30 } }), /between/);
});

test('distinct available dates retain order and never fabricate extra dates', async () => {
  const result = await getWorkflowActionDefinition('COLLECTION_DISTINCT').executor({ action: { collection: [{ date: '2026-10-04', time: '10:00' }, { date: '2026-10-04', time: '11:00' }, { date: '2026-10-06', time: '10:00' }], field: 'date', limit: 2 } });
  assert.equal(result.count, 2);
  assert.deepEqual(result.collection.map(row => row.date), ['2026-10-04', '2026-10-06']);
});

test('collection date comparisons exclude elapsed slots', async () => {
  const result = await getWorkflowActionDefinition('COLLECTION_FILTER').executor({
    action: { collection: [{ startsAt: '2026-10-04T09:00:00Z' }, { startsAt: '2026-10-04T11:00:00Z' }, { startsAt: null }], filters: [{ field: 'startsAt', operator: 'greater_than', value: { path: 'variables.currentTime' } }] },
    workflowVariables: { variables: { currentTime: '2026-10-04T10:00:00Z' } }
  });
  assert.deepEqual(result.collection, [{ startsAt: '2026-10-04T11:00:00Z' }]);
});

test('structured assignments resolve nested session state and selected slot arrays', async () => {
  const workflowVariables = { variables: { slots: [{ date: '2026-10-04', startsAt: '2026-10-04T11:00:00Z' }] } };
  const result = await getWorkflowActionDefinition('ASSIGNMENT').executor({ action: { variableName: 'state', variableType: 'record', value: { step: 'WAITING_FOR_TIME', slots: { path: 'variables.slots' } } }, workflowVariables });
  assert.deepEqual(result.value, { step: 'WAITING_FOR_TIME', slots: workflowVariables.variables.slots });
});
