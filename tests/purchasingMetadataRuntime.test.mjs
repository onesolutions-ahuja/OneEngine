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
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("createReturnsRouter"), false);
  const capability = await readFile(new URL("../server/packages/purchasing_core/functions.js", import.meta.url), "utf8");
  assert.match(capability, /key:"supplier\.return\.execute"/);
});


test("legacy purchasing route is only a compatibility bridge to protected purchase.create", async () => {
  const source = await readFile(new URL("../server/routes/purchases.js", import.meta.url), "utf8");
  assert.match(source, /function:purchase\.create/);
  assert.equal(source.includes('router.get('), false);
  assert.equal(source.includes('"/purchases/:id/receive"'), false);
  assert.equal(source.includes("BEGIN"), false);
  assert.equal(source.includes("SELECT "), false);
});

test("purchasing business receipt logic is package-owned, not a reusable core service", async () => {
  const capability = await readFile(new URL("../server/packages/purchasing_core/functions.js", import.meta.url), "utf8");
  assert.match(capability, /function planReceipt/);
  assert.match(capability, /async function receivePurchase/);
  assert.equal(capability.includes("../../services/purchaseReceiving.js"), false);
});


test("replenishment is metadata-owned and has no standalone business route or page", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.equal(server.includes("createReplenishmentRouter"), false);
  assert.equal(app.includes("ReplenishmentPage"), false);
  assert.equal(app.includes("openItem('replenishment')"), false);
});


test("inventory business UI and routes are removed while core stock primitives remain", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const primitive = await readFile(new URL("../server/services/inventory.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("../server/services/inventoryPlatform.js", import.meta.url), "utf8");
  assert.equal(server.includes("createInventoryRouter"), false);
  assert.equal(server.includes("createInventoryBatchesRouter"), false);
  assert.equal(app.includes("InventoryPage"), false);
  assert.equal(primitive.includes("export async function createInventoryMovement"), true);
  assert.equal(primitive.includes("export async function allocateBatchConsumption"), true);
  assert.equal(platform.includes("executeInventoryPlatformAction"), true);
});


test("customer administration is metadata-owned while runtime customer services remain compatible", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../server/routes/customers.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(app, /CustomersPage initialObjectKey="customer" appKey="customers"/);
  assert.equal(app.includes("pages/customers/CustomersPage"), false);
  assert.equal(route.includes('router.post("/customers"'), false);
  assert.equal(route.includes('router.put("/customers/:id"'), false);
  assert.equal(route.includes('router.patch("/customers/:id/status"'), false);
  assert.equal(route.includes('"/customers/import"'), false);
  assert.equal(route.includes('"/customers/export"'), false);
  assert.match(registry, /objectKey: "customer"/);
  assert.match(registry, /parentObjectKey: "customer", childObjectKey: "contact"/);
  assert.match(registry, /parentObjectKey: "customer", childObjectKey: "address"/);
  assert.match(route, /"\/customer-lookup"/);
  assert.equal(route.includes('"/customers/:id/credit"'), false);
});


test("customer credit and loyalty administration has no legacy route-local writes", async () => {
  const route = await readFile(new URL("../server/routes/customers.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  const workflows = await readFile(new URL("../server/services/systemWorkflowCatalog.js", import.meta.url), "utf8");
  assert.equal(route.includes("/loyalty/adjust"), false);
  assert.equal(route.includes("/credit/payment"), false);
  assert.equal(route.includes("/credit/adjustment"), false);
  assert.equal(route.includes("/credit/statement"), false);
  assert.match(registry, /objectKey: "customer_credit_account"/);
  assert.match(registry, /objectKey: "customer_credit_ledger"/);
  assert.match(registry, /objectKey: "loyalty_account"/);
  assert.match(registry, /objectKey: "loyalty_activity"/);
  assert.match(workflows, /customer\.credit\.limit\.check/);
});


test("layaway uses metadata ownership", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  assert.equal(app.includes("LayawayPage"), false);
  assert.equal(server.includes("createLayawaysRouter"), false);
  assert.match(metadata, /key: "layaway"/);
  assert.match(metadata, /key: "layaway_line"/);
  assert.match(metadata, /key: "layaway_payment"/);
});


test("pricing promotions and combos keep runtime pricing but remove legacy administration", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const pricingEngine = await readFile(new URL("../server/services/pricingEngine.js", import.meta.url), "utf8");
  assert.equal(server.includes("createPricingRouter"), false);
  assert.match(metadata, /key: "promotion"/);
  assert.match(metadata, /key: "price_list"/);
  assert.match(pricingEngine, /export function resolvePrice/);
});


