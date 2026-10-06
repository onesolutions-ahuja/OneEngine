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

test("Open Food Facts flows are package metadata, not core runtime code", () => {
  const pkg = packageDefinitions().find((item) => item.packageKey === "open_food_facts");
  assert.ok(pkg);
  const flows=(pkg.manifest.workflows||[]).filter((flow)=>String(flow?.action?.apiName||"").startsWith("GPT_OPEN_FOOD_FACTS_"));
  assert.equal(flows.length,2);
  for(const flow of flows){
    assert.equal(flow.action.systemGenerated,undefined);
    assert.equal(flow.action.scope,"system");
    const keys=(flow.action.actions||[]).map((action)=>action.key);
    assert.ok(keys.includes("ONE_HTTP_REQUEST"));
    assert.ok(keys.includes("CONDITION"));
    assert.ok(keys.includes("ASSIGNMENT"));
  }
  const systemKeys=new Set(systemWorkflowDefinitions().map((flow)=>flow.systemKey));
  assert.equal(systemKeys.has("flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT"),false);
  assert.equal(systemKeys.has("flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION"),false);
});

test("Open Food Facts package flows keep editable resources and assignments", () => {
  const pkg = packageDefinitions().find((item) => item.packageKey === "open_food_facts");
  const flows=pkg.manifest.workflows||[];
  const lookup=flows.find((flow)=>flow.action?.apiName==="GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT");
  const connection=flows.find((flow)=>flow.action?.apiName==="GPT_OPEN_FOOD_FACTS_TEST_CONNECTION");
  assert.ok(lookup);
  assert.ok(connection);
  assert.deepEqual(lookup.action.resources.filter((r)=>r.availableOutput).map((r)=>r.apiName),["barcode","found","productName","brand","imageUrl","ingredients"]);
  assert.equal(lookup.action.resources.find((r)=>r.apiName==="barcode").availableInput,true);
  assert.deepEqual(lookup.action.actions.filter((a)=>a.key==="ASSIGNMENT").map((a)=>a.variableName),["found","barcode","productName","brand","imageUrl","ingredients","found"]);
  assert.deepEqual(connection.action.resources.filter((r)=>r.availableOutput).map((r)=>r.apiName),["connected","message","statusCode"]);
});
