import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("business package runtime has no imperative function registry", async () => {
  const workflow = await readFile(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  const index = await readFile(new URL("../server/packages/functionsIndex.js", import.meta.url), "utf8");
  assert.equal(workflow.includes("CALL_FUNCTION"), false);
  assert.match(index, /export const packageFunctions/);
});

test("package buttons support workflow targets", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /\["action", "workflow"\]/);
  assert.match(source, /targetType/);
});

test("metadata button flows use workflow action permissions", async () => {
  const source = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(source, /assertWorkflowActionPermissions/);
});
