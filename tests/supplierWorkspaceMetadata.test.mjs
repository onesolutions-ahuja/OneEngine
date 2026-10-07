import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("supplier workspace is metadata-owned and legacy page stays deleted", async () => {
  await assert.rejects(
    readFile(new URL("../src/pages/suppliers/SuppliersPage.jsx", import.meta.url), "utf8"),
    /ENOENT/
  );
  const workspace = await readFile(new URL("../src/platform/workspace/WorkspacePage.jsx", import.meta.url), "utf8");
  assert.match(workspace, /platform\/objects|platform\/runtime\/objects/);
});

test("supplier master data is not blocked from generic metadata CRUD", async () => {
  const source = await readFile(new URL("../server/services/platformSystemObjects.js", import.meta.url), "utf8");
  assert.equal(source.includes('["supplier", "suppliers"'), false);
});

test("supplier purchase history is a metadata relationship", async () => {
  const source = await readFile(new URL("../server/metadata/manifests/purchasing_core.json", import.meta.url), "utf8");
  assert.match(source, /"parentObjectKey": "supplier"[\s\S]*"childObjectKey": "purchase_ledger"[\s\S]*"relationshipKey": "purchases"/);
});

test("legacy supplier CRUD route stays removed", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/suppliers.js"), false);
  assert.equal(server.includes("createSuppliersRouter"), false);
});
