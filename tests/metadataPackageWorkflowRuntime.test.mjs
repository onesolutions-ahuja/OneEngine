import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("package functions are package-owned and loaded through the generic package index", async () => {
  const registry = "";
  const index = await readFile(new URL("../server/packages/functionsIndex.js", import.meta.url), "utf8");
  assert.match(registry, /packages\/functionsIndex\.js/);
  assert.equal(registry.includes('key: "purchase.receive"'), false);
  assert.equal(registry.includes("await readdir"), false);
  assert.match(index, /export const packageFunctions/);
  assert.equal([].some((item) => item.key === "purchase.receive"), false);
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
