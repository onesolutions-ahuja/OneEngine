import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../server/metadata/manifests/platform.json", import.meta.url);
const load = async () => JSON.parse(await readFile(sourceUrl, "utf8"));

test("Phase 5 defines all seven OneStore lifecycle workflows", async () => {
  const manifest = await load();
  const names = new Set(manifest.workflows.map((flow) => flow.name));
  const keys = new Set(manifest.buttons.map((button) => button.buttonKey));
  for (const name of ["OneStore - Install App","OneStore - Activate App","OneStore - Deactivate App","OneStore - Uninstall App","OneStore - Start Trial","OneStore - Request Licence","OneStore - Upgrade App"]) assert.ok(names.has(name), name);
  for (const key of ["onestore_install","onestore_activate","onestore_deactivate","onestore_uninstall","onestore_trial","onestore_request_licence","onestore_upgrade"]) assert.ok(keys.has(key), key);
});

test("Phase 5 lifecycle workflows expose validation decisions and explicit error paths", async () => {
  const manifest = await load();
  const actions = manifest.workflows.flatMap((flow) => flow.actions || []);
  for (const id of ["install_allowed","activate_allowed","deactivate_allowed","uninstall_allowed","trial_allowed","licence_request_allowed","upgrade_allowed","install_not_allowed","activate_not_allowed","deactivate_not_allowed","uninstall_not_allowed","trial_not_allowed","licence_request_not_allowed","upgrade_not_allowed"]) assert.ok(actions.some((step) => step.id === id), id);
  assert.ok(actions.some((step) => step.key === "CONDITION"));
  assert.ok(actions.some((step) => step.key === "CUSTOM_ERROR"));
});

test("Phase 5 keeps Package Lifecycle as a generic technical primitive inside visible flows", async () => {
  const manifest = await load();
  const actions = manifest.workflows.flatMap((flow) => flow.actions || []);
  for (const operation of ["INSTALL","ACTIVATE","DEACTIVATE","UNINSTALL","TRIAL","UPGRADE"]) assert.ok(actions.some((step) => step.key === "PACKAGE_LIFECYCLE" && step.operation === operation), operation);
  for (const key of ["UPDATE_RECORD","GET_RECORDS","CREATE_RECORD","SEND_COMMUNICATION"]) assert.ok(actions.some((step) => step.key === key), key);
});

test("Phase 5 persists Builder-editable lifecycle metadata", async () => {
  const manifest = await load();
  for (const flow of manifest.workflows) {
    assert.equal(flow.triggerKey, "manual");
    assert.ok(Array.isArray(flow.actions) && flow.actions.length > 0, flow.name);
  }
});

test("trial and licence workflows retain their complete visible orchestration", async () => {
  const manifest = await load();
  const actions = manifest.workflows.flatMap((flow) => flow.actions || []);
  for (const id of ["activate_trial_runtime","trial_started_at","trial_expires_at","grant_trial","load_requested_package","create_licence_request","notify_licence_request","request_licence"]) assert.ok(actions.some((step) => step.id === id), id);
  assert.ok(actions.some((step) => step.expression === "ADDDAYS(NOW(),7)"));
  assert.ok(actions.some((step) => step.recipient === "platform_superadmins"));
});
