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
  const createInvoice = invoice.actions.find((a) => a.id === "create_invoice");
  const invoiceLedger = invoice.actions.find((a) => a.id === "post_invoice_ledger");
  assert.equal(createInvoice.objectKey, "supplier_invoice");
  assert.equal(invoiceLedger.objectKey, "supplier_ledger");
  assert.equal(invoiceLedger.fieldValues.reference_id.path, "steps.create_invoice.created.id");
  const payment = byName.get("Supplier Payment Execute");
  const createPayment = payment.actions.find((a) => a.id === "create_payment");
  const allocation = payment.actions.find((a) => a.id === "create_allocation");
  const paymentLedger = payment.actions.find((a) => a.id === "post_payment_ledger");
  assert.equal(createPayment.objectKey, "supplier_payment");
  assert.equal(allocation.objectKey, "supplier_payment_allocation");
  assert.equal(paymentLedger.objectKey, "supplier_ledger");
  assert.equal(allocation.fieldValues.payment_id.path, "steps.create_payment.created.id");
  assert.equal(paymentLedger.fieldValues.reference_id.path, "steps.create_payment.created.id");
  assert.equal(createPayment.checkMatchingRecords, true);
  for (const name of ["Supplier Credit Create","Supplier Debit Create","Supplier Credit Note Create"]) {
    assert.equal(byName.get(name).actions.find((a) => a.id === "create_ledger_adjustment").checkMatchingRecords, true, name + " idempotency");
  }
});

test("related action choices scope through record relationships", async () => {
  const source = await readFile(new URL("../src/components/platform/MetadataActionButtons.jsx", import.meta.url), "utf8");
  assert.match(source,/relationshipKey/);
  assert.match(source,/parentRecordId/);
});

test("supplier finance child storage is hidden from standalone OneIDs", async () => {
  const manifest = JSON.parse(await readFile(new URL("../server/metadata/manifests/finance_core.json", import.meta.url), "utf8"));
  for (const key of ["supplier_invoice","supplier_payment","supplier_payment_allocation"]) {
    const object = manifest.objects.find((item) => item.objectKey === key);
    assert.ok(object, key);
    assert.equal(object.config?.internal, true, key);
    assert.equal(object.config?.childStorage, true, key);
    assert.equal(object.config?.generateOneId, false, key);
  }
});

test("supplier finance legacy route is removed and writes remain Flow-owned", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/supplierAccounts.js"), false);
  assert.equal(server.includes("createSupplierAccountsRouter"), false);
  for (const key of ["supplier.payment.execute","supplier.invoice.create","supplier.ledger.adjust"]) {
    assert.equal(PLATFORM_FUNCTIONS.some((item) => item.key === key), false, key);
  }
});


test("Phase 3 supplier finance flows are stepwise and Builder-editable", async () => {
  const manifest = JSON.parse(await readFile(new URL("../server/metadata/manifests/finance_core.json", import.meta.url), "utf8"));
  const expectedMinimum = new Map([
    ["Supplier Invoice Create", 6],
    ["Supplier Payment Execute", 6],
    ["Supplier Credit Create", 4],
    ["Supplier Debit Create", 4],
    ["Supplier Credit Note Create", 4],
  ]);
  for (const flow of manifest.workflows) {
    assert.ok(flow.actions.length >= expectedMinimum.get(flow.name), flow.name + " step count");
    assert.equal(flow.gptBuilderElements.length, flow.actions.length, flow.name + " Builder/runtime count");
    assert.ok(flow.gptBuilderElements.every((node) => node.config?.importedRuntimeAction && node.configured === true), flow.name + " editable Builder nodes");
    assert.ok(flow.actions.some((action) => action.key === "FORMULA"), flow.name + " validation formula");
    assert.ok(flow.actions.some((action) => action.key === "CONDITION"), flow.name + " decision");
    assert.ok(flow.actions.some((action) => action.key === "CUSTOM_ERROR"), flow.name + " failure path");
  }
  assert.ok(manifest.workflows.find((flow) => flow.name === "Supplier Invoice Create").actions.some((action) => action.key === "GET_RECORDS"));
});
