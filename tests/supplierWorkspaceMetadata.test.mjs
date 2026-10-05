import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("supplier app uses generic workspace runtime", async () => {
  const source = await readFile(new URL("../src/pages/suppliers/SuppliersPage.jsx", import.meta.url), "utf8");
  assert.match(source, /WorkspacePage/);
  assert.match(source, /initialObjectKey="supplier"/);
  for (const forbidden of ["/api/suppliers", "SupplierEditor", "SupplierProductForm", "SupplierAccounts", "purchase_count", "total_purchase_value"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("supplier master data is not blocked from generic metadata CRUD", async () => {
  const source = await readFile(new URL("../server/services/platformSystemObjects.js", import.meta.url), "utf8");
  assert.equal(source.includes('["supplier", "suppliers"'), false);
});

test("supplier purchase history is a metadata relationship", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /parentObjectKey: "supplier", childObjectKey: "purchase", relationshipKey: "purchases"/);
});


test("legacy supplier route is read/compatibility only; master writes use generic metadata CRUD", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("routes/suppliers.js"), false);
});


test("supplier product writes use metadata CRUD; legacy supplier route is read-only", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("routes/suppliers.js"), false);
  assert.equal(server.includes("createSuppliersRouter"), false);
});
