import test from "node:test";
import assert from "node:assert/strict";

import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";

const REMOVED_DOMAIN_WRAPPERS = [
  "PAYMENT_REFUND",
  "INVENTORY_ACTION",
  "RECONCILE_INVENTORY",
  "REBUILD_INVENTORY",
  "POST_CREDIT_PAYMENT",
  "FREEZE_CREDIT_ACCOUNT",
  "UNFREEZE_CREDIT_ACCOUNT",
  "SEND_CREDIT_STATEMENT",
  "PUBLISH_TO_WEB_SHOP",
  "UNPUBLISH_FROM_WEB_SHOP",
  "UPDATE_WEB_LISTING",
  "SET_WEB_FEATURED",
];

test("unused business-specific workflow wrappers stay removed", () => {
  for (const key of REMOVED_DOMAIN_WRAPPERS) {
    assert.equal(getWorkflowActionDefinition(key), null, key + " must not be exposed as a core Flow action");
  }
});
