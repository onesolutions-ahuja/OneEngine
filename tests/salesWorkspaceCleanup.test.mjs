import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Sales app navigation is package-metadata owned", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../server/packages/packageManifestCatalog.js", import.meta.url), "utf8");
  assert.equal(app.includes('initialObjectKey="sale"'), false);
  assert.equal(app.includes("activeApp === 'sales'"), false);
  assert.match(app, /catalogAppForNavigation\(\[\.\.\.runtimeApps, \.\.\.storeApps\], target\)/);
  assert.match(catalog, /key: "retail_pos"[\s\S]*route: "\/app\/objects\/sale\?appKey=retail_pos"/);
});

test("Sales cleanup keeps business routing out of App.jsx", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const token of ["./pages/sales/SalesPage", "SupplierReturnsPage", "ProductsPage", "CustomersPage"]) {
    assert.equal(app.includes(token), false, token);
  }
});
