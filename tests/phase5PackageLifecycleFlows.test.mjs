import assert from "node:assert/strict";
import test from "node:test";
import { readFile, access } from "node:fs/promises";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";
import { packageDefinitions } from "../server/services/packageRegistry.js";

test("legacy source-defined platform metadata authority stays deleted", async () => {
  await assert.rejects(
    access(new URL("../server/services/platformMetadata.js", import.meta.url)),
  );
});

test("package lifecycle remains a generic technical workflow primitive", () => {
  const lifecycle = getWorkflowActionDefinition("PACKAGE_LIFECYCLE");
  assert.ok(lifecycle);
  assert.equal(typeof lifecycle.executor, "function");
  assert.deepEqual(lifecycle.requiredPermissions, ["package.install"]);
});

test("package catalogue remains declarative metadata rather than compiled OneStore orchestration", () => {
  const definitions = packageDefinitions();
  assert.ok(definitions.length > 0);
  for (const definition of definitions) {
    assert.ok(definition.packageKey);
    assert.ok(definition.manifest);
  }
});

test("OneStore lifecycle business flows are not compiled into the system workflow catalogue", () => {
  const definitions = systemWorkflowDefinitions();
  const source = definitions.map((item) => JSON.stringify(item)).join("\n");
  for (const token of [
    "OneStore - Install App",
    "OneStore - Activate App",
    "OneStore - Deactivate App",
    "OneStore - Uninstall App",
    "OneStore - Start Trial",
    "OneStore - Request Licence",
    "OneStore - Upgrade App",
  ]) assert.equal(source.includes(token), false, token);
});

test("package lifecycle runtime stays provider-neutral and operation-generic", async () => {
  const source = await readFile(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  assert.match(source, /key:\s*"PACKAGE_LIFECYCLE"/);
  for (const operation of ["INSTALL","ACTIVATE","DEACTIVATE","UNINSTALL","UPGRADE","TRIAL"]) {
    assert.ok(source.includes('"' + operation + '"'), operation);
  }
  assert.doesNotMatch(source, /onestore_install|onestore_activate|onestore_deactivate|onestore_uninstall|onestore_trial|onestore_request_licence|onestore_upgrade/);
});
