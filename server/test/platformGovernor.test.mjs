import test from "node:test";
import assert from "node:assert/strict";
import {
  createGovernorBudget,
  PlatformGovernorError,
} from "../services/platformGovernor.js";

function expectGovernor(code, fn) {
  assert.throws(
    fn,
    (error) => error instanceof PlatformGovernorError && error.code === code && error.status === 429,
  );
}

test("workflow step governor enforces shared budget", () => {
  const budget = createGovernorBudget({ limits: { maxWorkflowSteps: 2 } });
  budget.consumeWorkflowStep();
  budget.consumeWorkflowStep();
  expectGovernor("GOVERNOR_WORKFLOW_STEP_LIMIT", () => budget.consumeWorkflowStep());
});

test("query governor enforces query budget", () => {
  const budget = createGovernorBudget({ limits: { maxQueries: 1 } });
  budget.consumeQuery();
  expectGovernor("GOVERNOR_QUERY_LIMIT", () => budget.consumeQuery());
});

test("external action and subflow invocation governors enforce limits", () => {
  const budget = createGovernorBudget({
    limits: { maxExternalActions: 1, maxSubflowInvocations: 1, maxSubflowDepth: 2 },
  });
  budget.consumeExternalAction();
  expectGovernor("GOVERNOR_EXTERNAL_ACTION_LIMIT", () => budget.consumeExternalAction());

  budget.consumeSubflow();
  expectGovernor("GOVERNOR_SUBFLOW_INVOCATION_LIMIT", () => budget.consumeSubflow());

  budget.checkSubflowDepth(2);
  expectGovernor("GOVERNOR_SUBFLOW_DEPTH_LIMIT", () => budget.checkSubflowDepth(3));
});

test("payload governor counts UTF-8 bytes", () => {
  const budget = createGovernorBudget({ limits: { maxPayloadBytes: 4 } });
  budget.checkPayload("1234");
  expectGovernor("GOVERNOR_PAYLOAD_LIMIT", () => budget.checkPayload("12345"));
});

test("bulk governor enforces item and concurrency limits", () => {
  const budget = createGovernorBudget({ limits: { maxBulkItems: 2, maxBulkConcurrency: 2 } });
  budget.checkBulk({ items: [1, 2], concurrency: 2 });

  const itemBudget = createGovernorBudget({ limits: { maxBulkItems: 1 } });
  expectGovernor("GOVERNOR_BULK_ITEM_LIMIT", () => itemBudget.checkBulk({ items: [1, 2], concurrency: 1 }));

  const concurrencyBudget = createGovernorBudget({ limits: { maxBulkConcurrency: 1 } });
  expectGovernor("GOVERNOR_BULK_CONCURRENCY_LIMIT", () => concurrencyBudget.checkBulk({ items: [1], concurrency: 2 }));
});

test("queued job governor enforces shared queue budget", () => {
  const budget = createGovernorBudget({ limits: { maxQueuedJobs: 1 } });
  budget.consumeQueuedJob();
  expectGovernor("GOVERNOR_JOB_LIMIT", () => budget.consumeQueuedJob());
});

test("runtime governor rejects expired execution budget", () => {
  const budget = createGovernorBudget({ limits: { maxRuntimeMs: 10 }, startedAt: Date.now() - 50 });
  expectGovernor("GOVERNOR_RUNTIME_LIMIT", () => budget.checkRuntime());
});

test("snapshot exposes counters and limits for observability", () => {
  const budget = createGovernorBudget({ limits: { maxQueries: 5 } });
  budget.consumeQuery();
  const snapshot = budget.snapshot();
  assert.equal(snapshot.counters.queries, 1);
  assert.equal(snapshot.limits.maxQueries, 5);
  assert.equal(typeof snapshot.elapsedMs, "number");
});
