import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("business app list surfaces resolve through generic Workspace metadata", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /api\/platform\/runtime\/apps/);
  assert.match(app, /activeRuntimeDefinition\.objectKey/);
  assert.equal(app.includes("initialObjectKey=\"sale\""), false);
  assert.equal(app.includes("./pages/sales/SalesPage"), false);
});

test("Sales cleanup removes legacy page-owned return and delivery actions", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("const ReturnsPage ="), false);
  assert.equal(app.includes("const ExchangePage ="), false);
  assert.equal(app.includes("./pages/sales/SalesPage"), false);
});