test("sales products and categories use metadata workspace while legacy return apps are removed", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const productsRoute = await readFile(new URL("../server/routes/products.js", import.meta.url), "utf8");
  assert.match(app, /SalesPage initialObjectKey="sale" appKey="sales"/);
  assert.match(app, /ProductsPage initialObjectKey="product" appKey="products"/);
  assert.match(app, /CategoriesPage initialObjectKey="category" appKey="categories"/);
  assert.equal(app.includes("const ReturnsPage ="), false);
  assert.equal(app.includes("const ExchangePage ="), false);
  assert.match(metadata, /key: "stock_return"/);
  assert.match(productsRoute, /\/products\/catalogue/);
  assert.match(productsRoute, /\/products\/misc-line/);
});


test("gift cards online orders and attendance use metadata workspaces while runtime engines remain", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const attendance = await readFile(new URL("../server/routes/attendance.js", import.meta.url), "utf8");
  const online = await readFile(new URL("../server/routes/online.js", import.meta.url), "utf8");
  assert.match(app, /initialObjectKey="gift_card" appKey="gift-cards"/);
  assert.match(app, /initialObjectKey="employee" appKey="employees"/);
  assert.match(app, /initialObjectKey="online_order" appKey="online-orders"/);
  assert.equal(app.includes("OnlineOrdersPrep"), false);
  assert.match(metadata, /key: "gift_card"/);
  assert.match(metadata, /key: "online_order"/);
  assert.match(attendance, /function:attendance\.clock_in/);
  assert.match(attendance, /function:attendance\.clock_out/);
  assert.match(online, /online\/orders/);
});


test("sales route no longer depends on deleted legacy loyalty helpers", async () => {
  const route = await readFile(new URL("../server/routes/sales.js", import.meta.url), "utf8");
  assert.equal(route.includes("../src/utils/loyaltyPoints.js"), false);
  assert.equal(route.includes("validateRedeemConfig"), false);
  assert.equal(route.includes("validateRedeemablePoints"), false);
  assert.equal(route.includes("customer_loyalty_transactions"), false);
  assert.equal(route.includes("customer_loyalty_balances"), false);
});


