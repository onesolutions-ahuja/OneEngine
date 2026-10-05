import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Sales app list surface uses generic sale Workspace runtime", async () => {
  const source = await readFile(new URL("../src/pages/sales/SalesPage.jsx", import.meta.url), "utf8");
  assert.match(source, /WorkspacePage/);
  assert.match(source, /initialObjectKey="sale"/);
  assert.match(source, /appKey="sales"/);
  assert.equal(source.includes("cachedGet('/api/sales'"), false);
  assert.equal(source.includes("RecordListView"), false);
  assert.equal(source.includes("columnsFor"), false);
});

test("Sales cleanup preserves return navigation and shared detail export", async () => {
  const source = await readFile(new URL("../src/pages/sales/SalesPage.jsx", import.meta.url), "utf8");
  assert.match(source, /Customer Returns/);
  assert.match(source, /Supplier Returns/);
  assert.match(source, /export function SaleDetail/);
  assert.match(source, /invoice-delivery/);
  assert.match(source, /whatsapp\/resend-invoice/);
});
