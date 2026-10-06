import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../server/metadata/manifests/retail_pos.json", import.meta.url), "utf8"));
const objects = new Map((manifest.objects || []).map((object) => [object.objectKey, object]));
const flows = new Map((manifest.workflows || []).map((flow) => [flow.action?.systemKey || flow.name, flow]));

test("Phase 1 retail objects are metadata-backed and flow-write-only", () => {
  for (const key of ["sale","sale_item","payment","till_session","cash_movement","refund","stock_return","stock_return_line"]) {
    assert.ok(objects.has(key), `missing metadata object ${key}`);
    assert.equal(objects.get(key).config?.flowWritesOnly, true, `${key} must write through Flow`);
  }
});

test("Phase 1 validations are metadata rules", () => {
  const rules = manifest.rules || [];
  for (const objectKey of ["sale","sale_item","payment","till_session","cash_movement","refund","stock_return","stock_return_line"]) {
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
  const allowed = new Set(["GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD","BULK_UPDATE_RECORDS","CREATE_RELATED_RECORD","UPDATE_RELATED_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP","ASSIGN_RECORD","ASSIGNMENT","DECISION","CONDITION","LOOP","WAIT","FORMULA","RUN_SUBFLOW","STOP","ERROR","CUSTOM_ERROR"]);
  for (const flow of manifest.workflows || []) {
    for (const action of flow.action?.actions || []) {
      const key = String(action.key || action.type || "").toUpperCase();
      assert.ok(allowed.has(key), `${flow.name} uses non-core primitive ${key}`);
    }
  }
});
