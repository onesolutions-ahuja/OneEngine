import test from "node:test";
import assert from "node:assert/strict";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { getWorkflowActionDefinition, getWorkflowActionRegistry } from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

test("ONE_HTTP_REQUEST remains the generic core HTTP action", () => {
  const definition = getWorkflowActionDefinition("ONE_HTTP_REQUEST");
  assert.ok(definition);
  assert.equal(definition.displayName, "ONE - HTTP Request");
  assert.equal(typeof definition.executor, "function");
});

test("Open Food Facts provider behavior is not compiled into the core workflow registry", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  for (const key of ["OPEN_FOOD_FACTS_TEST_CONNECTION","OPEN_FOOD_FACTS_LOOKUP_PRODUCT"]) {
    assert.equal(all.has(key), false, key);
    assert.equal(getWorkflowActionDefinition(key), null, key);
  }
});

test("Open Food Facts package remains declarative and system catalog has no compiled provider flow", () => {
  const pkg = packageDefinitions().find((item) => item.packageKey === "open_food_facts");
  assert.ok(pkg);
  const definitions = systemWorkflowDefinitions();
  assert.equal(definitions.some((flow) => String(flow.systemKey || "").includes("OPEN_FOOD_FACTS")), false);
});
