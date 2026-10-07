import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { oneAssistantManifest } from "../server/packages/oneAssistantManifest.js";

test("Phase 6 OneAssistant workflows are Builder-editable and explicit", () => {
  const flows = oneAssistantManifest.workflows || [];
  assert.equal(flows.length, 3);
  for (const flow of flows) {
    const actions = flow.action?.actions || [];
    const nodes = flow.action?.gptBuilderElements || [];
    assert.ok(actions.length >= 4, flow.name + " must expose its orchestration");
    assert.equal(nodes.length, actions.length, flow.name + " Builder/runtime count");
    assert.ok(nodes.every((node) => node.config?.importedRuntimeAction && node.configured === true), flow.name + " editable nodes");
  }
  const expanded = flows.find((flow) => (flow.action?.actions || []).length > 20);
  assert.ok(expanded, "manifest must retain its fully expanded complex workflow");
  assert.equal(expanded.action.gptBuilderElements.length, expanded.action.actions.length);
});

test("Phase 6 Uber Eats workflows have no collapsed 0-2 step definitions and all reopen in Builder", async () => {
  const manifest = JSON.parse(await readFile(new URL("../server/metadata/manifests/uber_eats.json", import.meta.url), "utf8"));
  assert.equal(manifest.workflows.length, 9);
  for (const flow of manifest.workflows) {
    const action = flow.action || flow;
    const actions = action.actions || [];
    const nodes = action.gptBuilderElements || [];
    assert.ok(actions.length >= 4, (flow.name || flow.label || flow.key) + " step count");
    assert.equal(nodes.length, actions.length, (flow.name || flow.label || flow.key) + " Builder/runtime count");
    assert.ok(nodes.every((node) => node.config?.importedRuntimeAction && node.configured === true), (flow.name || flow.label || flow.key) + " editable nodes");
  }
});

test("Uber product-save menu sync validates connection before running the menu subflow", async () => {
  const manifest = JSON.parse(await readFile(new URL("../server/metadata/manifests/uber_eats.json", import.meta.url), "utf8"));
  const flow = manifest.workflows.find((item) => item.key === "uber_eats_menu_sync_after_product_save");
  const actions = flow.action.actions;
  assert.deepEqual(actions.map((item) => item.key), ["GET_RECORDS","CONDITION","RUN_SUBFLOW","CUSTOM_ERROR"]);
  assert.equal(actions.find((item) => item.key === "RUN_SUBFLOW").subflowApiName, "GPT_UBER_EATS_UPLOAD_MENU");
});

test("empty legacy WhatsApp Assistant placeholder workflows are removed", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(source.includes("WhatsApp Assistant - inbound message"), false);
  assert.equal(source.includes("WhatsApp Assistant - human handoff"), false);
  assert.equal(source.includes('entry.key === "whatsapp_assistant" ? {\n        workflows:'), false);
});

test("Phase 6 retains no hidden assistant executor aliases", async () => {
  const assistant = await readFile(new URL("../server/packages/oneAssistantManifest.js", import.meta.url), "utf8");
  const uber = await readFile(new URL("../server/metadata/manifests/uber_eats.json", import.meta.url), "utf8");
  for (const token of ["CALL_FUNCTION","RUN_ASSISTANT_SUBFLOW"]) {
    assert.equal(assistant.includes(token), false, token);
    assert.equal(uber.includes(token), false, token);
  }
});
