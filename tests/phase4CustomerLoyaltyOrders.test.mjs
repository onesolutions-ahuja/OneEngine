import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const load = async (name) => JSON.parse(await readFile(new URL(`../server/metadata/manifests/${name}.json`, import.meta.url), "utf8"));

test("Phase 4 customer, credit, loyalty, and online-order flows are explicit and Builder-editable", async () => {
  const manifests = [
    ["customers", "Register Customer", 4],
    ["customer_credit", "Post Customer Credit Entry", 6],
    ["loyalty", "Adjust Loyalty", 7],
    ["online_orders", "Online Order Transition", 4],
  ];
  for (const [file, name, minimum] of manifests) {
    const manifest = await load(file);
    const flow = manifest.workflows.find((item) => item.name === name);
    assert.ok(flow, name);
    const action = flow.action || flow;
    const actions = action.actions || flow.actions || [];
    const nodes = action.gptBuilderElements || flow.gptBuilderElements || [];
    assert.ok(actions.length >= minimum, name + " step count");
    assert.equal(nodes.length, actions.length, name + " Builder/runtime count");
    assert.ok(nodes.every((node) => node.config?.importedRuntimeAction && node.configured === true), name + " editable nodes");
  }
});

test("customer registration has explicit validation and failure path", async () => {
  const manifest = await load("customers");
  const actions = manifest.workflows[0].action.actions;
  assert.deepEqual(actions.map((item) => item.key), ["FORMULA","CONDITION","CREATE_RECORD","CUSTOM_ERROR"]);
});

test("customer credit posting checks customer, idempotency, and removes duplicate field metadata", async () => {
  const manifest = await load("customer_credit");
  const actions = manifest.workflows[0].action.actions;
  assert.equal(actions.filter((item) => item.key === "GET_RECORDS").length, 2);
  assert.ok(actions.some((item) => item.id === "find_customer"));
  assert.ok(actions.some((item) => item.id === "find_existing_credit_entry"));
  assert.ok(actions.some((item) => item.key === "CONDITION"));
  assert.ok(actions.some((item) => item.key === "CUSTOM_ERROR"));
  const ledger = manifest.objects.find((item) => item.objectKey === "customer_credit_ledger");
  assert.equal(ledger.fields.filter((field) => field.apiName === "idempotency_key").length, 1);
});

test("loyalty adjustment validates inputs and account existence before writes", async () => {
  const manifest = await load("loyalty");
  const actions = manifest.workflows[0].action.actions;
  assert.equal(actions[0].key, "FORMULA");
  assert.ok(actions.some((item) => item.id === "get_account" && item.key === "GET_RECORDS"));
  assert.ok(actions.some((item) => item.id === "loyalty_ready" && item.key === "CONDITION"));
  assert.ok(actions.some((item) => item.key === "CUSTOM_ERROR"));
});

test("online-order transition exposes allowed state transitions as editable metadata", async () => {
  const manifest = await load("online_orders");
  const flow = manifest.workflows.find((item) => item.name === "Online Order Transition");
  const actions = flow.actions;
  assert.deepEqual(actions.map((item) => item.key), ["GET_RECORDS","CONDITION","UPDATE_RECORD","CUSTOM_ERROR"]);
  const decision = actions.find((item) => item.id === "validate_transition");
  assert.equal(decision.outcomes.length, 18);
  assert.ok(decision.outcomes.every((outcome) => outcome.branch.includes("update_online_order_status")));
  assert.equal(actions.find((item) => item.id === "update_online_order_status").recordId.path, "variables.orderId");
  assert.equal(actions.find((item) => item.id === "update_online_order_status").fieldValues.status.path, "variables.toStatus");
});
