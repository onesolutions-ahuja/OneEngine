export const RECORD_LIFECYCLE_STAGES = Object.freeze([
  "PREPARE",
  "BEFORE_VALIDATE",
  "VALIDATE",
  "BEFORE_SAVE",
  "WRITE",
  "AFTER_SAVE",
  "BEFORE_COMMIT",
  "AFTER_COMMIT",
]);

export const RECORD_DELETE_LIFECYCLE_STAGES = Object.freeze([
  "PREPARE",
  "BEFORE_VALIDATE",
  "VALIDATE",
  "BEFORE_DELETE",
  "WRITE",
  "AFTER_DELETE",
  "BEFORE_COMMIT",
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

function snapshotValue(state, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(state || {}, name) && state[name] !== undefined) return state[name];
  }
  return null;
}

export function synchronizeRecordLifecycleSnapshots(state = {}) {
  const record = snapshotValue(state, ["record", "candidate", "saved"]);
  const recordPrior = snapshotValue(state, ["recordPrior", "previousRecord", "previous"]);
  const resources = {
    ...(state.resources || {}),
    $Record: record,
    $RecordPrior: recordPrior,
    $record: record,
    $recordPrior: recordPrior,
  };
  return { ...state, record, recordPrior, resources };
}

export function withRecordLifecycleSnapshots(state = {}, { record, recordPrior } = {}) {
  return synchronizeRecordLifecycleSnapshots({
    ...state,
    ...(record !== undefined ? { record } : {}),
    ...(recordPrior !== undefined ? { recordPrior } : {}),
  });
}

async function runStage(stage, handler, state, trace) {
  if (typeof handler !== "function") {
    trace.push({ stage, status: "SKIPPED" });
    return synchronizeRecordLifecycleSnapshots(state);
  }
  const startedAt = new Date().toISOString();
  try {
    const result = await handler(synchronizeRecordLifecycleSnapshots(state));
    const next = synchronizeRecordLifecycleSnapshots(result === undefined ? state : result);
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

async function registerOrRunAfterCommit({ afterCommit, state, trace, transaction }) {
  if (typeof afterCommit !== "function") {
    trace.push({ stage: "AFTER_COMMIT", status: "SKIPPED" });
    return synchronizeRecordLifecycleSnapshots(state);
  }
  if (transaction?.afterCommit) {
    const snapshot = synchronizeRecordLifecycleSnapshots(state);
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
    trace.push({ stage: "AFTER_COMMIT", status: "REGISTERED", transactionId: transaction.id || null });
    return snapshot;
  }
  return runStage("AFTER_COMMIT", afterCommit, state, trace);
}

export async function runRecordSaveLifecycle({
  operation,
  initialState = {},
  prepare,
  beforeValidate,
  beforeValidation,
  validate,
  beforeSave,
  write,
  afterSave,
  beforeCommit,
  afterCommit,
  transaction = null,
}) {
  if (!["create", "update"].includes(operation)) throw new Error("Record save lifecycle operation must be create or update");
  const trace = [];
  let state = synchronizeRecordLifecycleSnapshots({ ...initialState, operation, lifecycleTrace: trace });
  state = await runStage("PREPARE", prepare, state, trace);
  state = await runStage("BEFORE_VALIDATE", beforeValidate || beforeValidation, state, trace);
  state = await runStage("VALIDATE", validate, state, trace);
  state = await runStage("BEFORE_SAVE", beforeSave, state, trace);
  state = await runStage("WRITE", write, state, trace);
  state = await runStage("AFTER_SAVE", afterSave, state, trace);
  state = await runStage("BEFORE_COMMIT", beforeCommit, state, trace);
  state = await registerOrRunAfterCommit({ afterCommit, state, trace, transaction });
  return { ...state, lifecycleTrace: trace };
}

export async function runRecordDeleteLifecycle({
  initialState = {},
  prepare,
  beforeValidate,
  beforeValidation,
  validate,
  beforeDelete,
  write,
  afterDelete,
  beforeCommit,
  afterCommit,
  transaction = null,
}) {
  const trace = [];
  let state = synchronizeRecordLifecycleSnapshots({ ...initialState, operation: "delete", lifecycleTrace: trace });
  state = await runStage("PREPARE", prepare, state, trace);
  state = await runStage("BEFORE_VALIDATE", beforeValidate || beforeValidation, state, trace);
  state = await runStage("VALIDATE", validate, state, trace);
  state = await runStage("BEFORE_DELETE", beforeDelete, state, trace);
  state = await runStage("WRITE", write, state, trace);
  state = await runStage("AFTER_DELETE", afterDelete, state, trace);
  state = await runStage("BEFORE_COMMIT", beforeCommit, state, trace);
  state = await registerOrRunAfterCommit({ afterCommit, state, trace, transaction });
  return { ...state, lifecycleTrace: trace };
}
