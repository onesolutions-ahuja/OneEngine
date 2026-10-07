import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("frontend navigation and settings contain no compiled business catalogues",async()=>{
 const routes=await read("src/utils/adminRoutes.js");
 const targets=await read("src/utils/navigationTargets.js");
 const settings=await read("src/utils/settingsAccess.js");
 assert.equal(routes.includes("PAGE_SLUGS"),false);
 for(const token of ["Sales","Customers","Purchases","Suppliers","Online Orders"]) assert.equal(routes.includes(token),false,token);
 assert.equal(targets.includes("PAGE_SLUGS"),false);
 assert.equal(settings.includes("Customer Loyalty"),false);
 assert.match(settings,/permissionAny/);
});

test("OneStore and integration UI resolve provider presentation from metadata",async()=>{
 const store=await read("src/pages/oneStore/oneStoreModel.js");
 const modal=await read("src/pages/integrations/IntegrationFormModal.jsx");
 assert.equal(store.includes("PROVIDER_BRANDS"),false);
 for(const token of ["uber_eats","deliveroo","shopify","xero_accounting"]) assert.equal(store.includes(token),false,token);
 assert.equal(modal.includes('=== "shopify"'),false);
 assert.equal(modal.includes("BrandIcon"),false);
});

test("dashboard filter choices are field-metadata driven",async()=>{
 const dashboard=await read("src/components/dashboard/platformDashboard.js");
 assert.equal(dashboard.includes("DATE_FILTER_FIELDS"),false);
 for(const token of ['key: "product"','key: "store"','key: "user"']) assert.equal(dashboard.includes(token),false,token);
 assert.match(dashboard,/platformFieldChoices/);
});
