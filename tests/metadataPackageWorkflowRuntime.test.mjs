import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

test("package functions are package-owned and loaded through the generic package index", async () => {
  const registry = await readFile(new URL("../server/services/platformFunctionRegistry.js", import.meta.url), "utf8");
  const index = await readFile(new URL("../server/packages/functionsIndex.js", import.meta.url), "utf8");
  assert.match(registry, /packages\/functionsIndex\.js/);
  assert.equal(registry.includes('key: "purchase.receive"'), false);
  assert.equal(registry.includes("await readdir"), false);
  assert.match(index, /export const packageFunctions/);
  assert.equal(PLATFORM_FUNCTIONS.some((item) => item.key === "purchase.receive"), false);
});

test("package buttons support workflow targets", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /\["action", "workflow"\]/);
  assert.match(source, /targetType/);
});

test("metadata button flows use generic action permissions without hidden functions", async () => {
  const source = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(source, /assertWorkflowActionPermissions/);
  assert.match(source, /definition\?\.requiredPermissions/);
  assert.doesNotMatch(source, /CALL_FUNCTION|functionDefinition\.permissionsAny/);
});


test("package workflow provisioning preserves contracts resources and Builder metadata", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /inputContract: workflow\.inputContract \|\| workflow\.action\?\.inputContract \|\| \[\]/);
  assert.match(source, /outputContract: workflow\.outputContract \|\| workflow\.action\?\.outputContract \|\| \[\]/);
  assert.match(source, /resources: workflow\.resources \|\| workflow\.variables \|\| workflow\.action\?\.resources \|\| \[\]/);
  assert.match(source, /const withPackageBuilderMetadata =/);
  assert.match(source, /gptBuilderElements: \(\(\) => \{/);
  assert.match(source, /importedRuntimeAction: step/);
});
