export const DEFAULT_PLATFORM_GOVERNOR_LIMITS = Object.freeze({
  maxRuntimeMs: 30000,
  maxWorkflowSteps: 100,
  maxQueries: 200,
  maxExternalActions: 25,
  maxSubflowDepth: 8,
  maxSubflowInvocations: 25,
  maxQueuedJobs: 100,
  maxPayloadBytes: 1024 * 1024,
  maxBulkItems: 1000,
  maxBulkConcurrency: 8,
  maxTenantConcurrentJobs: 10,
});

export class PlatformGovernorError extends Error {
  constructor(message, { code = "PLATFORM_GOVERNOR_LIMIT", status = 429, limit = null, actual = null, metric = null } = {}) {
    super(message);
    this.name = "PlatformGovernorError";
    this.code = code;
    this.status = status;
    this.limit = limit;
    this.actual = actual;
    this.metric = metric;
  }
}

function byteLength(value) {
  if (value == null) return 0;
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

export function createGovernorBudget({ limits = {}, startedAt = Date.now(), counters = {} } = {}) {
  const effective = { ...DEFAULT_PLATFORM_GOVERNOR_LIMITS, ...(limits || {}) };
  const nonNegative = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
  const positiveLimit = (key) => {
    const value = Number(effective[key]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new PlatformGovernorError(`${key} must be a positive finite limit`, {
        code: "GOVERNOR_LIMIT_CONFIGURATION_INVALID",
        status: 500,
        metric: key,
        actual: effective[key],
      });
    }
    effective[key] = value;
  };
  for (const key of Object.keys(DEFAULT_PLATFORM_GOVERNOR_LIMITS)) positiveLimit(key);

  const state = {
    startedAt,
    counters: {
      workflowSteps: nonNegative(counters.workflowSteps),
      queries: nonNegative(counters.queries),
      externalActions: nonNegative(counters.externalActions),
      subflowInvocations: nonNegative(counters.subflowInvocations),
      queuedJobs: nonNegative(counters.queuedJobs),
      bulkItems: nonNegative(counters.bulkItems),
    },
  };

  const fail = (metric, limit, actual, code) => {
    throw new PlatformGovernorError(`${metric} limit exceeded`, { metric, limit, actual, code });
  };
  return {
    limits: effective,
    state,
    checkRuntime() {
      const elapsed = Date.now() - state.startedAt;
      if (elapsed > effective.maxRuntimeMs) fail("runtimeMs", effective.maxRuntimeMs, elapsed, "GOVERNOR_RUNTIME_LIMIT");
      return elapsed;
    },
    consumeWorkflowStep(count = 1) {
      this.checkRuntime();
      const delta = nonNegative(count);
      state.counters.workflowSteps += delta;
      if (state.counters.workflowSteps > effective.maxWorkflowSteps) {
        fail("workflowSteps", effective.maxWorkflowSteps, state.counters.workflowSteps, "GOVERNOR_WORKFLOW_STEP_LIMIT");
      }
      return state.counters.workflowSteps;
    },
    consumeQuery(count = 1) {
      this.checkRuntime();
      const delta = nonNegative(count);
      state.counters.queries += delta;
      if (state.counters.queries > effective.maxQueries) {
        fail("queries", effective.maxQueries, state.counters.queries, "GOVERNOR_QUERY_LIMIT");
      }
      return state.counters.queries;
    },
    consumeExternalAction(count = 1) {
      this.checkRuntime();
      const delta = nonNegative(count);
      state.counters.externalActions += delta;
      if (state.counters.externalActions > effective.maxExternalActions) {
        fail("externalActions", effective.maxExternalActions, state.counters.externalActions, "GOVERNOR_EXTERNAL_ACTION_LIMIT");
      }
      return state.counters.externalActions;
    },
    consumeSubflow(count = 1) {
      this.checkRuntime();
      const delta = nonNegative(count);
      state.counters.subflowInvocations += delta;
      if (state.counters.subflowInvocations > effective.maxSubflowInvocations) {
        fail("subflowInvocations", effective.maxSubflowInvocations, state.counters.subflowInvocations, "GOVERNOR_SUBFLOW_INVOCATION_LIMIT");
      }
      return state.counters.subflowInvocations;
    },
    checkSubflowDepth(depth) {
      this.checkRuntime();
      if (Number(depth || 0) > effective.maxSubflowDepth) {
        fail("subflowDepth", effective.maxSubflowDepth, Number(depth || 0), "GOVERNOR_SUBFLOW_DEPTH_LIMIT");
      }
      return depth;
    },
    consumeQueuedJob(count = 1) {
      this.checkRuntime();
      const delta = nonNegative(count);
      state.counters.queuedJobs += delta;
      if (state.counters.queuedJobs > effective.maxQueuedJobs) {
        fail("queuedJobs", effective.maxQueuedJobs, state.counters.queuedJobs, "GOVERNOR_JOB_LIMIT");
      }
      return state.counters.queuedJobs;
    },
    checkPayload(value) {
      this.checkRuntime();
      const bytes = byteLength(value);
      if (bytes > effective.maxPayloadBytes) {
        fail("payloadBytes", effective.maxPayloadBytes, bytes, "GOVERNOR_PAYLOAD_LIMIT");
      }
      return bytes;
    },
    checkBulk({ items, concurrency }) {
      this.checkRuntime();
      const itemCount = Array.isArray(items) ? items.length : Number(items || 0);
      const width = Number(concurrency || 1);
      state.counters.bulkItems += itemCount;
      if (state.counters.bulkItems > effective.maxBulkItems) {
        fail("bulkItems", effective.maxBulkItems, state.counters.bulkItems, "GOVERNOR_BULK_ITEM_LIMIT");
      }
      if (width > effective.maxBulkConcurrency) {
        fail("bulkConcurrency", effective.maxBulkConcurrency, width, "GOVERNOR_BULK_CONCURRENCY_LIMIT");
      }
      return { itemCount, concurrency: width };
    },
    snapshot() {
      return {
        startedAt: state.startedAt,
        elapsedMs: Date.now() - state.startedAt,
        counters: { ...state.counters },
        limits: { ...effective },
      };
    },
  };
}

export async function assertTenantJobCapacity({ db, companyId, limit = DEFAULT_PLATFORM_GOVERNOR_LIMITS.maxTenantConcurrentJobs }) {
  if (!db || !companyId) return true;
  const result = await db(
    `SELECT COUNT(*)::int AS running
       FROM platform_action_jobs
      WHERE company_id=$1 AND status='RUNNING'
        AND (locked_until IS NULL OR locked_until > NOW())`,
    [companyId]
  );
  const running = Number(result.rows?.[0]?.running || 0);
  if (running >= limit) {
    throw new PlatformGovernorError("tenantConcurrentJobs limit exceeded", {
      metric: "tenantConcurrentJobs",
      limit,
      actual: running,
      code: "GOVERNOR_TENANT_CONCURRENCY_LIMIT",
    });
  }
  return true;
}
