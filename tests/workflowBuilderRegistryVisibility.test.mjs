import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  executeWorkflowActions,
  getWorkflowActionDefinition,
  getWorkflowActionRegistry,
  getWorkflowBuilderActionRegistry,
} from "../server/services/platformWorkflow.js";
import { executeSystemWorkflow } from "../server/services/systemWorkflowRuntime.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const REMOVED_PROVIDER_TEST_ADAPTERS = [
  "OPEN_FOOD_FACTS_TEST_CONNECTION",
  "OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
  "GO_UPC_TEST_CONNECTION",
  "QUICKBOOKS_TEST_CONNECTION",
  "SHOPIFY_TEST_CONNECTION",
  "UBER_GET_STORES",
  "UBER_UPLOAD_MENU",
  "UBER_ACCEPT_ORDER",
  "UBER_DENY_ORDER",
  "UBER_UPDATE_ITEM_PRICE",
  "UBER_SET_ITEM_UNAVAILABLE",
  "UBER_SET_ITEM_AVAILABLE",
];

const INTERNAL = [
  "PAYMENT_START",
  "PAYMENT_CANCEL",
  "GLOBAL_PRODUCT_LOOKUP_BARCODE",
  "GO_UPC_LOOKUP_PRODUCT",
];


test("internal adapters stay executable but are hidden from Flow Builder", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  const builder = new Set(getWorkflowBuilderActionRegistry().map((item) => item.key));

  for (const key of ["CREATE_RECORD","UPDATE_RECORD","GET_RECORDS","SEND_COMMUNICATION","CALL_CONNECTOR","HTTP_REQUEST","ONE_HTTP_REQUEST","RUN_SUBFLOW","GENERATE_SECURE_TOKEN"]) {
    assert.ok(builder.has(key), key + " must remain available to Flow Builder");
  }

  for (const key of INTERNAL) {
    assert.ok(all.has(key), key + " must remain executable for generic runtime callers");
    assert.ok(getWorkflowActionDefinition(key), key + " must remain resolvable internally");
    assert.equal(builder.has(key), false, key + " must not appear as a core Builder action");
  }
  for (const key of ["ONLINE_ORDER_TRANSITION","SHOPIFY_SYNC_PRODUCTS","SHOPIFY_EXPORT_REFUND"]) {
    assert.equal(all.has(key), false, key + " business/provider adapter must remain removed");
    assert.equal(getWorkflowActionDefinition(key), null, key + " must not resolve as hidden business code");
  }
});

test("staff lifecycle orchestration stays in editable Flow metadata", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  for (const key of ["SEND_PASSWORD_RESET_EMAIL", "SEND_USER_INVITATION"]) {
    assert.equal(all.has(key), false, key + " must remain removed from hidden runtime actions");
    assert.equal(getWorkflowActionDefinition(key), null, key + " must not resolve as a hidden executor");
  }
  const packages = readFileSync(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(packages, /apiName:\s*"STAFF_SEND_PASSWORD_RESET"/);
  assert.match(packages, /apiName:\s*"STAFF_SEND_INVITATION"/);
  assert.match(packages, /apiName:\s*"STAFF_ISSUE_LIFECYCLE_TOKEN"/);
  assert.match(packages, /key:"GENERATE_SECURE_TOKEN"/);
  assert.doesNotMatch(packages, /CALL_FUNCTION/);
  assert.match(packages, /handlerKey:\s*"RUN_SUBFLOW"/);
});

test("provider-specific adapters stay removed in favor of metadata workflows", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  for (const key of REMOVED_PROVIDER_TEST_ADAPTERS) {
    assert.equal(all.has(key), false, key + " must remain removed");
    assert.equal(getWorkflowActionDefinition(key), null, key + " must not resolve as a hidden function");
  }
  assert.ok(all.has("CONNECTOR_TEST_CONNECTION"), "generic connector test action must remain executable");
});

test("registered actions and jobs never become one-step System workflows", () => {
  const definitions = systemWorkflowDefinitions();
  for (const flow of definitions) {
    assert.equal(String(flow.systemKey || "").startsWith("action:"), false, flow.systemKey);
    assert.equal(String(flow.systemKey || "").startsWith("job:"), false, flow.systemKey);
    assert.notEqual(flow.action?.capabilityType, "action", flow.systemKey);
    assert.notEqual(flow.action?.capabilityType, "job", flow.systemKey);
  }
});

test("customer credit business flows are not hardcoded in the system workflow catalog", () => {
  const source = readFileSync(new URL("../server/services/systemWorkflowCatalog.js", import.meta.url), "utf8");
  for (const key of [
    "customer.credit.limit.check",
    "customer.credit.transaction.build_sale",
    "customer.credit.payment.check",
    "customer.credit.adjustment.check",
    "customer.credit.transaction.build_payment",
    "customer.credit.transaction.build_adjustment",
    "customer.credit.statement.generate",
  ]) assert.equal(source.includes(key), false, key + " must remain metadata/tenant Flow-owned");
});


