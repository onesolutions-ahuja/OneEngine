import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

test("legacy platformMetadata lifecycle authority stays deleted", async () => {
  await assert.rejects(access(new URL("../server/services/platformMetadata.js", import.meta.url)));
});

test("package lifecycle runtime remains generic and package registry contains no OneStore business orchestration", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.doesNotMatch(registry, /OneStore - Install App|OneStore - Activate App|OneStore - Request Licence/);
  assert.doesNotMatch(registry, /onestore_install|onestore_activate|onestore_request_licence/);
  assert.match(registry, /provisionPackageMetadata/);
});

test("package lifecycle behavior is not restored as compiled business action aliases", async () => {
  const workflow = await readFile(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  for (const key of ["ONESTORE_INSTALL","ONESTORE_ACTIVATE","ONESTORE_DEACTIVATE","ONESTORE_UNINSTALL","ONESTORE_REQUEST_LICENCE"]) {
    assert.equal(workflow.includes(key), false, key);
  }
});
