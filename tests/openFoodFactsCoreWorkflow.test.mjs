import test from "node:test";
import assert from "node:assert/strict";

import { packageDefinitions } from "../server/services/packageRegistry.js";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";

function openFoodFactsPackage() {
  return packageDefinitions().find((definition) => definition.packageKey === "open_food_facts");
}

test("ONE_HTTP_REQUEST is the generic metadata-driven HTTP core action", async () => {
  const definition = getWorkflowActionDefinition("ONE_HTTP_REQUEST");
  assert.ok(definition);
  assert.equal(definition.displayName, "ONE - HTTP Request");
  assert.equal(typeof definition.executor, "function");
  assert.throws(() => definition.validation({ endpoint: "/x" }), /Provider/);
  assert.throws(() => definition.validation({ providerKey: "open_food_facts", endpoint: "/x", url: "https://example.com" }), /direct URL/i);

  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("platform_connector_definitions")) {
      return { rows: [{ id: "provider-1", connector_key: "open_food_facts", base_url: "https://world.openfoodfacts.org", auth_type: "none", timeout_ms: 5000, status: "ACTIVE" }] };
    }
    if (sql.includes("integration_connections")) return { rows: [] };
    throw new Error("Unexpected SQL");
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 1, code: "737628064502", product: { product_name: "Test Product" } }),
  });
  try {
    const result = await definition.executor({
      db,
      companyId: "company-1",
      action: { providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/{{barcode}}.json" },
      record: { barcode: "737628064502" },
      workflowVariables: { variables: {}, steps: {} },
      req: { user: { companyId: "company-1" } },
    });
    assert.equal(result.success, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.data.product.product_name, "Test Product");
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Open Food Facts package exposes exactly the two GPT cleanup workflows using ONE_HTTP_REQUEST", () => {
  const pkg = openFoodFactsPackage();
  assert.ok(pkg);
  const workflows = pkg.manifest.workflows || [];
  const lookup = workflows.find((flow) => flow.action?.apiName === "GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT");
  const connection = workflows.find((flow) => flow.action?.apiName === "GPT_OPEN_FOOD_FACTS_TEST_CONNECTION");
  assert.ok(lookup);
  assert.ok(connection);
  assert.equal(lookup.name, "GPT - Open Food Facts - Lookup Product");
  assert.equal(connection.name, "GPT - Open Food Facts - Test Connection");

  for (const flow of [lookup, connection]) {
    const keys = flow.action.actions.map((action) => action.key);
    assert.ok(keys.includes("ONE_HTTP_REQUEST"));
    assert.ok(keys.includes("CONDITION"));
    assert.ok(keys.includes("ASSIGNMENT"));
    assert.equal(keys.includes("OPEN_FOOD_FACTS_LOOKUP_PRODUCT"), false);
    assert.equal(keys.includes("OPEN_FOOD_FACTS_TEST_CONNECTION"), false);
  }

  const http = lookup.action.actions.find((action) => action.key === "ONE_HTTP_REQUEST");
  assert.equal(http.providerKey, "open_food_facts");
  assert.equal(http.endpoint, "/api/v2/product/{{barcode}}.json");
  assert.equal("url" in http, false);
});
