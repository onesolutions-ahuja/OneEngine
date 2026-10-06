import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../server/services/platformMetadata.js", import.meta.url);

test("Phase 5 defines all seven OneStore lifecycle workflows", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const name of [
    "OneStore - Install App",
    "OneStore - Activate App",
    "OneStore - Deactivate App",
    "OneStore - Uninstall App",
    "OneStore - Start Trial",
    "OneStore - Request Licence",
    "OneStore - Upgrade App",
  ]) assert.ok(source.includes(name), name);
  for (const key of [
    "onestore_install",
    "onestore_activate",
    "onestore_deactivate",
    "onestore_uninstall",
    "onestore_trial",
    "onestore_request_licence",
    "onestore_upgrade",
  ]) assert.ok(source.includes(key), key);
});

test("Phase 5 lifecycle workflows expose validation decisions and explicit error paths", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const id of [
    "install_allowed",
    "activate_allowed",
    "deactivate_allowed",
    "uninstall_allowed",
    "trial_allowed",
    "licence_request_allowed",
    "upgrade_allowed",
  ]) assert.ok(source.includes(id), id);
  for (const id of [
    "install_not_allowed",
    "activate_not_allowed",
    "deactivate_not_allowed",
    "uninstall_not_allowed",
    "trial_not_allowed",
    "licence_request_not_allowed",
    "upgrade_not_allowed",
  ]) assert.ok(source.includes(id), id);
  assert.match(source, /const lifecycleDecision =/);
  assert.match(source, /key: "CONDITION"/);
  assert.match(source, /const lifecycleError =/);
  assert.match(source, /key: "CUSTOM_ERROR"/);
});

test("Phase 5 keeps Package Lifecycle as a generic technical primitive inside visible flows", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const operation of ["INSTALL","ACTIVATE","DEACTIVATE","UNINSTALL","TRIAL","UPGRADE"]) {
    assert.match(source, new RegExp('key: "PACKAGE_LIFECYCLE", operation: "' + operation + '"'));
  }
  assert.match(source, /key: "UPDATE_RECORD", objectKey: "tenant_app"/);
  assert.match(source, /key: "GET_RECORDS"/);
  assert.match(source, /key: "CREATE_RECORD"/);
  assert.match(source, /key: "SEND_COMMUNICATION"/);
});

test("Phase 5 persists one GPT Builder node for every lifecycle runtime step", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /gptBuilder: true/);
  assert.match(source, /layout: \{ mode: "AUTO" \}/);
  assert.match(source, /gptBuilderElements: flow\.actions\.map/);
  assert.match(source, /importedRuntimeAction: step/);
  assert.match(source, /configured: true/);
  assert.match(source, /source: "runtime_import"/);
});

test("trial and licence workflows retain their complete visible orchestration", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const id of ["activate_trial_runtime","trial_started_at","trial_expires_at","grant_trial"]) assert.ok(source.includes(id), id);
  for (const id of ["load_requested_package","create_licence_request","notify_licence_request","request_licence"]) assert.ok(source.includes(id), id);
  assert.match(source, /expression: "ADDDAYS\(NOW\(\),7\)"/);
  assert.match(source, /recipient: "platform_superadmins"/);
});
