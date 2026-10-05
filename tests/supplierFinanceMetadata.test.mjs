import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

test("supplier accounting functions are package-owned", async () => {
  const registry = await readFile(new URL("../server/services/platformFunctionRegistry.js", import.meta.url), "utf8");
  assert.equal(registry.includes('key: "supplier.payment.execute"'), false);
  for (const key of ["supplier.payment.execute","supplier.invoice.create","supplier.ledger.adjust"]) assert.ok(PLATFORM_FUNCTIONS.some((item) => item.key === key), key);
});
test("finance metadata has real workflows and no phantom handlers", async () => {
  const source = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  for (const key of ["SUPPLIER_INVOICE_MANAGE","SUPPLIER_PAYMENT_MANAGE","SUPPLIER_LEDGER_VIEW"]) assert.equal(source.includes(key), false, key);
  assert.match(source,/Supplier Payment Execute/);
  assert.match(source,/paid_amount/);
  assert.match(source,/outstanding_balance/);
});
test("related action choices scope through record relationships", async () => {
  const source = await readFile(new URL("../src/components/platform/MetadataActionButtons.jsx", import.meta.url), "utf8");
  assert.match(source,/relationshipKey/);
  assert.match(source,/parentRecordId/);
});
test("bootstrap foundations honor dependency order", async () => {
  const source = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  assert.match(source,/visitFoundation/);
  assert.match(source,/manifest\?\.dependencies/);
});


test("supplier finance write routes delegate invoice and ledger business logic to package functions", async () => {
  const source = await readFile(new URL("../server/routes/supplierAccounts.js", import.meta.url), "utf8");
  assert.match(source, /function:supplier\.invoice\.create/);
  assert.match(source, /function:supplier\.ledger\.adjust/);
  assert.match(source, /function:supplier\.payment\.execute/);
  assert.equal(source.includes("INSERT INTO supplier_invoices"), false);
  assert.equal(source.includes("INSERT INTO supplier_ledger_entries"), false);
});
