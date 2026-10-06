import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";


test("package buttons support workflow targets", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /\["action", "workflow"\]/);
  assert.match(source, /targetType/);
});

test("metadata button flows use registered action permissions", async () => {
  const source = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(source, /assertWorkflowActionPermissions/);
  assert.match(source, /getWorkflowActionDefinition\(actionType\)/);
  assert.match(source, /definition\?\.requiredPermissions/);
  assert.doesNotMatch(source, /CALL_FUNCTION/);
});