test("cleanup leaves no stale deleted UI imports or duplicate canvas component", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const lookup = await readFile(new URL("../src/pages/products/GlobalProductLookupPage.jsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/pages/developer/ReactFlowCanvasUXTest.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("./pages/returns/ReturnsAdmin"), false);
  assert.equal(lookup.includes("./ProductsPage"), false);
  assert.equal((canvas.match(/export default function ReactFlowCanvasUXTest/g) || []).length, 1);
});


test("final manifest sweep removes obsolete direct business route stacks", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const pricing = await readFile(new URL("../server/services/pricingEngine.js", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../server/services/inventory.js", import.meta.url), "utf8");
  assert.equal(server.includes("createReturnsRouter"), false);
  assert.match(metadata, /key: "stock_return"/);
  assert.match(metadata, /key: "product"/);
  assert.match(pricing, /export function resolvePrice/);
  assert.match(inventory, /export async function createInventoryMovement/);
});


test("manifest sweep leaves product category segment and gift-card administration to metadata", async () => {
  const products = await readFile(new URL("../server/routes/products.js", import.meta.url), "utf8");
  const customers = await readFile(new URL("../server/routes/customers.js", import.meta.url), "utf8");
  assert.equal(/router\.(post|put|delete)\("\/categories/.test(products), false);
  assert.equal(/router\.(post|put|delete)\("\/products(?:\/import|\/:id|")/.test(products), false);
  assert.match(products, /router\.post\("\/products\/misc-line"/);
  assert.match(products, /router\.get\("\/products\/catalogue"/);
  assert.equal(/router\.(post|put|delete)\("\/customer-segments/.test(customers), false);
  assert.equal(/router\.post\("\/gift-cards(?:\/\:id\/topup|\/\:id\/block|")/.test(customers), false);
  assert.match(customers, /router\.post\("\/gift-cards\/lookup"/);
});


test("repo-wide manifest sweep keeps supplier accounts and product features read-only at legacy boundary", async () => {
  const supplier = await readFile(new URL("../server/routes/supplierAccounts.js", import.meta.url), "utf8");
  const features = await readFile(new URL("../server/routes/productFeatures.js", import.meta.url), "utf8");
  assert.equal(/router\.(post|put|patch|delete)\(/.test(supplier), false);
  assert.equal(/router\.(post|put|patch|delete)\(/.test(features), false);
  assert.match(supplier, /router\.get\("\/supplier-invoices"/);
  assert.match(features, /router\.get\("\/products\/\:id\/variants"/);
});


test("repo-wide manifest sweep removes hidden legacy hospitality scan-go and held-sale stacks", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  for (const legacy of ["createHospitalityRouter", "createScanGoRouter", "createHeldSalesRouter"]) assert.equal(server.includes(legacy), false);
  assert.match(metadata, /hospitality/);
});


test("reports use generic platform reporting instead of fixed business report routes", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../server/routes/reports.js", import.meta.url), "utf8");
  assert.equal(app.includes("pages/reports/ReportsPage"), false);
  for (const legacy of ["/reports/summary", "/reports/sales\"", "/reports/products", "/reports/payments", "/reports/customers", "/reports/inventory-overview", "/reports/inventory-movements", "/reports/till", "/reports/vat"]) {
    assert.equal(route.includes(legacy), false, legacy);
  }
  assert.match(route, /\/reports\/custom\/capabilities/);
  assert.match(route, /\/reports\/custom\/preview/);
});


test("own delivery package uses metadata workspace instead of hardcoded business route and UI", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const catalogue = await readFile(new URL("../server/services/internalAppCatalog.js", import.meta.url), "utf8");
  assert.equal(app.includes("OwnDeliveryWorkspace"), false);
  assert.match(app, /initialObjectKey="online_order" appKey="own-delivery"/);
  assert.equal(server.includes("createOwnDeliveryRouter"), false);
  assert.match(catalogue, /key: "own_delivery"/);
});


test("kiosk administration is metadata-driven while customer runtime remains package-owned", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../server/routes/kiosk.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  assert.equal(app.includes("OneKioskDevicesPage"), false);
  assert.match(app, /initialObjectKey="kiosk_device" appKey="one_kiosk"/);
  assert.match(metadata, /key: "kiosk_device"[\s\S]*table: "kiosk_devices"/);
  for (const legacy of ["/kiosk/devices/:id/settings", "/kiosk/devices/:id/age-approve", "/kiosk/devices/:id/assistance-clear", "/kiosk/orders/search", "/kiosk/printer-connectors", "/kiosk/payment-connectors"]) assert.equal(route.includes(legacy), false, legacy);
  assert.match(route, /\/kiosk\/catalogue/);
  assert.match(route, /\/kiosk\/devices\/register/);
  assert.match(route, /\/kiosk\/devices\/\:id\/heartbeat/);
});


test("store and till administration use metadata while operational till runtime remains", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../server/routes/admin.js", import.meta.url), "utf8");
  const till = await readFile(new URL("../server/routes/till.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const settingsPage = await readFile(new URL("../src/pages/settings/StoreTillSettingsPage.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("pages/stores/StoresPage"), false);
  assert.match(app, /initialObjectKey="store" appKey="stores"/);
  assert.match(metadata, /key: "store"[\s\S]*table: "stores"/);
  assert.match(metadata, /key: "terminal"[\s\S]*table: "terminals"/);
  assert.equal(admin.includes('router.put("/admin/stores/:id"'), false);
  assert.equal(admin.includes('router.put("/admin/tills/:id"'), false);
  assert.equal(settingsPage.includes("/api/admin/tills/"), false);
  assert.match(till, /\/till\/sessions\/current/);
});


test("staff app is metadata-driven while identity and RBAC administration remain platform-core", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const admin = await readFile(new URL("../server/routes/admin.js", import.meta.url), "utf8");
  assert.match(app, /initialObjectKey="employee" appKey="employees"/);
  assert.match(metadata, /key: "employee"[\s\S]*table: "users"/);
  assert.match(admin, /\/admin\/roles\/\:roleId\/permissions/);
  assert.match(admin, /\/admin\/users\/\:id\/reset-password/);
  assert.match(admin, /\/admin\/users\/\:id\/stores/);
});


test("generic settings mutation contract excludes business feature policy", async () => {
  const settingsRoute = await readFile(new URL("../server/routes/settings.js", import.meta.url), "utf8");
  for (const key of ["scanGoEnabled", "exchangeMode", "batchInventoryMode", "batchDefaultMfgRule", "batchDefaultExpiryRule", "batchDefaultExpiryDays", "loyaltyEnabled", "loyaltyEarningRate", "loyaltyMinSaleTotal", "loyaltyRedeemValuePerPoint", "loyaltyMinPointsRedeem"]) {
    const patchContract = settingsRoute.slice(settingsRoute.indexOf("const SETTINGS_PATCH_COLUMNS"), settingsRoute.indexOf("const SETTINGS_PATCH_INVALID"));
    assert.equal(patchContract.includes(key), false, key);
  }
  assert.equal(settingsRoute.includes('router.put("/settings/batch-policy"'), false);
  assert.match(settingsRoute, /dateFormat: \{ column: "date_format"/);
  assert.match(settingsRoute, /productView: \{ column: "product_view"/);
  assert.match(settingsRoute, /customerDisplayEnabled: \{ column: "customer_display_enabled"/);
});


test("accounting uses generic integration framework instead of sale-specific export stack", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const integrations = await readFile(new URL("../server/routes/integrations.js", import.meta.url), "utf8");
  assert.equal(app.includes("AccountingAdmin"), false);
  assert.equal(server.includes("createAccountingExportRouter"), false);
  assert.match(integrations, /integration_connections/);
  assert.match(integrations, /integration_endpoints/);
  assert.match(integrations, /integration_field_mappings/);
  assert.match(integrations, /\/integrations\/\:id\/endpoints/);
});
