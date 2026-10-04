import test from "node:test";
import assert from "node:assert/strict";

import {
  getWorkflowActionDefinition,
  getWorkflowActionRegistry,
  getWorkflowBuilderActionRegistry,
} from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const REMOVED_PROVIDER_TEST_ADAPTERS = [
  "OPEN_FOOD_FACTS_TEST_CONNECTION",
  "OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
  "GO_UPC_TEST_CONNECTION",
  "QUICKBOOKS_TEST_CONNECTION",
  "SHOPIFY_TEST_CONNECTION",
];

const INTERNAL = [
  "PAYMENT_START",
  "PAYMENT_CANCEL",
  "GLOBAL_PRODUCT_LOOKUP_BARCODE",
  "GO_UPC_LOOKUP_PRODUCT",
  "ONLINE_ORDER_TRANSITION",
  "SEND_PASSWORD_RESET_EMAIL",
  "SEND_USER_INVITATION",
  "SHOPIFY_SYNC_PRODUCTS",
  "SHOPIFY_EXPORT_REFUND",
  "UBER_GET_STORES",
  "UBER_UPLOAD_MENU",
  "UBER_ACCEPT_ORDER",
  "UBER_UPDATE_ITEM_PRICE",
];

test("internal adapters stay executable but are hidden from Flow Builder", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  const builder = new Set(getWorkflowBuilderActionRegistry().map((item) => item.key));

  for (const key of ["CREATE_RECORD","UPDATE_RECORD","GET_RECORDS","SEND_COMMUNICATION","CALL_CONNECTOR","HTTP_REQUEST","ONE_HTTP_REQUEST","RUN_SUBFLOW"]) {
    assert.ok(builder.has(key), key + " must remain available to Flow Builder");
  }

  for (const key of INTERNAL) {
    assert.ok(all.has(key), key + " must remain executable for compatibility/runtime callers");
    assert.ok(getWorkflowActionDefinition(key), key + " must remain resolvable internally");
    assert.equal(builder.has(key), false, key + " must not appear as a core Builder action");
  }
});

test("provider-specific adapters stay removed in favor of metadata workflows", () => {
  const all = new Set(getWorkflowActionRegistry().map((item) => item.key));
  for (const key of REMOVED_PROVIDER_TEST_ADAPTERS) {
    assert.equal(all.has(key), false, key + " must remain removed");
    assert.equal(getWorkflowActionDefinition(key), null, key + " must not resolve as a hidden function");
  }
  assert.ok(all.has("CONNECTOR_TEST_CONNECTION"), "generic connector test action must remain executable");
});

test("internal adapters do not get generated System workflows", () => {
  const systemKeys = new Set(systemWorkflowDefinitions().map((item) => item.systemKey));
  for (const key of INTERNAL) {
    assert.equal(systemKeys.has("action:" + key), false, key + " must not generate a System Action workflow");
  }
  for (const key of ["CREATE_RECORD","SEND_COMMUNICATION","CALL_CONNECTOR"]) {
    assert.ok(systemKeys.has("action:" + key), key + " should remain a visible System Action workflow");
  }
});
