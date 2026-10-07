import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const retiredRuntimeKeys = [
  "flow:online_order.transition",
  "flow:supplier.invoice.create",
  "flow:supplier.payment.create",
  "flow:purchase.create",
  "flow:purchase.receive",
  "flow:supplier.return.execute",
];

test("Phase 7A business workflows live in declarative package manifests", () => {
  const flows = packageDefinitions().flatMap((definition) => definition.manifest?.workflows || []);
  for (const key of retiredRuntimeKeys) assert.equal(flows.some((flow) => flow.systemKey === key), false, key);
  for (const key of ["flow:attendance.clock_in","flow:attendance.clock_out","flow:inventory.movement.create","flow:online_order.create","flow:supplier.ledger.adjust"]) {
    assert.ok(flows.some((flow) => flow.systemKey === key), key);
  }
});

test("Phase 7A package metadata workflows round-trip through GPT Builder", () => {
  const flows = packageDefinitions().flatMap((definition) => definition.manifest?.workflows || []).filter((flow) => flow.systemKey);
  for (const flow of flows) {
    const actions = flow.action?.actions || [];
    const nodes = flow.action?.gptBuilderElements || [];
    assert.ok(actions.length > 0, flow.systemKey + " must expose orchestration");
    assert.equal(nodes.length, actions.length, flow.systemKey + " Builder/metadata count");
    assert.ok(nodes.every((node) => node.config?.importedMetadataAction && node.configured === true), flow.systemKey + " editable nodes");
  }
});

test("Phase 7A system workflow catalogue guarantees Builder metadata", () => {
  const definitions = systemWorkflowDefinitions();
  for (const flow of definitions) {
    const actions = flow.action?.actions || [];
    if (!actions.length) continue;
    const nodes = flow.action?.gptBuilderElements || [];
    assert.equal(flow.action.gptBuilder, true, flow.systemKey + " Builder flag");
    assert.equal(nodes.length, actions.length, flow.systemKey + " Builder/runtime count");
  }
  for (const key of retiredRuntimeKeys) assert.equal(definitions.some((flow) => flow.systemKey === key), false, key);
});

test("Phase 7A retired source-defined OneTill metadata authority stays deleted", async () => {
  await assert.rejects(readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8"));
  const bootstrap = await readFile(new URL("../server/services/platformBootstrap.js", import.meta.url), "utf8");
  assert.match(bootstrap, /bootstrapFoundation/);
  assert.match(bootstrap, /provisionPackageMetadata/);
});

test("Phase 7A migration and architecture gate keep retired duplicates out", async () => {
  const migration = await readFile(new URL("../server/database/init.js", import.meta.url), "utf8");
  const audit = await readFile(new URL("../scripts/audit-workflow-coverage.mjs", import.meta.url), "utf8");
  assert.match(migration, /0067_remove_residual_duplicate_runtime_workflows/);
  for (const key of retiredRuntimeKeys) assert.ok(migration.includes(`"${key}"`), key);
  assert.match(audit, /EXECUTABLE_BUSINESS_FLOW_MANIFEST_PRESENT/);
  assert.match(audit, /RETIRED_PLATFORM_METADATA_PRESENT/);
});
