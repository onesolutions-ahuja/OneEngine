import test from "node:test";
import assert from "node:assert/strict";
import { metadataManifestByPackageKey } from "../server/services/metadataManifestLoader.js";

const manifest = metadataManifestByPackageKey("retail_pos");
const objects = new Map((manifest.objects || []).map((object) => [object.objectKey, object]));
const flows = new Map((manifest.workflows || []).map((flow) => [flow.action?.systemKey || flow.name, flow]));

test("Phase 1 retail objects are metadata-backed and flow-write-only", () => {
  for (const key of ["sale_ledger","till_session","cash_movement","stock_return","stock_return_line"]) {
    assert.ok(objects.has(key), `missing metadata object ${key}`);
    assert.equal(objects.get(key).config?.flowWritesOnly, true, `${key} must write through Flow`);
  }
  for (const legacy of ["sale","sale_item","payment","refund"]) {
    assert.equal(objects.has(legacy), false, `${legacy} must not survive canonical metadata loading`);
  }
});

test("Phase 1 validations are metadata rules", () => {
  const rules = manifest.rules || [];
  for (const objectKey of ["sale_ledger","till_session","cash_movement","stock_return","stock_return_line"]) {
    assert.ok(rules.some((rule) => rule.objectKey === objectKey), `missing validation metadata for ${objectKey}`);
  }
  assert.equal(rules.some((rule) => ["sale","sale_item","payment","refund"].includes(rule.objectKey)), false);
});

test("Phase 1 business processes are editable workflow metadata", () => {
  for (const key of ["flow:till.open","flow:till.close","flow:till.cash.move","flow:return.create","flow:refund.create","flow:exchange.create","flow:sale.complete","flow:till.payment.validate","flow:till.split.payment.validate","flow:sale.totals.calculate"]) {
    assert.ok(flows.has(key), `missing metadata Flow ${key}`);
    assert.ok(Array.isArray(flows.get(key).action?.actions), `${key} has no editable Flow actions`);
  }
});

test("sale workflows resolve only to the canonical sale ledger object", () => {
  const legacyRefs = [];
  const canonicalRefs = [];
  JSON.stringify(manifest.workflows || [], (key, value) => {
    if (key === "objectKey") {
      if (["sale","sale_item","payment","refund"].includes(value)) legacyRefs.push(value);
      if (value === "sale_ledger") canonicalRefs.push(value);
    }
    return value;
  });
  assert.deepEqual(legacyRefs, []);
  assert.ok(canonicalRefs.length > 0);
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
