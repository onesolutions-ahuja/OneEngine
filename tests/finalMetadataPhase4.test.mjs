import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const sales=read("server/routes/sales.js");
const till=read("server/routes/till.js");
const platform=read("server/routes/platform.js");
const invoiceDelivery=read("server/routes/invoiceDelivery.js");
const globalProducts=read("server/routes/globalProductLookup.js");
const settings=read("server/routes/settings.js");
const whatsapp=read("server/routes/whatsapp.js");
const paypal=read("server/routes/paypalQr.js");
const server=read("server/server.js");

test("phase 4 legacy sale and till mutation engines are retired",()=>{
  for(const sql of ["INSERT INTO sales","INSERT INTO sale_items","INSERT INTO payments"]) assert.equal(sales.includes(sql),false,sql);
  for(const sql of ["INSERT INTO till_sessions","UPDATE till_sessions","INSERT INTO cash_movements"]) assert.equal(till.includes(sql),false,sql);
  assert.equal(sales.includes("METADATA_ACTION_REQUIRED"),true);
  assert.equal((till.match(/METADATA_ACTION_REQUIRED/g)||[]).length>=4,true);
});

test("phase 4 generic platform runtime owns canonical record writes",()=>{
  assert.equal(platform.includes('type === "record_save"'),true);
  assert.equal(platform.includes("executeCanonicalRecordWrite({ req, object, metadataFields, fields, input: values, action, recordId })"),true);
});

test("phase 4 business reads may remain while mutation orchestration is metadata-owned",()=>{
  assert.equal(sales.includes("router.get("),true);
  assert.equal(till.includes("router.get("),true);
});

test("phase 4 delivery/payment/settings routes contain no business mutation SQL",()=>{
  for(const [name,source] of [["invoiceDelivery",invoiceDelivery],["settings",settings],["whatsapp",whatsapp],["paypal",paypal]]){
    for(const pattern of [/INSERT\s+INTO\s+(sales|sale_items|payments|customers|integrations|company_settings|payment_terminals|hardware_configurations)/i,/UPDATE\s+(sales|payments|customers|integrations|company_settings|payment_terminals|hardware_configurations)\s+SET/i,/DELETE\s+FROM\s+(sales|payments|customers|integrations|company_settings|payment_terminals|hardware_configurations)/i]) assert.equal(pattern.test(source),false,name+" contains legacy business mutation SQL");
  }
  assert.match(invoiceDelivery,/METADATA_ACTION_REQUIRED/);
  assert.match(settings,/METADATA_ACTION_REQUIRED/);
  assert.match(whatsapp,/METADATA_ACTION_REQUIRED/);
  assert.match(paypal,/METADATA_ACTION_REQUIRED/);
});

test("phase 4 WhatsApp webhook is a technical adapter, not a customer/invoice workflow",()=>{
  assert.equal(whatsapp.includes("INSERT INTO customers"),false);
  assert.equal(whatsapp.includes("whatsapp_conversations"),false);
  assert.equal(whatsapp.includes("executeWorkflowActions"),false);
  assert.equal(whatsapp.includes("resendWhatsAppInvoice"),false);
  assert.match(whatsapp,/recordCommunicationEvent/);
  assert.match(whatsapp,/verifySignature/);
});

test("phase 4 provider configuration routes have no business SQL writers",()=>{
  for(const sql of ["INSERT INTO integrations","UPDATE integration_connections","INSERT INTO integration_connections"]) assert.equal(globalProducts.includes(sql),false,sql);
  assert.match(globalProducts,/Product-provider configuration is executed through Integration metadata Actions\/Flows/);
});

test("phase 4 retired business mutation services are deleted and disconnected",()=>{
  for(const path of ["server/services/canonicalTransactions.js","server/services/inventory.js","server/services/inventoryPlatform.js","server/services/productImportExport.js","server/services/integrationDispatcher.js"]) assert.equal(fs.existsSync(path),false,path);
  for(const legacy of ["canonicalTransactions.js","services/inventory.js","productImportExport.js","integrationDispatcher.js","createInventoryMovement"]) assert.equal(server.includes(legacy),false,legacy);
});

test("phase 4 route tree has no direct business-table mutation SQL outside explicit infrastructure/protocol allowlist",()=>{
  const allowed=new Set(["accountLifecycle.js","admin.js","advancedPlatform.js","audit.js","connectors.js","customerAuth.js","dataProtection.js","debugCodes.js","googleConnect.js","identityAssurance.js","identityProviderLogin.js","identitySecurity.js","integrations.js","mobileScanner.js","packages.js","platform.js","platformDeployments.js","platformEvents.js","platformFiles.js","platformSchedules.js","platformSecurity.js","platformSequences.js","providerOAuth.js","reports.js","securityGovernance.js","selfCheckout.js","shopifyWebhooks.js","smsGateWebhooks.js","superadmin.js","temporaryDbExport.js"]);
  const businessTables="sales|sale_items|payments|customers|products|categories|purchases|purchase_items|suppliers|inventory_movements|inventory_batches|cash_movements|till_sessions|online_orders|company_settings|payment_terminals|hardware_configurations";
  const mutation=new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:${businessTables})\\b`,"i");
  for(const name of fs.readdirSync("server/routes").filter(n=>n.endsWith(".js"))){
    if(allowed.has(name)) continue;
    const source=read(`server/routes/${name}`);
    assert.equal(mutation.test(source),false,`${name} contains direct business mutation SQL`);
  }
});


test("phase 4 payment and invoice services contain transport/read primitives only",()=>{
  const payment=read("server/services/paymentAttempts.js");
  const delivery=read("server/services/invoiceDelivery.js");
  assert.equal(/INSERT\\s+INTO|UPDATE\\s+payment_attempts|DELETE\\s+FROM/i.test(payment),false);
  for(const business of ["sales","sale_items","customers","createInvoiceDeliveryLink","resendInvoiceByChannel"]) assert.equal(delivery.includes(business),false,business);
  assert.match(delivery,/sendSmsViaProvider/);
  assert.match(delivery,/sendEmailViaProvider/);
});
