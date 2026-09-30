import test from "node:test";
import assert from "node:assert/strict";
import {
  createExecutionGuard,
  executionFingerprint,
  PlatformExecutionGuardError,
} from "../services/platformExecutionGuard.js";

test("execution guard detects recursive workflow entry", () => {
  const root = createExecutionGuard({ maxDepth: 8 }).enter("flow-a");
  const child = root.enter("flow-b");
  assert.throws(
    () => child.enter("flow-a"),
    (error) => error instanceof PlatformExecutionGuardError
      && error.code === "EXECUTION_RECURSION_DETECTED",
  );
});

test("execution guard enforces maximum depth", () => {
  const root = createExecutionGuard({ maxDepth: 2 }).enter("flow-a").enter("flow-b");
  assert.throws(
    () => root.enter("flow-c"),
    (error) => error.code === "EXECUTION_DEPTH_EXCEEDED",
  );
});

test("execution guard local claims suppress duplicate identities", () => {
  const guard = createExecutionGuard();
  assert.equal(guard.claim("record:1").claimed, true);
  assert.equal(guard.claim("record:1").duplicate, true);
});

test("execution fingerprints are stable across key order", () => {
  assert.equal(
    executionFingerprint({ b: 2, a: 1 }),
    executionFingerprint({ a: 1, b: 2 }),
  );
});
