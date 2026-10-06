import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("business packages use visible metadata workflows without a function registry", async () => {
  const workflow = await readFile(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../server/services/systemWorkflowCatalog.js", import.meta.url), "utf8");
  assert.equal(workflow.includes("CALL_FUNCTION"), false);
  assert.equal(workflow.includes("platformFunctionRegistry"), false);
  assert.equal(catalog.includes("PLATFORM_FUNCTIONS"), false);
});

test("package buttons support workflow targets", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /\["action", "workflow"\]/);
  assert.match(source, /targetType/);
});

test("metadata button flows enforce workflow action permissions", async () => {
  const source = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(source, /assertWorkflowActionPermissions/);
  assert.match(source, /assertWorkflowActionPermissions/);
});
