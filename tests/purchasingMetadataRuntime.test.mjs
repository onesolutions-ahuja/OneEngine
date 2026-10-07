import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

const manifestUrl = new URL("../server/metadata/manifests/purchasing_core.json", import.meta.url);

test("purchasing transactions are metadata Flow owned", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const objectKeys = new Set(manifest.objects.map((item) => item.objectKey));
  for (const key of ["purchase_ledger","purchase_line","purchase_receipt","stock_return","stock_return_line"]) assert.ok(objectKeys.has(key), key);
  for (const object of manifest.objects) assert.equal(object.config?.flowWritesOnly, true, object.objectKey);
  for (const key of ["purchase_line","purchase_receipt"]) {
    const object = manifest.objects.find((item) => item.objectKey === key);
    assert.equal(object.config?.internal, true, key);
    assert.equal(object.config?.childStorage, true, key);
    assert.equal(object.config?.generateOneId, false, key);
  }
  const names = new Set(manifest.workflows.map((flow) => flow.name));
  for (const name of ["Purchase Create","Purchase Receive","Supplier Return Execute"]) assert.ok(names.has(name), name);
  for (const key of ["purchase.create","purchase.receive","supplier.return.execute"]) assert.equal(PLATFORM_FUNCTIONS.some((item) => item.key === key), false, key);
});

test("purchase and supplier return parent IDs come from created records", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const flows = new Map(manifest.workflows.map((flow) => [flow.name, flow]));
  const create = flows.get("Purchase Create");
  const ret = flows.get("Supplier Return Execute");
  const line = create.actions.find((action) => action.objectKey === "purchase_line");
  const returnLine = ret.actions.find((action) => action.objectKey === "stock_return_line");
  assert.equal(line.commonFieldValues.purchase_id.path, "steps.create_purchase.created.id");
  assert.equal(returnLine.commonFieldValues.return_id.path, "steps.create_return.created.id");
});

test("purchases and supplier returns no longer ship dedicated business pages or endpoints", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/platform/workspace/WorkspacePage.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("pages/purchases/PurchasesPage"), false);
  assert.equal(app.includes("pages/returns/SupplierReturnsPage"), false);
  assert.ok(workspace.length > 0);
  for (const value of ["/api/purchases","/api/returns","supplier-returns/available"]) assert.equal(app.includes(value), false, value);
});

test("legacy purchasing and supplier-return business routes are removed", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  for (const legacy of ["./routes/purchases.js","createPurchasesRouter","createReturnsRouter","./routes/suppliers.js","createSuppliersRouter","./routes/supplierAccounts.js","createSupplierAccountsRouter"]) {
    assert.equal(server.includes(legacy), false, legacy);
  }
});

test("generic CRUD protects Flow-owned purchasing transaction objects", async () => {
  const platform = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(platform, /config\?\.flowWritesOnly === true/);
  assert.match(platform, /SYSTEM_OBJECT_OPERATION_REQUIRED/);
});

test("Phase 2 has no legacy direct SQL business writers", async () => {
  const treeTargets = [
    "../server/services/platformFunctionRegistry.js",
    "../server/services/platformWorkflow.js",
    "../server/server.js",
  ];
  const forbidden = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:purchase_ledger|purchase_items|purchase_receipts|suppliers|supplier_invoices|supplier_payments|supplier_payment_allocations|supplier_ledger_entries|stock_returns|stock_return_items)\b/i;
  for (const target of treeTargets) {
    const source = await readFile(new URL(target, import.meta.url), "utf8");
    assert.equal(forbidden.test(source), false, target);
  }
});

test("deleted purchasing and supplier business executors do not return", async () => {
  const registry = await readFile(new URL("../server/services/platformFunctionRegistry.js", import.meta.url), "utf8");
  for (const key of ["purchase.create","purchase.receive","supplier.return.execute","supplier.payment.execute","supplier.invoice.create","supplier.ledger.adjust"]) {
    assert.equal(registry.includes(key), false, key);
  }
});


test("Phase 3 purchasing flows are explicit and Builder-editable", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const byName = new Map(manifest.workflows.map((flow) => [flow.name, flow]));
  for (const name of ["Purchase Create","Purchase Receive","Supplier Return Execute"]) {
    const flow = byName.get(name);
    assert.ok(flow.actions.length >= 5, name + " must expose validation and orchestration steps");
    assert.equal(flow.gptBuilderElements.length, flow.actions.length, name + " Builder/runtime count");
    assert.ok(flow.gptBuilderElements.every((node) => node.config?.importedRuntimeAction && node.configured === true), name + " editable Builder nodes");
    assert.ok(flow.actions.some((action) => action.key === "CONDITION"), name + " decision");
    assert.ok(flow.actions.some((action) => action.key === "CUSTOM_ERROR"), name + " explicit failure path");
  }
  assert.ok(byName.get("Purchase Create").actions.some((action) => action.key === "FORMULA"));
  assert.ok(byName.get("Purchase Receive").actions.some((action) => action.key === "GET_RECORDS"));
  assert.ok(byName.get("Supplier Return Execute").actions.some((action) => action.key === "FORMULA"));
});
