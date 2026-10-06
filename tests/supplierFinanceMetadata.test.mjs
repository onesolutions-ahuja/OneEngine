import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("finance metadata has real workflows and no phantom handlers", async () => {
  const source = await readFile(new URL("../server/metadata/manifests/finance_core.json", import.meta.url), "utf8");
  for (const key of ["SUPPLIER_INVOICE_MANAGE","SUPPLIER_PAYMENT_MANAGE","SUPPLIER_LEDGER_VIEW"]) assert.equal(source.includes(key), false, key);
  assert.match(source,/"name": "Supplier Payment Execute"/);
  assert.match(source,/"apiName": "paid_amount"/);
  assert.match(source,/"apiName": "outstanding_amount"/);
});
test("supplier invoice payment credit and debit are complete editable metadata Flows", async () => {
  const manifest = JSON.parse(await readFile(new URL("../server/metadata/manifests/finance_core.json", import.meta.url), "utf8"));
  const byName = new Map(manifest.workflows.map((flow) => [flow.name, flow]));
  for (const name of ["Supplier Invoice Create","Supplier Payment Execute","Supplier Credit Create","Supplier Debit Create","Supplier Credit Note Create"]) {
    const flow = byName.get(name);
    assert.ok(flow, name);
    assert.ok(Array.isArray(flow.inputContract) && flow.inputContract.length, name + " inputs");
    assert.ok(Array.isArray(flow.outputContract) && flow.outputContract.length, name + " outputs");
    assert.equal(flow.actions.some((action) => action.key === "RUN_SUBFLOW" && /^SUPPLIER_/.test(action.subflowApiName || "")), false, name);
  }
  const invoice = byName.get("Supplier Invoice Create");
  assert.deepEqual(invoice.actions.map((a) => a.objectKey), ["supplier_invoice","supplier_ledger"]);
  assert.equal(invoice.actions[1].fieldValues.reference_id.path, "steps.create_invoice.created.id");
  const payment = byName.get("Supplier Payment Execute");
  assert.deepEqual(payment.actions.map((a) => a.objectKey), ["supplier_payment","supplier_payment_allocation","supplier_ledger"]);
  assert.equal(payment.actions[1].fieldValues.payment_id.path, "steps.create_payment.created.id");
  assert.equal(payment.actions[2].fieldValues.reference_id.path, "steps.create_payment.created.id");
  assert.equal(payment.actions[0].checkMatchingRecords, true);
  for (const name of ["Supplier Credit Create","Supplier Debit Create","Supplier Credit Note Create"]) {
    assert.equal(byName.get(name).actions[0].checkMatchingRecords, true, name + " idempotency");
  }
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
});
