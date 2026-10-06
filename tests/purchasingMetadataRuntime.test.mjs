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

test("transactional objects use metadata flow writes instead of protected business routes", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(registry.includes('config: { protectedWrites: true'), false);
  assert.match(registry, /flowWritesOnly:true|flowWritesOnly: true/);
});

test("system object helper contains no business-specific purchase metadata", async () => {\n  const source = await readFile(new URL("../server/services/systemObjects.js", import.meta.url), "utf8");\n  assert.match(source, /SYSTEM_OBJECTS = Object\\.freeze\\(\\[\\]\\)/);\n  assert.equal(source.includes("purchase_line"), false);\n  assert.equal(source.includes("purchase_items"), false);\n});\n

test("purchase create is generic object flow metadata", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(registry, /name:"Purchase Create"/);
  assert.match(registry, /key:"CREATE_RECORD",objectKey:"purchase"/);
  assert.match(registry, /key:"CREATE_RECORD",objectKey:"purchase_line"/);
  assert.equal(registry.includes('subflowApiName:"PURCHASE_CREATE"'), false);
});



test("legacy supplier return endpoints are removed in favor of protected metadata action", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("createReturnsRouter"), false);
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(registry, /name:"Supplier Return Execute"/);
});


test("legacy purchasing route is removed", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/purchases.js"), false);
  assert.equal(server.includes("createPurchasesRouter"), false);
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


test("customer administration uses platform metadata without a legacy customer router", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(app, /CustomersPage initialObjectKey="customer" appKey="customers"/);
  assert.equal(server.includes("./routes/customers.js"), false);
  assert.equal(server.includes("createCustomersRouter"), false);
  assert.match(registry, /objectKey: "customer"/);
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


test("pricing promotions and combos remain metadata-owned without legacy administration", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  assert.equal(server.includes("createPricingRouter"), false);
  assert.match(metadata, /key: "promotion"/);
  assert.match(metadata, /key: "price_list"/);
});


test("sales products and categories use metadata workspaces without legacy product CRUD routes", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.match(app, /SalesPage initialObjectKey="sale" appKey="sales"/);
  assert.match(app, /ProductsPage initialObjectKey="product" appKey="products"/);
  assert.match(app, /CategoriesPage initialObjectKey="category" appKey="categories"/);
  assert.equal(server.includes("./routes/products.js"), false);
  assert.match(registry, /objectKey: "product"/);
  assert.match(registry, /objectKey: "category"/);
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


test("legacy sales route is removed in favor of metadata runtime", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/sales.js"), false);
  assert.equal(server.includes("createSalesRouter("), false);
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


test("Till operational writes are metadata Flow owned", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  const metadata = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  assert.equal(server.includes("./routes/till.js"), false);
  assert.equal(server.includes("createTillRouter"), false);
  for (const objectKey of ["till_session","cash_movement","refund","sale","sale_item","payment"]) assert.ok(registry.includes(`objectKey:"${objectKey}"`) || registry.includes(`objectKey: "${objectKey}"`), objectKey);
  assert.match(metadata, /ONETILL_OPEN_SESSION/);
  assert.match(metadata, /ONETILL_CLOSE_SESSION/);
  assert.match(metadata, /ONETILL_CASH_IN/);
  assert.match(metadata, /ONETILL_CASH_OUT/);
  assert.match(metadata, /ONETILL_OPEN_DRAWER/);
  assert.equal(metadata.includes("cash_ledger"), false);
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
