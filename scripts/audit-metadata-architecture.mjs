import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["server", "src"].map((item) => path.join(ROOT, item));
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?walk(full):/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)?[full]:[];
}) : [];
const rel=(file)=>path.relative(ROOT,file).replaceAll("\\","/");
const files=roots.flatMap(walk).filter((file)=>{const name=rel(file);if(/(?:^|\\/)(?:test|tests|scripts|migrations)(?:\\/|$)/.test(name)||name.endsWith(".test.js")||name.endsWith(".test.mjs"))return false;if(name.startsWith("server/src/marketing/")||name.startsWith("src/marketing/"))return false;return true;});

const exempt = new Set();
const declarativePrefixes=[];
const retired = new Set(["server/routes/dashboard.js"]);
const legacyBusinessRuntime = new Set([]);
const businessTables=[
  "sales","sale_ledger","sale_items","customers","payments","products","suppliers",
  "purchases","purchase_ledger","purchase_items","purchase_receipts","refunds",
  "sales_orders","sales_order_items","supplier_invoices","supplier_payments",
  "supplier_payment_allocations","stock_returns","stock_return_items"
];
const hardcodedBusinessObjectKeys=[
  "sale","sale_ledger","sale_item","payment","refund","customer","product",
  "purchase","purchase_ledger","purchase_line","purchase_receipt",
  "supplier_invoice","supplier_payment","sales_order","sales_order_line","stock_return"
];
const forbiddenUiBusinessTokens=["DASHBOARD_SALES_FIELDS"];
const businessApiRoots=["sales","products","customers","suppliers","purchases","inventory","returns","exchanges","payments","payment","self-checkout","kiosk","online-orders","online_orders","ean","global-product","global_product","gift","loyalty","layaway","invoice","secure-invoice"];
const businessBindingKeys=["initialObjectKey","objectKey","object_key","dataSource","data_source","sourceObject","source_object","entityType","entity_type"];
const businessFieldTokens=["sale_id","customer_id","product_id","supplier_id","purchase_id","payment_id","refund_id","till_id","invoice_id","receipt_number","sale_number"];
const providerTokens=["paypal","quickbooks","uber_eats","deliveroo","just_eat","shopify","woocommerce","magento","prestashop"];
const retiredActionKeys=[
  "SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","IN_APP_NOTIFICATION",
  "CALL_WEBHOOK","HTTP_REQUEST","CALL_FUNCTION"
];
const forbiddenCompiledConnectorActions=[
  "PAYMENT_START","PAYMENT_CANCEL","PRINT_RECEIPT","PRINT_KITCHEN_TICKET",
  "OPEN_CASH_DRAWER","SCANNER_STATUS"
];
const forbiddenGenericConnectorProviderTokens=[
  "smsgate_connector","brevo_connector","mailjet_connector","SMSGate","Brevo","Mailjet",
  "configureSmsGateInboundWebhook","send-test-email","send-test-sms"
];
const findings=[];

