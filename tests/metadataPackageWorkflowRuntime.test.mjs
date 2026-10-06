import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("legacy package function registry is retired", async () => {
  const trusted = await readFile(new URL("../server/services/trustedRuntime.js", import.meta.url), "utf8");
  assert.equal(trusted.includes("platformFunctionRegistry"), false);
  assert.equal(trusted.includes("PLATFORM_FUNCTIONS"), false);
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
  assert.match(source, /gptBuilderElements: \(\(\) => \{/);
  assert.match(source, /return actions\.map\(\(step, index\) => \(\{/);
  assert.match(source, /importedRuntimeAction: step/);
  assert.match(source, /workflows: workflows\.map\(\(workflow\) => \{/);
});
