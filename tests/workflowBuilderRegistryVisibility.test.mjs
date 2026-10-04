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
  "ONLINE_ORDER_TRANSITION",
  "SEND_PASSWORD_RESET_EMAIL",
  "SEND_USER_INVITATION",
  "SHOPIFY_SYNC_PRODUCTS",
  "SHOPIFY_EXPORT_REFUND",
];

test("workflow editor uses the workflow catalogue without record-page lifecycle duplicates", () => {
  const editor = readFileSync(new URL("../src/pages/developer/Builder2Page.jsx", import.meta.url), "utf8");
  assert.ok(editor.includes("apiRequest('/api/platform/workflow-actions')"));
  assert.equal(editor.includes("apiRequest('/api/platform/action-registry')"), false);
  const keys = new Set(getWorkflowBuilderActionRegistry().map((item) => item.key));
  for (const key of ["CREATE_RECORD", "UPDATE_RECORD", "DELETE_RECORD"]) {
    assert.ok(keys.has(key), key + " must remain available to Flow Builder");
  }
  for (const key of ["RECORD_SAVE", "RECORD_DELETE"]) {
    assert.equal(keys.has(key), false, key + " belongs to the record page lifecycle");
  }
});

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

test("customer credit operations are generated as editable COPILOT native System Flows", () => {
  const workflows = systemWorkflowDefinitions();
  const byKey = new Map(workflows.map((workflow) => [workflow.systemKey, workflow]));

  for (const flowKey of [
    "customer.credit.limit.check",
    "customer.credit.transaction.build_sale",
    "customer.credit.payment.check",
    "customer.credit.adjustment.check",
    "customer.credit.transaction.build_payment",
    "customer.credit.transaction.build_adjustment",
    "customer.credit.statement.generate",
  ]) {
    const workflow = byKey.get(`flow:${flowKey}`);
    assert.ok(workflow, `${flowKey} must have a generated native System Flow`);
    assert.match(workflow.name, /^COPILOT-/);
    assert.equal(workflow.action.capabilityType, "workflow");
    assert.ok(workflow.action.inputContract.length > 0);
    assert.ok(workflow.action.outputContract.length > 0);
    assert.equal(workflow.action.actions.some((action) => action.type === "CALL_FUNCTION" || action.key === "CALL_FUNCTION"), false);
  }
  const creditLimitFlow = byKey.get("flow:customer.credit.limit.check");
  assert.ok(creditLimitFlow.action.resources.some((resource) => resource.apiName === "projectedBalanceCents"));
  const statementFlow = byKey.get("flow:customer.credit.statement.generate");
  assert.ok(statementFlow.action.resources.some((resource) => resource.apiName === "statementRows"));
});

const systemFlowDb = async (sql) => ({
  rows: String(sql).includes("role_permissions") ? [{ code: "workflow.execute" }] : [],
});
const systemFlowReq = { user: { id: "user-1", roleId: "role-1", companyId: "company-1" } };

async function runCustomerCreditFlow(key, input) {
  const workflow = systemWorkflowDefinitions().find((item) => item.systemKey === `flow:${key}`);
  assert.ok(workflow, `${key} definition should exist`);
  const variables = {};
  for (const contract of workflow.action.inputContract) {
    if (Object.prototype.hasOwnProperty.call(input, contract.name)) variables[contract.name] = input[contract.name];
    else if (contract.defaultValue !== undefined) variables[contract.name] = contract.defaultValue;
  }
  const workflowVariables = { variables, steps: {} };
  const results = await executeWorkflowActions({
    actions: workflow.action.actions,
    workflowVariables,
    db: systemFlowDb,
    req: systemFlowReq,
  });
  assert.equal(results.some((entry) => entry.error || entry.result?.status !== "completed"), false);
  return Object.fromEntries(workflow.action.outputContract.map((output) => [
    output.name,
    output.source.split(".").reduce((value, part) => value?.[part], workflowVariables),
  ]));
}

test("customer credit limit and payment decisions execute from Flow formulas", async () => {
  const limitCheck = await runCustomerCreditFlow("customer.credit.limit.check", {
    currentBalanceCents: 8000,
    saleAmountCents: 3000,
    creditLimitCents: 10000,
  });
  assert.equal(limitCheck.allowed, false);
  assert.equal(limitCheck.availableCreditCents, 2000);
  const unlimited = await runCustomerCreditFlow("customer.credit.limit.check", {
    currentBalanceCents: 8000,
    saleAmountCents: 3000,
    creditLimitCents: null,
  });
  assert.equal(unlimited.allowed, true);

  const paymentCheck = await runCustomerCreditFlow("customer.credit.payment.check", {
    currentBalanceCents: 8000,
    paymentAmountCents: 8500,
  });
  assert.equal(paymentCheck.allowed, false);
  assert.equal(paymentCheck.overpaymentCents, 500);

  const adjustmentCheck = await runCustomerCreditFlow("customer.credit.adjustment.check", {
    currentBalanceCents: 8000,
    adjustmentAmountCents: 3000,
    adjustmentType: "credit_note",
    creditLimitCents: 10000,
  });
  assert.equal(adjustmentCheck.allowed, false);
});