const retiredMetadataRuntime = "server/services/platformMetadata.js";
const retiredProviderActionRuntime = "server/services/platformActions.js";
const retiredProviderSpecificRoutes = [
  "server/routes/smsGateWebhooks.js",
];
const retiredInvoiceReceiptArtifacts = [
  "server/services/invoiceDelivery.js",
  "server/services/receiptQr.js",
  "server/utils/invoicePdf.js",
  "server/utils/invoiceHtml.js",
  "server/database/secure_invoice_links.sql",
];
const allServerRuntimeFiles = walk(path.join(ROOT, "server"));
if (fs.existsSync(path.join(ROOT, retiredMetadataRuntime))) {
  findings.push({rule:"RETIRED_PLATFORM_METADATA_RUNTIME_PRESENT",file:retiredMetadataRuntime});
}
if (fs.existsSync(path.join(ROOT, retiredProviderActionRuntime))) {
  findings.push({rule:"RETIRED_PROVIDER_ACTION_RUNTIME_PRESENT",file:retiredProviderActionRuntime});
}
for (const artifact of retiredProviderSpecificRoutes) {
  if (fs.existsSync(path.join(ROOT, artifact))) {
    findings.push({rule:"RETIRED_PROVIDER_SPECIFIC_ROUTE_PRESENT",file:artifact});
  }
}
for (const artifact of retiredInvoiceReceiptArtifacts) {
  if (fs.existsSync(path.join(ROOT, artifact))) {
    findings.push({rule:"RETIRED_INVOICE_RECEIPT_ARTIFACT_PRESENT",file:artifact});
  }
}
for (const file of allServerRuntimeFiles) {
  const name = rel(file);
  const text = fs.readFileSync(file,"utf8");
  if (name !== retiredMetadataRuntime && /platformMetadata\.js/.test(text)) {
    findings.push({rule:"RETIRED_PLATFORM_METADATA_IMPORT",file:name});
  }
  if (name !== retiredProviderActionRuntime && /platformActions\.js/.test(text)) {
    findings.push({rule:"RETIRED_PROVIDER_ACTION_IMPORT",file:name});
  }
  if (name === "server/services/platformWorkflow.js") {
    for (const actionKey of forbiddenCompiledConnectorActions) {
      if (text.includes(actionKey)) findings.push({rule:"COMPILED_BUSINESS_CONNECTOR_ACTION",file:name,actionKey});
    }
  }
  if (name === "server/server.js" && /SECURE INVOICE LINKS|\/i\/:token/.test(text)) {
    findings.push({rule:"RETIRED_SECURE_INVOICE_RUNTIME_REFERENCE",file:name});
  }
  if (name === "server/database/oneSolutionsSeeder.js" && /(?:till|delivery|self_checkout)_invoice_prefix/.test(text)) {
    findings.push({rule:"HARDCODED_INVOICE_PREFIX_SEED",file:name});
  }
  if (name === "server/server.js") {
    const providerJobTokens = [
      "SHOPIFY_PROVIDER_SYNC","SHOPIFY_WEBHOOK_EVENT","SHOPIFY_PROCESS_WEBHOOK","/api/shopify/webhooks"
    ];
    for (const token of providerJobTokens) {
      if (text.includes(token)) findings.push({rule:"HARDCODED_PROVIDER_JOB_RUNTIME_IN_SERVER",file:name,token});
    }
    const providerDriverTokens = [
      "createReferencePaymentDriver","createSmsGateDriver","createBrevoDriver","createMailjetDriver",
      "connector_package_key='smsgate_connector'","configureSmsGateInboundWebhook","getSmsGateDiagnostics"
    ];
    for (const token of providerDriverTokens) {
      if (text.includes(token)) findings.push({rule:"HARDCODED_PROVIDER_RUNTIME_IN_SERVER",file:name,token});
    }
  }
  if (name === "server/services/packageRegistry.js") {
    if (/packageKeys\s*=\s*\[\s*["']staff["']\s*,\s*["']products["']\s*,\s*["']customers["']/.test(text)) {
      findings.push({rule:"HARDCODED_DEFAULT_BUSINESS_PACKAGES",file:name});
    }
    if (/packageKey\s*===\s*["'](?:staff|products|customers)["']/.test(text)) {
      findings.push({rule:"PACKAGE_SPECIFIC_PROVISIONING_BRANCH",file:name});
    }
  }
  if (name === "server/routes/admin.js" && /user_email_domain|domain_users_only|email_registration_enabled|company_settings/.test(text)) {
    findings.push({rule:"HARDCODED_ACCOUNT_POLICY_BINDING_IN_ADMIN",file:name});
  }
  if (name === "server/routes/accountLifecycle.js") {
    if (/\/account\/invite\/:userId/.test(text)) findings.push({rule:"LEGACY_STAFF_INVITE_ROUTE",file:name});
    if (/user_email_domain|domain_users_only|email_registration_enabled|password_reset_email_enabled|company_settings/.test(text)) {
      findings.push({rule:"HARDCODED_ACCOUNT_LIFECYCLE_SETTINGS_BINDING",file:name});
    }
  }
  if (name === "server/routes/accountLifecycle.js" && /\/settings\/account-policy/.test(text)) {
    findings.push({rule:"HARDCODED_ACCOUNT_POLICY_SETTINGS_ROUTE",file:name});
  }
  if (name === "server/services/jarvis/prompt.js") {
    if (/till\/POS screen|products, stock, customers|suppliers, purchasing|sales and refunds/.test(text)) {
      findings.push({rule:"HARDCODED_JARVIS_BUSINESS_DOMAIN_PROMPT",file:name});
    }
  }
  if (name === "server/routes/connectors.js") {
    for (const token of forbiddenGenericConnectorProviderTokens) {
      if (text.includes(token)) findings.push({rule:"PROVIDER_SPECIFIC_GENERIC_CONNECTOR_ROUTE",file:name,token});
    }
  }
}

for(const file of files){
  const name=rel(file);
  const text=fs.readFileSync(file,"utf8");
  const schemaDefinition=name.startsWith("server/database/");
  if(retired.has(name)){
    if(name==="server/routes/dashboard.js" && /FROM\s+sales|FROM\s+products/i.test(text)) findings.push({rule:"RETIRED_BUSINESS_RUNTIME_STILL_IMPLEMENTED",file:name});
    continue;
  }
  if(!schemaDefinition) for(const table of businessTables){
    const sql=new RegExp("\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|FROM|JOIN)\\s+(?:[a-zA-Z_]+\\.)?"+table+"\\b","i");
    if(sql.test(text)) findings.push({rule:"DIRECT_BUSINESS_SQL",file:name,table});
  }
  for(const objectKey of hardcodedBusinessObjectKeys){
    const objectRef=new RegExp("\\b(?:objectKey|object_key)\\s*[:=]\\s*[\"']"+objectKey+"[\"']","i");
    if(objectRef.test(text)) findings.push({rule:"HARDCODED_BUSINESS_OBJECT",file:name,objectKey});
  }
  if(/dataSource\s*:\s*["']sales["']|dataSource\s*===?\s*["']sales["']/i.test(text)) findings.push({rule:"HARDCODED_SALES_DATASOURCE",file:name});
  if(/\bDASHBOARD_SALES_FIELDS\b|\bbuildCustomSalesQuery\b/.test(text)) findings.push({rule:"LEGACY_SALES_RUNTIME_SYMBOL",file:name});
  if(name.startsWith("src/")) for(const token of forbiddenUiBusinessTokens) if(text.includes(token)) findings.push({rule:"HARDCODED_UI_BUSINESS_ACTION",file:name,token});

  if(name.startsWith("src/")){
    for(const root of businessApiRoots){const rx=new RegExp("/api/"+root+"(?:/|[\\'\\\"?])","i");if(rx.test(text))findings.push({rule:"HARDCODED_BUSINESS_API_ROUTE",file:name,apiRoot:root});}
    if(/\/api\/settings(?:\/|['"?>])/.test(text))findings.push({rule:"HARDCODED_SETTINGS_API",file:name});
    if(/\bpatchCompanySettings\b|\bpatchSettings\b/.test(text))findings.push({rule:"DIRECT_SETTINGS_FIELD_WIRING",file:name});
    const code=text.replace(/\/\*[\s\S]*?\*\//g," ").replace(/(^|[^:])\/\/.*$/gm,"$1 ");
    for(const key of businessBindingKeys) for(const objectKey of hardcodedBusinessObjectKeys){const rx=new RegExp("\\b"+key+"\\b\\s*(?:=|:)\\s*[\\'\\\"]"+objectKey+"[\\'\\\"]","i");if(rx.test(code))findings.push({rule:"HARDCODED_BUSINESS_BINDING",file:name,token:key+":"+objectKey});}
    for(const token of businessFieldTokens){const escaped=token.replace(/[.*+?^$()|[\]\\]/g,"\\  // Retired action names may still appear in migration/diagnostic copy, but they");const rx=new RegExp("[\\'\\\"]"+escaped+"[\\'\\\"]\\s*(?:[:,]|\\])|\\b"+escaped+"\\b\\s*[:=]","i");if(rx.test(code))findings.push({rule:"HARDCODED_BUSINESS_FIELD_MAPPING",file:name,token});}
  }
  if(!schemaDefinition && /\bCALL_FUNCTION\b|\bRUN_ASSISTANT_SUBFLOW\b/.test(text)) findings.push({rule:"LEGACY_EXECUTOR_REFERENCE",file:name});
  if(!schemaDefinition){const code=text.replace(/\/\*[\s\S]*?\*\//g," ").replace(/(^|[^:])\/\/.*$/gm,"$1 ");for(const token of providerTokens){const escaped=token.replace(/[.*+?^$()|[\]\\]/g,"\\  // Retired action names may still appear in migration/diagnostic copy, but they");const rx=new RegExp("([\\'\\\"]).*?\\b"+escaped+"\\b.*?\\1","i");if(rx.test(code))findings.push({rule:"HARDCODED_PROVIDER_LITERAL",file:name,token});}}

  // Retired action names may still appear in migration/diagnostic copy, but they
  // must never be registered, selected, or executed as runtime action keys.
  if(/\bexecuteMediatedRegisteredAction\b/.test(text)) {
    findings.push({rule:"RETIRED_RUNTIME_EXECUTOR",file:name,symbol:"executeMediatedRegisteredAction"});
  }
  for(const symbol of retiredActionKeys) {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const executablePatterns = [
      new RegExp(`\\b(?:actionKey|type|key)\\s*:\\s*[\"']${escaped}[\"']`),
      new RegExp(`\\bgetWorkflowActionDefinition\\(\\s*[\"']${escaped}[\"']\\s*\\)`),
      new RegExp(`\\bexecuteSystemAction\\([\\s\\S]{0,800}\\bactionKey\\s*:\\s*[\"']${escaped}[\"']`),
    ];
    if(executablePatterns.some((pattern)=>pattern.test(text))) findings.push({rule:"RETIRED_RUNTIME_ACTION_KEY",file:name,symbol});
  }
}
const unique=[...new Map(findings.map((item)=>[JSON.stringify(item),item])).values()];
const report={generatedAt:new Date().toISOString(),scannedFiles:files.length,violations:unique.length,exemptionCount:0,findings:unique};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","metadata-architecture-audit.json"),JSON.stringify(report,null,2)+"\n");
if(unique.length){
  console.error(`Metadata architecture audit failed with ${unique.length} violation(s).`);
  for(const item of unique) console.error(`- ${item.rule}: ${item.file}${item.table?` [${item.table}]`:""}${item.symbol?` [${item.symbol}]`:""}`);
  process.exit(1);
}
console.log(`Metadata architecture audit passed across ${report.scannedFiles} runtime source files with zero exemptions.`);
