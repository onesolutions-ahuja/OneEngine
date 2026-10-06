import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("supplier app uses package-metadata workspace routing", async () => {
  const source = await readFile(new URL("../server/packages/packageManifestCatalog.js", import.meta.url), "utf8");
  assert.match(source, /key: "suppliers"[\s\S]*route: "\/app\/objects\/supplier\?appKey=suppliers"/);
  assert.match(source, /slug: "suppliers", route: "\/app\/objects\/supplier\?appKey=suppliers"/);
});

test("supplier master data is not blocked from generic metadata CRUD", async () => {
  const source = await readFile(new URL("../server/services/platformSystemObjects.js", import.meta.url), "utf8");
  assert.equal(source.includes('["supplier", "suppliers"'), false);
});

test("supplier purchase history is a metadata relationship", async () => {
  const source = await readFile(new URL("../server/metadata/manifests/purchasing_core.json", import.meta.url), "utf8");
  assert.match(source, /"parentObjectKey": "supplier"[\s\S]*"childObjectKey": "purchase"[\s\S]*"relationshipKey": "purchases"/);
});


test("legacy supplier CRUD route is removed", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/suppliers.js"), false);
  assert.equal(server.includes("createSuppliersRouter"), false);
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(registry, /objectKey: "supplier_product"/);
  assert.match(registry, /parentObjectKey: "supplier", childObjectKey: "supplier_product", relationshipKey: "products"/);
});
