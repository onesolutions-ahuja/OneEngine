import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PLATFORM_FUNCTIONS } from "../server/services/platformFunctionRegistry.js";

test("purchasing package exposes protected metadata flows and functions", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(registry, /entry\.key === "purchasing_core"/);
  for (const key of ["purchase.create","purchase.receive","supplier.return.execute"]) assert.equal(PLATFORM_FUNCTIONS.some((item) => item.key === key), false, key);
  for (const flow of ["Purchase Create","Purchase Receive","Supplier Return Execute"]) assert.ok(registry.includes(flow), flow);
});

test("purchases and supplier returns route directly to generic workspace", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /WorkspacePage initialObjectKey="purchase" appKey="purchases"/);
  assert.match(app, /WorkspacePage initialObjectKey="purchase_line" appKey="supplier-returns"/);
  assert.equal(app.includes("PurchasesPage"), false);
  assert.equal(app.includes("SupplierReturnsPage"), false);
});

test("protected transactional objects cannot use generic CRUD", async () => {
  const route = await readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8");
  assert.match(route, /config\?\.protectedWrites === true/);
  const workspace = await readFile(new URL("../src/platform/workspace/WorkspacePage.jsx", import.meta.url), "utf8");
  assert.match(workspace, /protectedWrites/);
});

test("system object helper contains no business-specific purchase metadata", async () => {
  const source = await readFile(new URL("../server/services/platformSystemObjects.js", import.meta.url), "utf8");
  assert.equal(source.includes("purchase_line"), false);
  assert.equal(source.includes("purchase_items"), false);
});

test("purchase create API delegates business behavior to metadata rather than a legacy route", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("createPurchasesRouter"), false);
  assert.equal(server.includes("routes/purchases.js"), false);
});

test("purchase create capability is Flow-owned rather than a package function", async () => {
  const source = await readFile(new URL("../server/packages/purchasing_core/functions.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(source, /packageFunctions = \[\]/);
  assert.match(registry, /Purchase Create/);
  assert.match(registry, /Purchase Receive/);
});

test("legacy supplier return endpoints are removed in favor of protected metadata action", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(server.includes("createReturnsRouter"), false);
  assert.match(registry, /Supplier Return Execute/);
});

test("legacy purchasing route is removed after metadata migration", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("createPurchasesRouter"), false);
  assert.equal(server.includes("routes/purchases.js"), false);
});

test("purchasing business receipt orchestration is Flow-owned", async () => {
  const capability = await readFile(new URL("../server/packages/purchasing_core/functions.js", import.meta.url), "utf8");
  assert.match(capability, /packageFunctions = \[\]/);
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
  assert.match(app, /WorkspacePage initialObjectKey="customer" appKey="customers"/);
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
  assert.equal(workflows.includes("customer.credit.limit.check"), false);
});


test("layaway uses metadata ownership", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(app.includes("LayawayPage"), false);
  assert.equal(server.includes("createLayawaysRouter"), false);
  assert.ok(metadata.includes('objectKey:"layaway"') || metadata.includes('objectKey: "layaway"'));
  assert.ok(metadata.includes('objectKey:"layaway_line"') || metadata.includes('objectKey: "layaway_line"'));
  assert.ok(metadata.includes('objectKey:"layaway_payment"') || metadata.includes('objectKey: "layaway_payment"'));
});


test("pricing promotions and combos remain metadata-owned without legacy administration", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(server.includes("createPricingRouter"), false);
  assert.ok(metadata.includes('objectKey:"promotion"') || metadata.includes('objectKey: "promotion"'));
  assert.ok(metadata.includes('objectKey:"price_list"') || metadata.includes('objectKey: "price_list"'));
});


test("sales products and categories use metadata workspace while legacy return apps are removed", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  const productsRoute = await readFile(new URL("../server/routes/products.js", import.meta.url), "utf8");
  assert.match(app, /WorkspacePage initialObjectKey="sale" appKey="sales"/);
  assert.match(app, /WorkspacePage initialObjectKey="product" appKey="products"/);
  assert.match(app, /WorkspacePage initialObjectKey="category" appKey="categories"/);
  assert.equal(app.includes("const ReturnsPage ="), false);
  assert.equal(app.includes("const ExchangePage ="), false);
  assert.ok(metadata.includes('objectKey:"stock_return"') || metadata.includes('objectKey: "stock_return"'));
  assert.match(productsRoute, /\/products\/catalogue/);
  assert.equal(productsRoute.includes("/products/misc-line"), false);
});


test("gift cards online orders and attendance use metadata workspaces", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(app, /initialObjectKey="gift_card" appKey="gift-cards"/);
  assert.match(app, /initialObjectKey="employee" appKey="employees"/);
  assert.match(app, /initialObjectKey="online_order" appKey="online-orders"/);
  assert.equal(app.includes("OnlineOrdersPrep"), false);
  assert.ok(registry.includes('objectKey:"gift_card"') || registry.includes('objectKey: "gift_card"'));
  assert.ok(registry.includes('objectKey:"online_order"') || registry.includes('objectKey: "online_order"'));
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
  const metadata = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../server/services/inventory.js", import.meta.url), "utf8");
  assert.equal(server.includes("createReturnsRouter"), false);
  assert.ok(metadata.includes('objectKey:"stock_return"') || metadata.includes('objectKey: "stock_return"'));
  assert.ok(metadata.includes('objectKey:"product"') || metadata.includes('objectKey: "product"'));
  assert.equal(server.includes("pricingEngine"), false);
  assert.match(inventory, /export async function createInventoryMovement/);
});

