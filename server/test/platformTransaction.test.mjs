import test from "node:test";
import assert from "node:assert/strict";
import { withPlatformTransaction, PlatformTransactionError } from "../services/platformTransaction.js";

function fakePool({ failCommit = false } = {}) {
  const commands = [];
  let released = false;
  const client = {
    async query(sql) {
      commands.push(String(sql));
      if (failCommit && String(sql) === "COMMIT") throw new Error("commit failed");
      return { rows: [] };
    },
    release() { released = true; },
  };
  return {
    commands,
    get released() { return released; },
    async connect() { return client; },
  };
}

test("transaction commits before after-commit callbacks run", async () => {
  const pool = fakePool();
  const seen = [];
  const tx = await withPlatformTransaction({
    pool,
    handler: async (ctx) => {
      await ctx.query("UPDATE example SET value=1");
      ctx.afterCommit(async () => {
        seen.push("after");
        assert.equal(pool.commands.includes("COMMIT"), true);
      });
      return { ok: true };
    },
  });

  assert.deepEqual(tx.result, { ok: true });
  assert.equal(tx.committed, true);
  assert.deepEqual(seen, ["after"]);
  assert.deepEqual(pool.commands.slice(0, 3), ["BEGIN", "UPDATE example SET value=1", "COMMIT"]);
  assert.equal(pool.released, true);
});

test("transaction rolls back when handler fails and does not run after-commit", async () => {
  const pool = fakePool();
  let afterCommitRan = false;

  await assert.rejects(
    () => withPlatformTransaction({
      pool,
      handler: async (ctx) => {
        ctx.afterCommit(async () => { afterCommitRan = true; });
        throw Object.assign(new Error("boom"), { code: "EXPECTED_FAILURE" });
      },
    }),
    (error) => error instanceof PlatformTransactionError
      && error.code === "EXPECTED_FAILURE"
      && error.phase === "TRANSACTION",
  );

  assert.equal(afterCommitRan, false);
  assert.deepEqual(pool.commands, ["BEGIN", "ROLLBACK"]);
});

test("savepoint rolls back only nested work and leaves outer transaction usable", async () => {
  const pool = fakePool();

  await withPlatformTransaction({
    pool,
    handler: async (ctx) => {
      await assert.rejects(
        () => ctx.savepoint("child-step", async (nested) => {
          await nested.query("UPDATE child SET value=1");
          throw new Error("nested failed");
        }),
        /nested failed/,
      );
      await ctx.query("UPDATE parent SET value=1");
      return true;
    },
  });

  assert.deepEqual(pool.commands, [
    "BEGIN",
    'SAVEPOINT "child_step"',
    "UPDATE child SET value=1",
    'ROLLBACK TO SAVEPOINT "child_step"',
    'RELEASE SAVEPOINT "child_step"',
    "UPDATE parent SET value=1",
    "COMMIT",
  ]);
});

test("after-commit failure is reported without reversing commit", async () => {
  const pool = fakePool();
  const tx = await withPlatformTransaction({
    pool,
    handler: async (ctx) => {
      ctx.afterCommit(async () => { throw Object.assign(new Error("delivery failed"), { code: "DELIVERY_FAILED" }); });
      return true;
    },
  });

  assert.equal(tx.committed, true);
  assert.equal(tx.afterCommit[0].status, "FAILED");
  assert.equal(tx.afterCommit[0].error.code, "DELIVERY_FAILED");
  assert.equal(pool.commands.includes("ROLLBACK"), false);
});

test("commit failure is surfaced distinctly", async () => {
  const pool = fakePool({ failCommit: true });
  await assert.rejects(
    () => withPlatformTransaction({ pool, handler: async () => true }),
    (error) => error instanceof PlatformTransactionError
      && error.code === "TRANSACTION_COMMIT_FAILED"
      && error.phase === "COMMIT",
  );
  assert.equal(pool.commands.includes("ROLLBACK"), true);
});
