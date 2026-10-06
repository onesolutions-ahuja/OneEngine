import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const actionOf = (flow) => flow?.action || flow || {};
const actionsOf = (flow) => Array.isArray(actionOf(flow).actions) ? actionOf(flow).actions : [];
const nodesOf = (flow) => Array.isArray(actionOf(flow).gptBuilderElements) ? actionOf(flow).gptBuilderElements : [];

test("Phase 7 every package workflow persists one Builder node per runtime step", () => {
  const missing = [];
  const packageFlows = [];
  for (const pkg of packageDefinitions()) {
    for (const flow of pkg.manifest?.workflows || []) {
      packageFlows.push({ packageKey: pkg.packageKey, name: flow.name || flow.label || flow.key, flow });
      if (actionsOf(flow).length !== nodesOf(flow).length) {
        missing.push({ packageKey: pkg.packageKey, name: flow.name || flow.label || flow.key, steps: actionsOf(flow).length, nodes: nodesOf(flow).length });
      }
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(packageFlows.length > 0);
});

test("Phase 7 every generated system workflow has matching Builder nodes", () => {
  const flows = systemWorkflowDefinitions();
  const missing = flows.filter((flow) => actionsOf(flow).length !== nodesOf(flow).length)
    .map((flow) => ({ key: flow.systemKey, steps: actionsOf(flow).length, nodes: nodesOf(flow).length }));
  assert.deepEqual(missing, []);
  assert.ok(flows.every((flow) => !String(flow.systemKey || "").startsWith("action:")));
  assert.ok(flows.every((flow) => !String(flow.systemKey || "").startsWith("job:")));
});

test("Phase 7 retired duplicate runtime workflow keys stay removed", async () => {
  const source = await readFile(new URL("../server/packages/runtimeFlowManifests.js", import.meta.url), "utf8");
  for (const key of [
    "flow:online_order.transition",
    "flow:supplier.invoice.create",
    "flow:supplier.payment.create",
    "flow:purchase.create",
    "flow:purchase.receive",
    "flow:supplier.return.execute",
  ]) assert.equal(source.includes(`flow("${key}"`), false, key);
  for (const key of [
    "flow:attendance.clock_in",
    "flow:attendance.clock_out",
    "flow:inventory.movement.create",
    "flow:online_order.create",
    "flow:supplier.ledger.adjust",
  ]) assert.equal(source.includes(`flow("${key}"`), true, key);
});

test("Phase 7 residual global OneTill business flows expose validation and Builder metadata", async () => {
  const source = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  for (const id of [
    "find_open_session","open_session_allowed","open_session_error",
    "cash_in_amount_valid","cash_in_allowed","cash_in_error",
    "cash_out_amount_valid","cash_out_allowed","cash_out_error",
    "get_open_session","close_session_allowed","close_session_error",
  ]) assert.ok(source.includes(id), id);
  assert.match(source, /gptBuilderElements: flow\.actions\.map/);
  assert.match(source, /importedRuntimeAction: step/);
});

test("Phase 7 database cleanup retires duplicate runtime rows", async () => {
  const source = await readFile(new URL("../server/database/init.js", import.meta.url), "utf8");
  assert.match(source, /0067_remove_residual_duplicate_runtime_workflows/);
  for (const key of [
    "flow:online_order.transition",
    "flow:supplier.invoice.create",
    "flow:supplier.payment.create",
    "flow:purchase.create",
    "flow:purchase.receive",
    "flow:supplier.return.execute",
  ]) assert.ok(source.includes(key), key);
});

test("Phase 7 no hidden workflow executors return", async () => {
  for (const file of [
    "../server/services/systemWorkflowCatalog.js",
    "../server/packages/runtimeFlowManifests.js",
    "../server/packages/oneAssistantManifest.js",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.equal(source.includes("CALL_FUNCTION"), false, file);
    assert.equal(source.includes("RUN_ASSISTANT_SUBFLOW"), false, file);
  }
});


test("Phase 7 reports the exact remaining short-flow denominator", () => {
  const packageFlows = [];
  for (const pkg of packageDefinitions()) {
    for (const flow of pkg.manifest?.workflows || []) {
      packageFlows.push({
        source: `package:${pkg.packageKey}`,
        name: flow.name || flow.label || flow.key || "(unnamed)",
        steps: actionsOf(flow).length,
      });
    }
  }
  const systemFlows = systemWorkflowDefinitions().map((flow) => ({
    source: "system",
    name: flow.name || flow.systemKey || "(unnamed)",
    steps: actionsOf(flow).length,
  }));
  const unique = new Map();
  for (const item of [...packageFlows, ...systemFlows]) {
    const key = `${item.source}|${item.name}`;
    unique.set(key, item);
  }
  const all = [...unique.values()];
  const short = all.filter((item) => item.steps <= 2);
  console.log("PHASE7_WORKFLOW_COUNTS", JSON.stringify({
    total: all.length,
    shortCount: short.length,
    short,
  }));
  assert.equal(short.some((item) => item.steps === 0), false, "zero-step workflows are forbidden");
});
