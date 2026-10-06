import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PACKAGE_RUNTIME_FLOWS } from "../server/packages/runtimeFlowManifests.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const retiredRuntimeKeys = [
  "flow:online_order.transition",
  "flow:supplier.invoice.create",
  "flow:supplier.payment.create",
  "flow:purchase.create",
  "flow:purchase.receive",
  "flow:supplier.return.execute",
];

test("Phase 7A retires duplicate package runtime workflow sources", async () => {
  const source = await readFile(new URL("../server/packages/runtimeFlowManifests.js", import.meta.url), "utf8");
  assert.equal(PACKAGE_RUNTIME_FLOWS.length, 5);
  for (const key of retiredRuntimeKeys) {
    assert.equal(PACKAGE_RUNTIME_FLOWS.some((flow) => flow.systemKey === key), false, key);
    assert.equal(source.includes(`flow("${key}"`), false, key);
  }
});

test("Phase 7A remaining package runtime flows round-trip through GPT Builder", () => {
  for (const flow of PACKAGE_RUNTIME_FLOWS) {
    const actions = flow.action?.actions || [];
    const nodes = flow.action?.gptBuilderElements || [];
    assert.ok(actions.length >= 5, flow.systemKey + " must expose real orchestration");
    assert.equal(nodes.length, actions.length, flow.systemKey + " Builder/runtime count");
    assert.ok(nodes.every((node) => node.config?.importedRuntimeAction && node.configured === true), flow.systemKey + " editable nodes");
  }
});

test("Phase 7A system workflow catalogue guarantees Builder metadata for every executable definition", () => {
  const definitions = systemWorkflowDefinitions();
  assert.ok(definitions.length > 0);
  for (const flow of definitions) {
    const actions = flow.action?.actions || [];
    if (!actions.length) continue;
    const nodes = flow.action?.gptBuilderElements || [];
    assert.equal(flow.action.gptBuilder, true, flow.systemKey + " Builder flag");
    assert.equal(nodes.length, actions.length, flow.systemKey + " Builder/runtime count");
    assert.ok(nodes.every((node) => node.config?.importedRuntimeAction && node.configured === true), flow.systemKey + " editable nodes");
  }
  for (const key of retiredRuntimeKeys) assert.equal(definitions.some((flow) => flow.systemKey === key), false, key);
});

test("Phase 7A global OneTill catalogue no longer seeds collapsed non-atomic business workflows", async () => {
  const source = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  for (const id of [
    "validate_hold_items","hold_ready","hold_invalid",
    "get_held_sale","held_sale_found","held_sale_missing",
    "find_open_session","can_open_till","open_till_invalid",
    "cash_movement_ready","cash_movement_invalid",
    "get_open_session","can_close_till","close_till_invalid",
  ]) assert.ok(source.includes(id), id);
  assert.match(source, /gptBuilderElements: \(flow\.actions \|\| \[\]\)\.map/);
  assert.match(source, /importedRuntimeAction: step/);
});

test("Phase 7A database migration removes persisted stale duplicate runtime workflows", async () => {
  const source = await readFile(new URL("../server/database/init.js", import.meta.url), "utf8");
  assert.match(source, /0067_remove_residual_duplicate_runtime_workflows/);
  for (const key of retiredRuntimeKeys) assert.ok(source.includes(`"${key}"`), key);
  assert.match(source, /Residual duplicate runtime workflow cleanup verification failed/);
});

test("Phase 7A enforcement fails on returned duplicate or collapsed runtime workflows", async () => {
  const source = await readFile(new URL("../scripts/audit-workflow-coverage.mjs", import.meta.url), "utf8");
  assert.match(source, /COLLAPSED_RUNTIME_WORKFLOW/);
  assert.match(source, /RETIRED_DUPLICATE_RUNTIME_FLOW_RETURNED/);
  assert.match(source, /WORKFLOW_DENOMINATOR_DRIFT/);
  assert.match(source, /SHORT_WORKFLOW_COUNT_DRIFT/);
});
