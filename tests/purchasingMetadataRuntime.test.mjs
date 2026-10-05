import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

test("purchasing package exposes protected metadata flows and functions", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(registry, /entry\.key === "purchasing_core"/);
  for (const key of ["purchase.create","purchase.receive","supplier.return.execute"]) assert.ok(PLATFORM_FUNCTIONS.some((item) => item.key === key), key);
  assert.match(registry, /targetKey:"Purchase Create"/);
  assert.match(registry, /targetKey:"Supplier Return Execute"/);
});

test("purchases and supplier returns use generic workspace", async () => {
  const purchase = await readFile(new URL("../src/pages/purchases/PurchasesPage.jsx", import.meta.url), "utf8");
  const returns = await readFile(new URL("../src/pages/returns/SupplierReturnsPage.jsx", import.meta.url), "utf8");
  assert.match(purchase, /initialObjectKey="purchase"/);
  assert.match(returns, /initialObjectKey="purchase_line"/);
  for (const source of [purchase,returns]) for (const value of ["/api/purchases","/api/returns","supplier-returns/available"]) assert.equal(source.includes(value),false,value);
});

test("protected transactional objects cannot use generic CRUD", async () => {
  const route = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(route, /config\?\.protectedWrites === true/);
  const workspace = await readFile(new URL("../src/pages/workspace/WorkspacePage.jsx", import.meta.url), "utf8");
  assert.match(workspace, /protectedWrites/);
});

test("purchase line system metadata does not invent company scope", async () => {
  const source = await readFile(new URL("../server/services/platformSystemObjects.js", import.meta.url), "utf8");
  assert.match(source, /"purchase_line", "purchase_items".*companyScoped: false/);
});


test("purchase create API delegates business behavior to the protected system workflow", async () => {
  const source = await readFile(new URL("../server/routes/purchases.js", import.meta.url), "utf8");
  assert.match(source, /systemKey: "function:purchase\.create"/);
  assert.match(source, /extraContext: \{ pool \}/);
  for (const forbidden of [
    "INSERT INTO purchases",
    "INSERT INTO purchase_items",
    "INSERT INTO suppliers",
    "validatePurchaseItems",
    "insertPurchaseLines",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("purchase create capability preserves optional initial receipt and metadata inputs", async () => {
  const source = await readFile(new URL("../server/packages/purchasing_core/functions.js", import.meta.url), "utf8");
  assert.match(source, /Array\.isArray\(inputs\.receiveItems\)\?inputs\.receiveItems:null/);
  assert.match(source, /referenceNumber:inputs\.receivingReference\|\|null/);
  assert.match(source, /const platformInput=req\?\.body\?\.platform \|\| null/);
});


test("supplier feed preview stays neutral and does not prescribe business endpoints or screens", async () => {
  const matcher = await readFile(new URL("../server/services/supplierFeedMatch.js", import.meta.url), "utf8");
  const route = await readFile(new URL("../server/routes/integrations.js", import.meta.url), "utf8");
  const ui = await readFile(new URL("../src/pages/integrations/SupplierFeedPreview.jsx", import.meta.url), "utf8");
  for (const source of [matcher, route, ui]) {
    assert.equal(source.includes("POST /api/products"), false);
    assert.equal(source.includes("POST /api/purchases"), false);
    assert.equal(source.includes("Add via Purchases"), false);
    assert.equal(source.includes("Create via Products"), false);
  }
  assert.equal(matcher.includes("purchaseLine"), false);
});


test("legacy supplier return endpoints are removed in favor of protected metadata action", async () => {
  const route = await readFile(new URL("../server/routes/returns.js", import.meta.url), "utf8");
  assert.equal(route.includes('"/returns/supplier"'), false);
  assert.equal(route.includes('"/supplier-returns/available"'), false);
  assert.equal(route.includes("INSERT INTO supplier_ledger_entries"), false);
  const capability = await readFile(new URL("../server/packages/purchasing_core/functions.js", import.meta.url), "utf8");
  assert.match(capability, /key:"supplier\.return\.execute"/);
});
