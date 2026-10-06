import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../server/metadata/manifests/platform.json", import.meta.url);
async function platformManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}
const expectedNames = [
  "OneStore - Install App",
  "OneStore - Activate App",
  "OneStore - Deactivate App",
  "OneStore - Uninstall App",
  "OneStore - Start Trial",
  "OneStore - Request Licence",
  "OneStore - Upgrade App",
];
const expectedButtons = [
  "onestore_install",
  "onestore_activate",
  "onestore_deactivate",
  "onestore_uninstall",
  "onestore_trial",
  "onestore_request_licence",
  "onestore_upgrade",
];

test("Phase 5 defines all seven OneStore lifecycle workflows in platform metadata", async () => {
  const manifest = await platformManifest();
  const names = new Set((manifest.workflows || []).map((flow) => flow.name));
  const buttons = new Set((manifest.buttons || []).map((button) => button.buttonKey || button.button_key));
  for (const name of expectedNames) assert.ok(names.has(name), name);
  for (const key of expectedButtons) assert.ok(buttons.has(key), key);
});

test("Phase 5 lifecycle workflows expose validation decisions and explicit error paths", async () => {
  const manifest = await platformManifest();
  const actions = (manifest.workflows || []).flatMap((flow) => flow.action?.actions || []);
  const ids = new Set(actions.map((action) => action.id));
  for (const id of [
    "install_allowed","activate_allowed","deactivate_allowed","uninstall_allowed",
    "trial_allowed","licence_request_allowed","upgrade_allowed",
    "install_not_allowed","activate_not_allowed","deactivate_not_allowed","uninstall_not_allowed",
    "trial_not_allowed","licence_request_not_allowed","upgrade_not_allowed",
  ]) assert.ok(ids.has(id), id);
  assert.ok(actions.some((action) => action.key === "CONDITION"));
  assert.ok(actions.some((action) => action.key === "CUSTOM_ERROR"));
});

test("Phase 5 keeps Package Lifecycle as a generic technical primitive inside visible flows", async () => {
  const manifest = await platformManifest();
  const actions = (manifest.workflows || []).flatMap((flow) => flow.action?.actions || []);
  const operations = new Set(actions.filter((action) => action.key === "PACKAGE_LIFECYCLE").map((action) => action.operation));
  for (const operation of ["INSTALL","ACTIVATE","DEACTIVATE","UNINSTALL","TRIAL","UPGRADE"]) assert.ok(operations.has(operation), operation);
  assert.ok(actions.some((action) => action.key === "UPDATE_RECORD" && action.objectKey === "tenant_app"));
  assert.ok(actions.some((action) => action.key === "GET_RECORDS"));
  assert.ok(actions.some((action) => action.key === "CREATE_RECORD"));
  assert.ok(actions.some((action) => action.key === "SEND_COMMUNICATION"));
});

test("Phase 5 persists one GPT Builder node for every lifecycle runtime step", async () => {
  const manifest = await platformManifest();
  for (const flow of (manifest.workflows || []).filter((item) => expectedNames.includes(item.name))) {
    assert.equal(flow.action?.gptBuilder, true, flow.name);
    assert.equal(flow.action?.layout?.mode, "AUTO", flow.name);
    assert.equal(flow.action?.gptBuilderElements?.length, flow.action?.actions?.length, flow.name);
    for (const element of flow.action?.gptBuilderElements || []) {
      assert.equal(element.configured, true);
      assert.equal(element.source, "runtime_import");
      assert.ok(element.config?.importedRuntimeAction);
    }
  }
});

test("trial and licence workflows retain their complete visible orchestration", async () => {
  const manifest = await platformManifest();
  const byName = new Map((manifest.workflows || []).map((flow) => [flow.name, flow]));
  const trial = byName.get("OneStore - Start Trial")?.action?.actions || [];
  const licence = byName.get("OneStore - Request Licence")?.action?.actions || [];
  for (const id of ["activate_trial_runtime","trial_started_at","trial_expires_at","grant_trial"]) assert.ok(trial.some((action) => action.id === id), id);
  for (const id of ["load_requested_package","create_licence_request","notify_licence_request","request_licence"]) assert.ok(licence.some((action) => action.id === id), id);
  assert.equal(trial.find((action) => action.id === "trial_expires_at")?.expression, "ADDDAYS(NOW(),7)");
  assert.equal(licence.find((action) => action.id === "notify_licence_request")?.recipient, "platform_superadmins");
});