test("customer credit transaction Flows preserve rounded amounts and record fields", async () => {
  const saleFlow = await runCustomerCreditFlow("customer.credit.transaction.build_sale", {
    saleId: "sale-1",
    customerId: "customer-1",
    companyId: "company-1",
    storeId: "store-1",
    amount: 10.126,
    totalTax: 1.005,
    netAmount: 9.121,
    grossAmount: 10.126,
    userId: "user-1",
    receiptNumber: "R-1",
  });
  assert.equal(saleFlow.transaction.transaction_type, "credit_sale");
  assert.equal(saleFlow.transaction.reference_id, "sale-1");
  assert.equal(saleFlow.transaction.amount, 10.13);
  assert.equal(saleFlow.transaction.vat_amount, 1);

  const paymentFlow = await runCustomerCreditFlow("customer.credit.transaction.build_payment", {
    customerId: "customer-1",
    companyId: "company-1",
    storeId: "store-1",
    amount: 3.456,
    paymentMethod: "cash",
    userId: "user-1",
    referenceId: "payment-1",
  });
  assert.equal(paymentFlow.transaction.transaction_type, "payment");
  assert.equal(paymentFlow.transaction.amount, 3.46);
  assert.equal(paymentFlow.transaction.reference_id, "payment-1");

  const adjustmentFlow = await runCustomerCreditFlow("customer.credit.transaction.build_adjustment", {
    customerId: "customer-1",
    companyId: "company-1",
    storeId: "store-1",
    amount: 3.456,
    adjustmentType: "debit_note",
    userId: "user-1",
    referenceId: "return-1",
    referenceType: "sale_return",
  });
  assert.equal(adjustmentFlow.transaction.transaction_type, "debit_note");
  assert.equal(adjustmentFlow.transaction.amount, 3.46);
  assert.equal(adjustmentFlow.transaction.reference_type, "sale_return");
});

test("customer credit statement Flow filters an inclusive date range and keeps running balances", async () => {
  const result = await runCustomerCreditFlow("customer.credit.statement.generate", {
    transactions: [
      { transaction_type: "credit_sale", amount: 10, created_at: "2026-01-01T00:00:00Z" },
      { transaction_type: "payment", amount: 3, created_at: "2026-01-02T18:00:00Z" },
      { transaction_type: "debit_note", amount: 2, created_at: "2026-01-03T00:00:00Z" },
    ],
    fromDate: "2026-01-02",
    toDate: "2026-01-02",
    customerId: "customer-1",
    companyId: "company-1",
  });
  assert.equal(result.statement.openingBalance, 10);
  assert.equal(result.statement.transactions.length, 1);
  assert.equal(result.statement.transactions[0].amount_display, -3);
  assert.equal(result.statement.closingBalance, 7);
});

test("System Flow runtime hydrates declared inputs and returns declared outputs", async () => {
  const definitions = systemWorkflowDefinitions();
  const bySystemKey = new Map(definitions.map((definition, index) => [
    definition.systemKey,
    { ...definition, id: `workflow-${index}`, user_modified: true, active: true, lifecycle_status: "ACTIVE", version: 1, active_version: 1 },
  ]));
  let stepId = 0;
  const db = async (sql, params = []) => {
    const query = String(sql);
    if (query.includes("SELECT id,name,object_id,trigger_key,conditions,action,version")) {
      return { rows: [...bySystemKey.values()].map((workflow) => ({ ...workflow, action: { systemKey: workflow.systemKey } })) };
    }
    if (query.includes("DELETE FROM platform_rules")) return { rows: [] };
    if (query.includes("FROM users u")) return { rows: [{ id: "user-1", role_id: "role-1", store_id: null, till_id: null }] };
    if (query.includes("SELECT * FROM platform_rules")) {
      const workflow = bySystemKey.get(params[1]);
      return { rows: workflow ? [workflow] : [] };
    }
    if (query.includes("role_permissions")) return { rows: [{ code: "workflow.execute" }] };
    if (query.includes("FROM platform_workflow_step_runs")) return { rows: [] };
    if (query.includes("INSERT INTO platform_workflow_runs")) {
      return { rows: [{ id: "run-1" }] };
    }
    if (query.includes("INSERT INTO platform_workflow_step_runs")) {
      return { rows: [{ id: `step-${++stepId}`, status: "RUNNING", metadata: {} }] };
    }
    return { rows: [] };
  };
  const result = await executeSystemWorkflow({
    db,
    companyId: "company-1",
    userId: "user-1",
    systemKey: "flow:customer.credit.limit.check",
    input: { currentBalanceCents: 8000, saleAmountCents: 3000, creditLimitCents: 10000 },
  });
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(result.result, {
    allowed: false,
    availableCreditCents: 2000,
    projectedBalanceCents: 11000,
  });
  assert.deepEqual(Object.keys(result.workflowVariables.variables).sort(), [
    "allowed",
    "availableCreditCents",
    "creditLimitCents",
    "currentBalanceCents",
    "projectedBalanceCents",
    "saleAmountCents",
  ].sort());
});
