import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

test("package functions are auto-discovered and purchase receive is package-owned", async () => {
  const registry = await readFile(new URL("../server/services/platformFunctionRegistry.js", import.meta.url), "utf8");
  assert.match(registry, /functions\.js/);
  assert.equal(registry.includes('key: "purchase.receive"'), false);
  assert.ok(PLATFORM_FUNCTIONS.some((item) => item.key === "purchase.receive"));
});

test("package buttons support workflow targets", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /\["action", "workflow"\]/);
  assert.match(source, /targetType/);
});

test("metadata button flows use registered function permissions", async () => {
  const source = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(source, /assertWorkflowActionPermissions/);
  assert.match(source, /functionDefinition\.permissionsAny/);
});
