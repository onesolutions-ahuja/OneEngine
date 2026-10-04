import test from "node:test";
import assert from "node:assert/strict";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

test("ONE_HTTP_REQUEST remains the generic core HTTP action", () => {
  const definition = getWorkflowActionDefinition("ONE_HTTP_REQUEST");
  assert.ok(definition);
  assert.equal(definition.displayName, "ONE - HTTP Request");
  assert.equal(typeof definition.executor, "function");
});

test("Open Food Facts GPT flows are platform system flows, not tenant package flows", () => {
  const pkg = packageDefinitions().find((item) => item.packageKey === "open_food_facts");
  assert.ok(pkg);
  assert.equal((pkg.manifest.workflows || []).some((flow) => String(flow?.action?.apiName || "").startsWith("GPT_OPEN_FOOD_FACTS_")), false);

  const definitions = systemWorkflowDefinitions();
  const lookup = definitions.find((flow) => flow.systemKey === "flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT");
  const connection = definitions.find((flow) => flow.systemKey === "flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION");
  assert.ok(lookup);
  assert.ok(connection);
  assert.equal(lookup.name, "GPT - Open Food Facts - Lookup Product");
  assert.equal(connection.name, "GPT - Open Food Facts - Test Connection");

  for (const flow of [lookup, connection]) {
    assert.equal(flow.action.systemGenerated, true);
    assert.equal(flow.action.scope, "system");
    assert.equal(flow.action.capabilityType, "workflow");
    const keys = flow.action.actions.map((action) => action.key);
    assert.ok(keys.includes("ONE_HTTP_REQUEST"));
    assert.ok(keys.includes("CONDITION"));
    assert.ok(keys.includes("ASSIGNMENT"));
  }
});
