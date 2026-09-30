import test from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_LIFECYCLE_STAGES,
  RECORD_DELETE_LIFECYCLE_STAGES,
  RecordLifecycleError,
  runRecordSaveLifecycle,
  runRecordDeleteLifecycle,
  withRecordLifecycleSnapshots,
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
    prepare: handler("PREPARE"),
    beforeValidate: handler("BEFORE_VALIDATE"),
    validate: handler("VALIDATE"),
    beforeSave: handler("BEFORE_SAVE"),
    write: handler("WRITE"),
    afterSave: handler("AFTER_SAVE"),
    beforeCommit: handler("BEFORE_COMMIT"),
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
    prepare: handler("PREPARE"),
    beforeValidate: handler("BEFORE_VALIDATE"),
    validate: handler("VALIDATE"),
    beforeDelete: handler("BEFORE_DELETE"),
    write: handler("WRITE"),
    afterDelete: handler("AFTER_DELETE"),
    beforeCommit: handler("BEFORE_COMMIT"),
    afterCommit: handler("AFTER_COMMIT"),
  });
  assert.deepEqual(seen, RECORD_DELETE_LIFECYCLE_STAGES);
  assert.deepEqual(result.lifecycleTrace.map((item) => item.stage), RECORD_DELETE_LIFECYCLE_STAGES);
});

test("lifecycle stops on validation failure before write", async () => {
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
      && error.stage === "VALIDATE"
      && error.code === "VALIDATION_FAILED"
      && error.status === 422,
  );
  assert.equal(wrote, false);
});

test("missing optional handlers remain explicit skipped stages", async () => {
  const result = await runRecordSaveLifecycle({
    operation: "create",
    initialState: {},
    write: async (state) => ({ ...state, saved: true }),
  });
  assert.equal(result.saved, true);
  assert.equal(result.lifecycleTrace.length, RECORD_LIFECYCLE_STAGES.length);
  assert.equal(result.lifecycleTrace.find((item) => item.stage === "WRITE").status, "COMPLETED");
  assert.equal(result.lifecycleTrace.find((item) => item.stage === "VALIDATE").status, "SKIPPED");
});

test("legacy beforeValidation alias maps to canonical BEFORE_VALIDATE stage", async () => {
  let called = false;
  const result = await runRecordSaveLifecycle({
    operation: "create",
    beforeValidation: async (state) => {
      called = true;
      return state;
    },
  });
  assert.equal(called, true);
  assert.equal(result.lifecycleTrace.find((item) => item.stage === "BEFORE_VALIDATE").status, "COMPLETED");
});

test("canonical snapshots expose $Record and $RecordPrior resources", async () => {
  const prior = { id: "r1", status: "OPEN" };
  const current = { id: "r1", status: "READY" };
  const state = withRecordLifecycleSnapshots({ operation: "update" }, { record: current, recordPrior: prior });
  assert.equal(state.record, current);
  assert.equal(state.recordPrior, prior);
  assert.equal(state.resources.$Record, current);
  assert.equal(state.resources.$RecordPrior, prior);
  assert.equal(state.resources.$record, current);
  assert.equal(state.resources.$recordPrior, prior);
});

test("before-save mutation becomes the canonical record snapshot before write", async () => {
  const prior = { id: "r1", status: "OPEN" };
  const result = await runRecordSaveLifecycle({
    operation: "update",
    initialState: { previousRecord: prior, record: { id: "r1", status: "OPEN" } },
    beforeSave: async (state) => withRecordLifecycleSnapshots(state, {
      record: { ...state.record, status: "READY" },
      recordPrior: state.recordPrior,
    }),
    write: async (state) => {
      assert.equal(state.resources.$Record.status, "READY");
      assert.equal(state.resources.$RecordPrior.status, "OPEN");
      return { ...state, saved: state.record };
    },
  });
  assert.equal(result.record.status, "READY");
  assert.equal(result.recordPrior.status, "OPEN");
});

test("before-commit failure prevents after-commit execution", async () => {
  let afterCommitRan = false;
  await assert.rejects(
    () => runRecordSaveLifecycle({
      operation: "create",
      write: async (state) => ({ ...state, saved: { id: "r1" } }),
      beforeCommit: async () => {
        throw Object.assign(new Error("commit guard failed"), { code: "COMMIT_GUARD_FAILED" });
      },
      afterCommit: async (state) => {
        afterCommitRan = true;
        return state;
      },
    }),
    (error) => error instanceof RecordLifecycleError && error.stage === "BEFORE_COMMIT",
  );
  assert.equal(afterCommitRan, false);
});
