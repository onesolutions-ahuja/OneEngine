import test from "node:test";
import assert from "node:assert/strict";

import { packageDefinitions } from "../server/services/packageRegistry.js";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

test("ONE_HTTP_REQUEST remains the generic metadata-driven HTTP core action", () => {
  const definition = getWorkflowActionDefinition("ONE_HTTP_REQUEST");
  assert.ok(definition);
  assert.equal(definition.displayName, "ONE - HTTP Request");
  assert.equal(typeof definition.executor, "function");
});

test("Open Food Facts GPT flows are platform system flows, not tenant package workflows", () => {
  const pkg = packageDefinitions().find((definition) => definition.packageKey === "open_food_facts");
  assert.ok(pkg);
  assert.equal((pkg.manifest.workflows || []).some((flow) => String(flow?.action?.apiName || "").startsWith("GPT_OPEN_FOOD_FACTS_")), false);

  const definitions = systemWorkflowDefinitions();
  const lookup = definitions.find((flow) => flow.systemKey === "flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT");
  const connection = definitions.find((flow) => flow.systemKey === "flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION");
  assert.ok(lookup);
  assert.ok(connection);
  for (const flow of [lookup, connection]) {
    assert.equal(flow.action.systemGenerated, true);
    assert.equal(flow.action.scope, "system");
    assert.equal(flow.action.capabilityType, "workflow");
    assert.ok(flow.action.actions.some((action) => action.key === "ONE_HTTP_REQUEST"));
    assert.ok(flow.action.actions.some((action) => action.key === "CONDITION"));
    assert.ok(flow.action.actions.some((action) => action.key === "ASSIGNMENT"));
  }
});
