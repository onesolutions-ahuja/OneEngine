import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../server/metadata/manifests/retail_pos.json", import.meta.url), "utf8"));
const objects = new Map((manifest.objects || []).map((object) => [object.objectKey, object]));
const flows = new Map((manifest.workflows || []).map((flow) => [flow.action?.systemKey || flow.name, flow]));

test("Phase 1 exposes sale_ledger as the canonical sale business object", () => {
  for (const key of ["sale_ledger","device_session","cash_ledger","stock_return","stock_return_line"]) {
    assert.ok(objects.has(key), `missing metadata object ${key}`);
    assert.equal(objects.get(key).config?.flowWritesOnly, true, `${key} must write through Flow`);
  }
  for (const key of ["sale_item","payment","refund"]) {
    assert.ok(objects.has(key), `missing internal child storage ${key}`);
    assert.equal(objects.get(key).config?.internal, true, `${key} must be hidden from business object surfaces`);
    assert.equal(objects.get(key).config?.childStorage, true, `${key} must be marked child storage`);
    assert.equal(objects.get(key).config?.generateOneId, false, `${key} must not receive a separate OneID`);
  }
});

test("Phase 1 validations are metadata rules", () => {
  const rules = manifest.rules || [];
  for (const objectKey of ["sale_ledger","sale_item","payment","device_session","cash_ledger","refund","stock_return","stock_return_line"]) {
    assert.ok(rules.some((rule) => rule.objectKey === objectKey), `missing validation metadata for ${objectKey}`);
  }
});

test("Phase 1 business processes are editable workflow metadata", () => {
  for (const key of ["flow:till.open","flow:till.close","flow:till.cash.move","flow:return.create","flow:refund.create","flow:exchange.create","flow:sale.complete","flow:till.payment.validate","flow:till.split.payment.validate","flow:sale.totals.calculate"]) {
    assert.ok(flows.has(key), `missing metadata Flow ${key}`);
    assert.ok(Array.isArray(flows.get(key).action?.actions), `${key} has no editable Flow actions`);
  }
});

test("generated parent IDs are passed through Flow step resources", () => {
  const complete = flows.get("flow:sale.complete").action.actions;
  assert.equal(complete.find((a) => a.id === "create_items").commonFieldValues.sale_id.path, "steps.create_sale.created.id");
  assert.equal(complete.find((a) => a.id === "create_payments").commonFieldValues.sale_id.path, "steps.create_sale.created.id");
  const customerReturn = flows.get("flow:return.create").action.actions;
  assert.equal(customerReturn.find((a) => a.id === "create_return_items").commonFieldValues.return_id.path, "steps.create_return.created.id");
});

test("retail metadata uses generic runtime primitives only", () => {
  const allowed = new Set(["GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD","BULK_UPDATE_RECORDS","CREATE_RELATED_RECORD","UPDATE_RELATED_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP","ASSIGN_RECORD","ASSIGNMENT","DECISION","CONDITION","LOOP","WAIT","FORMULA","RUN_SUBFLOW","STOP","ERROR","CUSTOM_ERROR","GENERATE_SECURE_TOKEN","TEXT_TEMPLATE"]);
  for (const flow of manifest.workflows || []) {
    for (const action of flow.action?.actions || []) {
      const key = String(action.key || action.type || "").toUpperCase();
      assert.ok(allowed.has(key), `${flow.name} uses non-core primitive ${key}`);
    }
  }
});


test("Phase 2 retail workflows reopen as explicit GPT Builder nodes", () => {
  assert.equal((manifest.workflows || []).length, 17);
  for (const flow of manifest.workflows || []) {
    const actions = flow.action?.actions || [];
    const nodes = flow.action?.gptBuilderElements || [];
    assert.equal(nodes.length, actions.length, `${flow.name} Builder/runtime step count mismatch`);
    assert.ok(nodes.every((node) => node.config?.importedRuntimeAction && node.configured === true), `${flow.name} has a non-editable imported node`);
  }
});

test("Phase 2 expands short retail business processes without padding atomic flows", () => {
  const atomic = new Set(["Open Drawer","OneTill - Validate Stock","OneTill - Age Verification"]);
  const short = (manifest.workflows || []).filter((flow) => (flow.action?.actions || []).length <= 2).map((flow) => flow.name).sort();
  assert.deepEqual(short, [...atomic].sort());

  for (const name of ["Open Till Session","Close Till Session","Record Cash Movement","Record Petty Cash","Create Customer Return","Create Refund"]) {
    const flow = (manifest.workflows || []).find((item) => item.name === name);
    assert.ok(flow, name);
    assert.ok(flow.action.actions.length >= 4, name + " must expose its validation/orchestration steps");
  }

  const open = (manifest.workflows || []).find((item) => item.name === "Open Till Session").action.actions;
  assert.ok(open.some((step) => step.key === "GET_RECORDS"));
  assert.ok(open.some((step) => step.key === "CONDITION"));
  assert.ok(open.some((step) => step.key === "CUSTOM_ERROR"));

  const refund = (manifest.workflows || []).find((item) => item.name === "Create Refund").action.actions;
  assert.ok(refund.some((step) => step.key === "FORMULA"));
  assert.ok(refund.some((step) => step.key === "CONDITION"));
});
