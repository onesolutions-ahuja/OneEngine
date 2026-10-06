import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Phase 2 App shell has no business object routing table", async()=>{
  const source=await read("src/App.jsx");
  for(const token of [
    "activeApp === 'sales'","activeApp === 'products'","activeApp === 'categories'",
    "activeApp === 'customers'","activeApp === 'suppliers'","activeApp === 'purchases'",
    "activeApp === 'online-orders'","activeApp === 'own-delivery'","activeApp === 'gift-cards'",
    "activeApp === 'employees'","activeApp === 'stores'","activeApp === 'supplier-returns'",
    'initialObjectKey="sale"','initialObjectKey="product"','initialObjectKey="customer"',
    'initialObjectKey="supplier"','initialObjectKey="online_order"'
  ]) assert.equal(source.includes(token),false,token);
  assert.match(source,/catalogAppForNavigation\(storeApps, target\)/);
  assert.match(source,/resolveCatalogNavigationRoute\(metadataApp, target\)/);
});

test("Phase 2 Settings shell is metadata-hosted", async()=>{
  const source=await read("src/App.jsx");
  assert.match(source,/<MetadataSettingsPage initialSection=\{routeState\?\.section \|\| ''\} \/>/);
  for(const token of ["function SettingsPage","if (field === 'dateFormat'","/api/settings/jarves","/api/admin/users"]) {
    assert.equal(source.includes(token),false,token);
  }
});

test("Phase 2 generic runtime surfaces contain no business object literals", async()=>{
  for(const path of [
    "src/platform/workspace/WorkspacePage.jsx",
    "src/pages/reports/CustomReportsPage.jsx",
    "src/pages/settings/MetadataSettingsPage.jsx"
  ]){
    const source=await read(path);
    for(const token of ['initialObjectKey="sale"','objectKey="customer"','objectKey="product"','objectKey="supplier"']){
      assert.equal(source.includes(token),false,path+" "+token);
    }
  }
});

test("Phase 2 Till and kiosk resolve business runtime contracts from metadata", async()=>{
  for(const path of ["src/pages/till/TillPage.jsx","src/services/tillOffline.js","src/pages/kiosk/OneKioskPage.jsx","src/pages/kiosk/OneKioskDisplayPage.jsx"]){
    const source=await read(path);
    for(const token of [
      "/api/platform/runtime/objects/sale/buttons",
      "/api/platform/objects/sale/records",
      "/api/platform/objects/product/records",
      "/api/settings/payment-methods",
      "/api/customer-lookup",
      "/api/online/orders",
      "till_complete_sale",
      "till_receipt_qr"
    ]) assert.equal(source.includes(token),false,path+" "+token);
    assert.match(source,/loadRuntimeSurface|runtimeSurface/);
  }
});

test("Phase 2 package metadata owns legacy business navigation aliases", async()=>{
  const catalog=await read("server/packages/packageManifestCatalog.js");
  for(const route of [
    "/app/objects/sale?appKey=retail_pos",
    "/app/objects/product?appKey=products",
    "/app/objects/customer?appKey=customers",
    "/app/objects/supplier?appKey=suppliers",
    "/app/objects/employee?appKey=staff",
    "/app/objects/online_order?appKey=own_delivery",
    "/app/objects/kiosk_device?appKey=one_kiosk",
    "/app/objects/store?appKey=retail_pos",
    "/app/objects/online_order?appKey=online_orders"
  ]) assert.ok(catalog.includes(route),route);
});


test("Phase 2 removes retired Online Orders bespoke UI stack", async()=>{
  const { access } = await import("node:fs/promises");
  for(const path of [
    "src/pages/online/onlineOrdersShared.js",
    "src/pages/online/useOnlineOrderActions.js",
    "src/pages/online/useOnlineOrderMetadata.js",
    "src/components/online/CompleteOrderModal.jsx",
    "src/components/online/OnlineOrderCard.jsx",
    "src/components/online/OnlineOrderSummary.jsx",
    "src/utils/onlineOrderPrint.js"
  ]) await assert.rejects(access(new URL("../"+path,import.meta.url)),path);
});


test("Phase 2 shell resolves hidden foundation navigation from the server-filtered package feed", async()=>{
  const app=await read("src/App.jsx");
  const packages=await read("server/routes/packages.js");
  assert.match(app,/api\/packages\/runtime-navigation/);
  assert.match(packages,/router\.get\("\/packages\/runtime-navigation"/);
  assert.match(packages,/company_installation\?\.status/);
  assert.match(packages,/permissionAllows/);
  assert.match(packages,/isPackageLicensed/);
});
