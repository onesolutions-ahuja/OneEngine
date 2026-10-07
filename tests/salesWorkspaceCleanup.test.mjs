import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Sales app list surface resolves through the generic Workspace runtime", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /const WorkspacePage = lazyWithRecovery\(\(\) => import\('\.\/platform\/workspace\/WorkspacePage'\)\)/);
  assert.match(app, /activeApp === 'workspace'/);
  assert.match(app, /initialObjectKey=\{routeState\.objectKey \|\| ''\}/);
  assert.match(app, /appKey=\{routeState\.appKey \|\| ''\}/);
  assert.equal(app.includes("./pages/sales/SalesPage"), false);
});

test("Sales cleanup removes legacy page-owned return and delivery actions", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("const ReturnsPage ="), false);
  assert.equal(app.includes("const ExchangePage ="), false);
  assert.equal(app.includes("./pages/sales/SalesPage"), false);
});