test("manifest sweep leaves product category segment and gift-card administration to metadata", async () => {
  const products = await readFile(new URL("../server/routes/products.js", import.meta.url), "utf8");
  const customers = await readFile(new URL("../server/routes/customers.js", import.meta.url), "utf8");
  assert.equal(/router\.(post|put|delete)\("\/categories/.test(products), false);
  assert.equal(/router\.(post|put|delete)\("\/products(?:\/import|\/:id|")/.test(products), false);
  assert.equal(products.includes("/products/misc-line"), false);
  assert.match(products, /router\.get\("\/products\/catalogue"/);
  assert.equal(/router\.(post|put|delete)\("\/customer-segments/.test(customers), false);
  assert.equal(/router\.post\("\/gift-cards(?:\/\:id\/topup|\/\:id\/block|")/.test(customers), false);
  assert.equal(customers.includes('/gift-cards/lookup'), false);
});


test("repo-wide manifest sweep removes obsolete supplier compatibility routes", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("supplierAccounts"), false);
  assert.equal(server.includes("routes/suppliers.js"), false);
});

test("repo-wide manifest sweep removes hidden legacy hospitality scan-go and held-sale stacks", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  for (const legacy of ["createHospitalityRouter", "createScanGoRouter", "createHeldSalesRouter"]) assert.equal(server.includes(legacy), false);
  assert.match(registry, /hospitality/);
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
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(app.includes("OwnDeliveryWorkspace"), false);
  assert.match(app, /initialObjectKey="online_order" appKey="own-delivery"/);
  assert.equal(server.includes("createOwnDeliveryRouter"), false);
  const catalogue = await readFile(new URL("../server/packages/packageManifestCatalog.js", import.meta.url), "utf8");
  assert.ok(catalogue.includes('key: "own_delivery"') || catalogue.includes('key:"own_delivery"'));
});

test("kiosk administration is metadata-driven and obsolete kiosk route is removed", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(app.includes("OneKioskDevicesPage"), false);
  assert.match(app, /initialObjectKey="kiosk_device" appKey="one_kiosk"/);
  assert.ok(metadata.includes('objectKey:"kiosk_device"') || metadata.includes('objectKey: "kiosk_device"'));
  assert.equal(server.includes("createKioskRouter"), false);
});

test("store and till administration use metadata while operational till runtime remains", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../server/routes/admin.js", import.meta.url), "utf8");
  const till = await readFile(new URL("../server/routes/till.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const settingsPage = await readFile(new URL("../src/pages/settings/StoreTillSettingsPage.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("pages/stores/StoresPage"), false);
  assert.match(app, /initialObjectKey="store" appKey="stores"/);
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.ok(registry.includes('objectKey:"store"') || registry.includes('objectKey: "store"'));
  assert.ok(registry.includes('objectKey:"terminal"') || registry.includes('objectKey: "terminal"'));
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
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.ok(registry.includes('objectKey:"employee"') || registry.includes('objectKey: "employee"'));
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


test("generic integration layer has no fixed business object or supplier feed knowledge", async () => {
  const route = await readFile(new URL("../server/routes/integrations.js", import.meta.url), "utf8");
  const ui = await readFile(new URL("../src/pages/integrations/IntegrationsAdmin.jsx", import.meta.url), "utf8");
  assert.match(route, /const ENTITY_TYPES = \["custom"\]/);
  assert.equal(route.includes("supplier-feed/preview"), false);
  assert.equal(route.includes("supplierFeedAdapter"), false);
  assert.equal(route.includes("supplierFeedMatch"), false);
  assert.equal(route.includes("FROM products"), false);
  assert.equal(ui.includes("SupplierFeedPreview"), false);
});


test("generic integration UI and route contain no provider-specific or fixed business entity behavior", async () => {
  const route = await readFile(new URL("../server/routes/integrations.js", import.meta.url), "utf8");
  const detail = await readFile(new URL("../src/pages/integrations/IntegrationDetail.jsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../src/pages/integrations/IntegrationsAdmin.jsx", import.meta.url), "utf8");
  const shared = await readFile(new URL("../src/pages/integrations/shared.jsx", import.meta.url), "utf8");
  assert.equal(route.includes("/integrations/:id/shopify/action"), false);
  assert.equal(detail.toLowerCase().includes("shopify"), false);
  assert.equal(admin.toLowerCase().includes("shopify"), false);
  assert.equal(shared.includes('"sale", "purchase", "product", "customer"'), false);
  assert.match(route, /\/integrations\/\:id\/test-connection/);
});
