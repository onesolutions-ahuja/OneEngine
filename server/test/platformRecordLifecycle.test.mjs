import test from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_LIFECYCLE_STAGES,
  RECORD_DELETE_LIFECYCLE_STAGES,
  RecordLifecycleError,
  runRecordSaveLifecycle,
  runRecordDeleteLifecycle,
} from "../services/platformRecordLifecycle.js";

test("save lifecycle executes canonical stage order", async () => {
  const seen = [];
  const handler = (name) => async (state) => {
    seen.push(name);
    return { ...state, [name]: true };
  };
  const result = await runRecordSaveLifecycle({
    operation: "update",
    initialState: { id: "r1" },
    beforeValidation: handler("BEFORE_VALIDATION"),
    validate: handler("VALIDATION"),
    beforeSave: handler("BEFORE_SAVE"),
    write: handler("WRITE"),
    afterSave: handler("AFTER_SAVE"),
    afterCommit: handler("AFTER_COMMIT"),
  });
  assert.deepEqual(seen, RECORD_LIFECYCLE_STAGES);
  assert.deepEqual(result.lifecycleTrace.map((item) => item.stage), RECORD_LIFECYCLE_STAGES);
  assert.equal(result.AFTER_COMMIT, true);
});

test("delete lifecycle executes canonical stage order", async () => {
  const seen = [];
  const handler = (name) => async (state) => {
    seen.push(name);
    return state;
  };
  const result = await runRecordDeleteLifecycle({
    initialState: { id: "r1" },
    beforeValidation: handler("BEFORE_VALIDATION"),
    validate: handler("VALIDATION"),
    beforeDelete: handler("BEFORE_DELETE"),
    write: handler("WRITE"),
    afterDelete: handler("AFTER_DELETE"),
    afterCommit: handler("AFTER_COMMIT"),
  });
  assert.deepEqual(seen, RECORD_DELETE_LIFECYCLE_STAGES);
  assert.deepEqual(result.lifecycleTrace.map((item) => item.stage), RECORD_DELETE_LIFECYCLE_STAGES);
});

test("lifecycle stops on failure and records the failed stage", async () => {
  let wrote = false;
  await assert.rejects(
    () => runRecordSaveLifecycle({
      operation: "create",
      initialState: {},
      validate: async () => {
        const error = new Error("validation failed");
        error.code = "VALIDATION_FAILED";
        error.status = 422;
        throw error;
      },
      write: async (state) => {
        wrote = true;
        return state;
      },
    }),
    (error) => error instanceof RecordLifecycleError
      && error.stage === "VALIDATION"
      && error.code === "VALIDATION_FAILED"
      && error.status === 422,
  );
  assert.equal(wrote, false);
});

test("missing optional handlers are explicit skipped stages", async () => {
  const result = await runRecordSaveLifecycle({
    operation: "create",
    initialState: {},
    write: async (state) => ({ ...state, saved: true }),
  });
  assert.equal(result.saved, true);
  assert.equal(result.lifecycleTrace.length, RECORD_LIFECYCLE_STAGES.length);
  assert.equal(result.lifecycleTrace.find((item) => item.stage === "WRITE").status, "COMPLETED");
  assert.equal(result.lifecycleTrace.find((item) => item.stage === "VALIDATION").status, "SKIPPED");
});


test("after-commit lifecycle handler is deferred when transaction context is supplied", async () => {
  const callbacks = [];
  const transaction = {
    afterCommit(callback) { callbacks.push(callback); },
  };
  let afterCommitRan = false;

  const result = await runRecordSaveLifecycle({
    operation: "create",
    initialState: { id: "r1" },
    write: async (state) => ({ ...state, saved: true }),
    afterCommit: async (state) => {
      afterCommitRan = true;
      return { ...state, delivered: true };
    },
    transaction,
  });

  assert.equal(afterCommitRan, false);
  assert.equal(callbacks.length, 1);
  assert.equal(result.lifecycleTrace.at(-1).status, "REGISTERED");
  await callbacks[0]();
  assert.equal(afterCommitRan, true);
  assert.equal(result.lifecycleTrace.at(-1).status, "COMPLETED");
});
