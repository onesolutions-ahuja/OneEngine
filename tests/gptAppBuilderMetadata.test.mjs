import test from "node:test";
import assert from "node:assert/strict";
import {
  createBlankAppDefinition,
  compileAppDependencyGraph,
  validateAppDefinition,
  compilePortableAppManifest,
} from "../server/services/gptAppBuilderMetadata.js";

test("blank app is generic metadata with desktop and mobile pages", () => {
  const app = createBlankAppDefinition({ appKey: "sample_app", label: "Sample App" });
  assert.equal(app.app.appKey, "sample_app");
  assert.deepEqual(app.pages.map((page) => page.pageKey), ["desktop", "mobile"]);
  assert.equal(validateAppDefinition(app).valid, true);
});

test("dependency graph discovers metadata references without business vocabulary", () => {
  const app = createBlankAppDefinition({ appKey: "sample_app", label: "Sample App" });
  app.pages[0].definition.children.push({
    componentKey: "button",
    interaction: {
      flowKey: "sample_flow",
      objectKey: "sample_object",
      fieldKey: "sample_field",
      connectorKey: "sample_connector",
      permissionKey: "sample.execute",
    },
  });
  const graph = compileAppDependencyGraph(app);
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(ids.has("workflow:sample_flow"));
  assert.ok(ids.has("field:sample_object.sample_field"));
  assert.ok(ids.has("connector:sample_connector"));
  assert.ok(ids.has("permission:sample.execute"));
});

test("builder metadata rejects embedded credentials", () => {
  const app = createBlankAppDefinition({ appKey: "sample_app", label: "Sample App" });
  app.pages[0].definition = { credential: { apiKey: "must-not-be-packaged" } };
  assert.throws(() => validateAppDefinition(app), /cannot contain credential values/);
});

test("builder contract contains no business-specific object or provider names", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../server/services/gptAppBuilderMetadata.js", import.meta.url), "utf8"));
  for (const forbidden of ["createCustomer", "createVendor", "uber_eats", "deliveroo", "supplier_invoice"]) {
    assert.equal(source.includes(forbidden), false, `forbidden hardcoded vocabulary: ${forbidden}`);
  }
});


test("portable compiler resolves transitive dependencies generically", async () => {
  const app = createBlankAppDefinition({ appKey: "sample_app", label: "Sample App" });
  app.pages[0].definition.children.push({ flowKey: "sample_flow" });
  const records = new Map([
    ["workflow:sample_flow", { objectKey: "sample_object", name: "Sample Flow", action: { actionKey: "sample_action" } }],
    ["object:sample_object", { objectKey: "sample_object", label: "Sample Object", fields: [] }],
    ["action:sample_action", { actionKey: "sample_action", label: "Sample Action", connectorKey: "sample_connector" }],
    ["connector:sample_connector", { connectorKey: "sample_connector", name: "Sample Connector", authType: "none", credentialsSchema: [] }],
  ]);
  const compiled = await compilePortableAppManifest(app, async ({ type, key }) => records.get(`${type}:${key}`) || null);
  assert.equal(compiled.valid, true);
  assert.equal(compiled.manifest.rules.length, 1);
  assert.equal(compiled.manifest.actions.length, 1);
  assert.equal(compiled.manifest.connectors.length, 1);
  assert.equal(compiled.manifest.objects.length, 1);
});

test("portable compiler fails closed on unresolved dependencies", async () => {
  const app = createBlankAppDefinition({ appKey: "sample_app", label: "Sample App" });
  app.pages[0].definition.children.push({ flowKey: "missing_flow" });
  const compiled = await compilePortableAppManifest(app, async () => null);
  assert.equal(compiled.valid, false);
  assert.deepEqual(compiled.unresolved, [{ type: "workflow", key: "missing_flow" }]);
});
