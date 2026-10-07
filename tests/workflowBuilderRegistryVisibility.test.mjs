import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getWorkflowActionDefinition,
  getWorkflowActionRegistry,
  getWorkflowBuilderActionRegistry,
} from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const GENERIC_CORE = [
  "GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD",
  "CREATE_RELATED_RECORD","UPDATE_RELATED_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP",
  "ASSIGN_RECORD","ASSIGNMENT","DECISION","LOOP","WAIT","FORMULA",
  "SEND_COMMUNICATION","ONE_HTTP_REQUEST","RUN_SUBFLOW","STOP"
];

const REMOVED_BUSINESS_OR_PROVIDER = [
  "PAYMENT_START","PAYMENT_CANCEL","GLOBAL_PRODUCT_LOOKUP_BARCODE","GO_UPC_LOOKUP_PRODUCT",
  "OPEN_FOOD_FACTS_TEST_CONNECTION","OPEN_FOOD_FACTS_LOOKUP_PRODUCT","GO_UPC_TEST_CONNECTION",
  "QUICKBOOKS_TEST_CONNECTION","SHOPIFY_TEST_CONNECTION","SHOPIFY_SYNC_PRODUCTS","SHOPIFY_EXPORT_REFUND",
  "UBER_GET_STORES","UBER_UPLOAD_MENU","UBER_ACCEPT_ORDER","UBER_DENY_ORDER",
  "UBER_UPDATE_ITEM_PRICE","UBER_SET_ITEM_UNAVAILABLE","UBER_SET_ITEM_AVAILABLE",
  "ONLINE_ORDER_TRANSITION","SEND_PASSWORD_RESET_EMAIL","SEND_USER_INVITATION"
];

test("Flow action registry contains generic primitives and no compiled business/provider adapters", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  const builder = new Set(getWorkflowBuilderActionRegistry().map((item) => item.key));

  for (const key of GENERIC_CORE) {
    if (all.has(key)) assert.ok(getWorkflowActionDefinition(key), key);
  }
  for (const key of ["GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD","SEND_COMMUNICATION","ONE_HTTP_REQUEST","RUN_SUBFLOW"]) {
    assert.ok(builder.has(key), key + " must remain available to Flow Builder");
  }
  for (const key of REMOVED_BUSINESS_OR_PROVIDER) {
    assert.equal(all.has(key), false, key + " must remain removed from compiled runtime");
    assert.equal(getWorkflowActionDefinition(key), null, key + " must not resolve as hidden runtime code");
  }
  assert.ok(all.has("CONNECTOR_TEST_CONNECTION"), "generic connector test action remains a platform primitive");
});

test("registered actions and jobs never become one-step System workflows", () => {
  for (const flow of systemWorkflowDefinitions()) {
    assert.equal(String(flow.systemKey || "").startsWith("action:"), false, flow.systemKey);
    assert.equal(String(flow.systemKey || "").startsWith("job:"), false, flow.systemKey);
    assert.notEqual(flow.action?.capabilityType, "action", flow.systemKey);
    assert.notEqual(flow.action?.capabilityType, "job", flow.systemKey);
  }
});

test("business workflow catalogs are not compiled into systemWorkflowCatalog", () => {
  const source = readFileSync(new URL("../server/services/systemWorkflowCatalog.js", import.meta.url), "utf8");
  for (const token of [
    "customer.credit.","SHOPIFY_","UBER_","OPEN_FOOD_FACTS_","QUICKBOOKS_",
    "PAYMENT_START","GLOBAL_PRODUCT_LOOKUP_BARCODE"
  ]) assert.equal(source.includes(token), false, token);
  assert.doesNotMatch(source, /PACKAGE_RUNTIME_FLOWS|runtimeFlowManifests/);
});

test("generated action and job pseudo-workflows stay removed from persistence", () => {
  const catalog = readFileSync(new URL("../server/services/systemWorkflowCatalog.js", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../server/services/systemWorkflowRuntime.js", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../server/database/init.js", import.meta.url), "utf8");
  assert.doesNotMatch(catalog, /function\s+actionWorkflow\s*\(/);
  assert.doesNotMatch(catalog, /function\s+jobWorkflow\s*\(/);
  assert.doesNotMatch(catalog, /PLATFORM_ACTION_REGISTRY/);
  assert.doesNotMatch(catalog, /TRUSTED_JOB_KINDS/);
  assert.match(runtime, /export async function executeSystemAction\(/);
  assert.match(migration, /0066_remove_system_action_job_workflow_wrappers/);
});
