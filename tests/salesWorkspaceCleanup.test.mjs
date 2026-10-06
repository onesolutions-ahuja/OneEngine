import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Sales app list surface is routed through generic Object Workspace metadata", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const packages = await readFile(new URL("../server/packages/packageManifestCatalog.js", import.meta.url), "utf8");

  assert.equal(app.includes("const SalesPage ="), false);
  assert.equal(app.includes("<SalesPage"), false);
  assert.equal(app.includes("./pages/sales/SalesPage"), false);
  assert.match(packages, /key:\s*"retail_pos"[\s\S]*?route:\s*"\/app\/objects\/sale\?appKey=retail_pos"/);
});

test("Sales cleanup removes legacy page-owned return and delivery actions", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("const ReturnsPage ="), false);
  assert.equal(app.includes("const ExchangePage ="), false);
  assert.equal(app.includes("./pages/sales/SalesPage"), false);
});
