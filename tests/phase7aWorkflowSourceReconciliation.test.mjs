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

test("Phase 7A system workflow catalogue guarantees Builder metadata", () => {
  const definitions = systemWorkflowDefinitions();
  assert.ok(definitions.length > 0);
  for (const flow of definitions) {
    const actions = flow.action?.actions || [];
    if (!actions.length) continue;
    const nodes = flow.action?.gptBuilderElements || [];
    assert.equal(flow.action.gptBuilder, true, flow.systemKey + " Builder flag");
    assert.equal(nodes.length, actions.length, flow.systemKey + " Builder/runtime count");
  }
  for (const key of retiredRuntimeKeys) assert.equal(definitions.some((flow) => flow.systemKey === key), false, key);
});

test("Phase 7A migration and architecture gate keep retired duplicates out", async () => {
  const migration = await readFile(new URL("../server/database/init.js", import.meta.url), "utf8");
  const audit = await readFile(new URL("../scripts/audit-workflow-coverage.mjs", import.meta.url), "utf8");
  assert.match(migration, /0067_remove_residual_duplicate_runtime_workflows/);
  for (const key of retiredRuntimeKeys) assert.ok(migration.includes(`"${key}"`), key);
  assert.match(audit, /COLLAPSED_RUNTIME_WORKFLOW/);
  assert.match(audit, /RETIRED_DUPLICATE_RUNTIME_FLOW_RETURNED/);
});
