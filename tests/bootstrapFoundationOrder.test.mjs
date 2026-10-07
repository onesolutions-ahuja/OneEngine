import assert from "node:assert/strict";
import test from "node:test";
import { resolvePackagePlan } from "../server/packages/runtime/packagePlanning.js";

test("bootstrap foundations provision dependencies before dependent packages", () => {
  const foundation = { packageKey: "foundation", version: "1.0.0", dependencies: [] };
  const feature = { packageKey: "feature", version: "1.0.0", dependencies: ["foundation"] };
  assert.deepEqual(resolvePackagePlan("feature", [feature, foundation]).map((item) => item.packageKey), ["foundation", "feature"]);
});
