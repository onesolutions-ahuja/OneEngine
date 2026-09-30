export const RECORD_LIFECYCLE_STAGES = Object.freeze([
  "BEFORE_VALIDATION",
  "VALIDATION",
  "BEFORE_SAVE",
  "WRITE",
  "AFTER_SAVE",
  "AFTER_COMMIT",
]);

export const RECORD_DELETE_LIFECYCLE_STAGES = Object.freeze([
  "BEFORE_VALIDATION",
  "VALIDATION",
  "BEFORE_DELETE",
  "WRITE",
  "AFTER_DELETE",
  "AFTER_COMMIT",
]);

export class RecordLifecycleError extends Error {
  constructor(stage, cause) {
    super(cause?.message || `Record lifecycle failed at ${stage}`);
    this.name = "RecordLifecycleError";
    this.code = cause?.code || "RECORD_LIFECYCLE_FAILED";
    this.status = cause?.status || null;
    this.stage = stage;
    this.cause = cause;
  }
}

async function runStage(stage, handler, state, trace) {
  if (typeof handler !== "function") {
    trace.push({ stage, status: "SKIPPED" });
    return state;
  }
  const startedAt = new Date().toISOString();
  try {
    const result = await handler(state);
    const next = result === undefined ? state : result;
    trace.push({ stage, status: "COMPLETED", startedAt, completedAt: new Date().toISOString() });
    return next;
  } catch (error) {
    trace.push({
      stage,
      status: "FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
      code: error?.code || null,
      message: String(error?.message || error || "Lifecycle stage failed").slice(0, 1000),
    });
    throw new RecordLifecycleError(stage, error);
  }
}

export async function runRecordSaveLifecycle({
  operation,
  initialState = {},
  beforeValidation,
  validate,
  beforeSave,
  write,
  afterSave,
  afterCommit,
  transaction = null,
}) {
  if (!["create", "update"].includes(operation)) throw new Error("Record save lifecycle operation must be create or update");
  const trace = [];
  let state = { ...initialState, operation, lifecycleTrace: trace };
  state = await runStage("BEFORE_VALIDATION", beforeValidation, state, trace);
  state = await runStage("VALIDATION", validate, state, trace);
  state = await runStage("BEFORE_SAVE", beforeSave, state, trace);
  state = await runStage("WRITE", write, state, trace);
  state = await runStage("AFTER_SAVE", afterSave, state, trace);
  if (typeof afterCommit === "function" && transaction?.afterCommit) {
    const snapshot = state;
    transaction.afterCommit(async () => {
      const startedAt = new Date().toISOString();
      try {
        const result = await afterCommit(snapshot);
        trace.push({ stage: "AFTER_COMMIT", status: "COMPLETED", startedAt, completedAt: new Date().toISOString() });
        return result;
      } catch (error) {
        trace.push({
          stage: "AFTER_COMMIT",
          status: "FAILED",
          startedAt,
          completedAt: new Date().toISOString(),
          code: error?.code || null,
          message: String(error?.message || error || "Lifecycle stage failed").slice(0, 1000),
        });
        throw error;
      }
    });
    trace.push({ stage: "AFTER_COMMIT", status: "REGISTERED" });
  } else {
    state = await runStage("AFTER_COMMIT", afterCommit, state, trace);
  }
  return { ...state, lifecycleTrace: trace };
}

export async function runRecordDeleteLifecycle({
  initialState = {},
  beforeValidation,
  validate,
  beforeDelete,
  write,
  afterDelete,
  afterCommit,
  transaction = null,
}) {
  const trace = [];
  let state = { ...initialState, operation: "delete", lifecycleTrace: trace };
  state = await runStage("BEFORE_VALIDATION", beforeValidation, state, trace);
  state = await runStage("VALIDATION", validate, state, trace);
  state = await runStage("BEFORE_DELETE", beforeDelete, state, trace);
  state = await runStage("WRITE", write, state, trace);
  state = await runStage("AFTER_DELETE", afterDelete, state, trace);
  if (typeof afterCommit === "function" && transaction?.afterCommit) {
    const snapshot = state;
    transaction.afterCommit(async () => {
      const startedAt = new Date().toISOString();
      try {
        const result = await afterCommit(snapshot);
        trace.push({ stage: "AFTER_COMMIT", status: "COMPLETED", startedAt, completedAt: new Date().toISOString() });
        return result;
      } catch (error) {
        trace.push({
          stage: "AFTER_COMMIT",
          status: "FAILED",
          startedAt,
          completedAt: new Date().toISOString(),
          code: error?.code || null,
          message: String(error?.message || error || "Lifecycle stage failed").slice(0, 1000),
        });
        throw error;
      }
    });
    trace.push({ stage: "AFTER_COMMIT", status: "REGISTERED" });
  } else {
    state = await runStage("AFTER_COMMIT", afterCommit, state, trace);
  }
  return { ...state, lifecycleTrace: trace };
}
