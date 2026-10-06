import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

test("supplier accounting functions are package-owned", async () => {
  const registry = await readFile(new URL("../server/services/platformFunctionRegistry.js", import.meta.url), "utf8");
  assert.equal(registry.includes('key: "supplier.payment.execute"'), false);
  for (const key of ["supplier.payment.execute","supplier.invoice.create","supplier.ledger.adjust"]) assert.equal(PLATFORM_FUNCTIONS.some((item) => item.key === key), false, key);
});
test("finance metadata has real workflows and no phantom handlers", async () => {
  const source = await readFile(new URL("../server/metadata/manifests/finance_core.json", import.meta.url), "utf8");
  for (const key of ["SUPPLIER_INVOICE_MANAGE","SUPPLIER_PAYMENT_MANAGE","SUPPLIER_LEDGER_VIEW"]) assert.equal(source.includes(key), false, key);
  assert.match(source,/"name": "Supplier Payment Execute"/);
  assert.match(source,/"apiName": "paid_amount"/);
  assert.match(source,/"apiName": "outstanding_amount"/);
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


test("supplier finance legacy route is removed and writes remain Flow-owned", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/supplierAccounts.js"), false);
  assert.equal(server.includes("createSupplierAccountsRouter"), false);
  for (const key of ["supplier.payment.execute","supplier.invoice.create","supplier.ledger.adjust"]) {
    assert.equal(PLATFORM_FUNCTIONS.some((item) => item.key === key), false, key);
  }
});
