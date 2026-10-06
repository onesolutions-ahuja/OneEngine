import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("legacy package function registry stays retired", async () => { await assert.rejects(readFile(new URL("../server/services/platformFunctionRegistry.js", import.meta.url), "utf8")); });

test("package buttons support workflow targets", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /\["action", "workflow"\]/);
  assert.match(source, /targetType/);
});

test("metadata button flows use registered generic action permissions", async () => {
  const source = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(source, /assertWorkflowActionPermissions/);
  assert.match(source, /getWorkflowActionDefinition/);
  assert.match(source, /definition\?\.requiredPermissions/);
  assert.match(source, /CALL_FUNCTION is retired/);
});
