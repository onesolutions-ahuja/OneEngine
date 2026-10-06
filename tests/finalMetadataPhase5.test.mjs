import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const workflow=read("server/services/platformWorkflow.js");
const qb=read("server/services/quickbooksAdapter.js");
const shopify=read("server/services/shopifyAdapter.js");
const paypal=read("server/services/paypalQrConnector.js");
const webhook=read("server/routes/shopifyWebhooks.js");

test("phase 5 provider business orchestration services are deleted",()=>{
 for(const p of ["server/services/quickbooksSync.js","server/services/shopifySync.js","server/services/onlineOrders/uber.js","server/services/onlineOrders/deliveroo.js","server/services/onlineOrders/uberMenuMapping.js","server/services/whatsappDelivery.js","server/services/referencePaymentConnector.js"]) assert.equal(fs.existsSync(p),false,p);
});

test("phase 5 generic Flow runtime has no named Shopify or QuickBooks business executors",()=>{
 for(const token of ["SHOPIFY_SYNC_PRODUCTS","SHOPIFY_SYNC_INVENTORY","SHOPIFY_EXPORT_FULFILMENT","SHOPIFY_EXPORT_REFUND","syncQuickBooksVendor","exportQuickBooksPurchase","quickbooksSync.js","shopifySync.js"]) assert.equal(workflow.includes(token),false,token);
 assert.match(workflow,/CALL_CONNECTOR_CAPABILITY/);
 assert.match(workflow,/CALL_CONNECTOR/);
});

test("phase 5 adapters expose protocol not OneEngine business mapping",()=>{
 for(const token of ["syncCustomer","syncVendor","syncItem","exportSale","exportPurchase","exportSupplierPayment","exportVendorCredit"]) assert.equal(qb.includes(token),false,token);
 for(const token of ["upsertProduct","updateInventoryLevel","createFulfillment","createRefund","findRefundByReference"]) assert.equal(shopify.includes(token),false,token);
 assert.match(qb,/exchangeAuthorizationCode/); assert.match(qb,/apiRequest/);
 assert.match(shopify,/exchangeAuthorizationCode/); assert.match(shopify,/graphqlRequest/); assert.match(shopify,/verifyShopifyWebhook/);
});

test("phase 5 PayPal connector is transport only",()=>{
 for(const token of ["payment.sale","payment.cancel","payment.refund","payment.status","mapProviderStatus","paymentAttemptState"]) assert.equal(paypal.includes(token),false,token);
 assert.match(paypal,/http.request/); assert.match(paypal,/webhook.verify/);
});

test("phase 5 Shopify webhook verifies protocol then emits generic event",()=>{
 assert.match(webhook,/verifyShopifyWebhook/);
 assert.match(webhook,/INSERT INTO platform_events/);
 for(const token of ["SHOPIFY_WEBHOOK_EVENT","enqueuePlatformJob","orders\/create","products\/update"]) assert.equal(webhook.includes(token),false,token);
});

test("phase 5 provider services do not mutate OneEngine business tables",()=>{
 const providerFiles=fs.readdirSync("server/services",{withFileTypes:true}).filter(e=>e.isFile()&&/Adapter|Connector|Provider/i.test(e.name)).map(e=>`server/services/${e.name}`);
 const business=/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:sales|sale_items|payments|customers|products|suppliers|purchases|purchase_items|online_orders|inventory_ledger|inventory_movements)\b/i;
 for(const p of providerFiles) assert.equal(business.test(read(p)),false,p);
});
