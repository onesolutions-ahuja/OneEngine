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

const historicalMigrationFiles = new Set([
  "server/database/migrations.js",
]);
const declarativeMetadataFiles = new Set([
  "server/packages/packageManifestCatalog.js",
  "server/packages/oneAssistantManifest.js",
  "server/packages/runtimeFlowManifests.js",
]);
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
const retiredFrontendBusinessFiles = [
  "src/pages/products/GlobalProductLookupPage.jsx",
  "src/components/online/OnlineOrderSummary.jsx",
  "src/pages/settings/AiAssistantSettings.jsx",
  "src/pages/settings/ConnectionsSettings.jsx",
  "src/pages/settings/GoogleConnectSettings.jsx",
  "src/pages/settings/HardwareSettings.jsx",
  "src/pages/settings/PaymentTerminalSettings.jsx",
  "src/pages/settings/WhatsAppAssistantSettings.jsx",
  "src/pages/settings/SecurityIdentitySettings.jsx",
  "src/pages/settings/MfaAdministrationSettings.jsx",
  "src/pages/settings/SecurityGovernanceSettings.jsx",
  "src/pages/settings/DataProtectionSettings.jsx",
];
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
const retiredBusinessRuntimeFiles = [
  "server/routes/dashboard.js",
  "server/services/reportSalesDefinition.js",
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
for (const artifact of retiredBusinessRuntimeFiles) {
  if (fs.existsSync(path.join(ROOT, artifact))) {
    findings.push({rule:"RETIRED_BUSINESS_RUNTIME_FILE_PRESENT",file:artifact});
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
  if (name === "server/database/init.js") {
    if (/up:\s*(?:async\s*)?(?:client\s*=>\s*)?initializeLegacyDatabase\s*\(/.test(text)) {
      findings.push({rule:"EXECUTABLE_LEGACY_BUSINESS_BOOTSTRAP",file:name});
    }
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
  if (name === "server/packages/packageManifestCatalog.js") {
    if (/legacyActions\s*:/.test(text)) findings.push({rule:"LEGACY_ACTION_ALIAS_MAP_IN_PACKAGE_METADATA",file:name});
    for (const token of ["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","IN_APP_NOTIFICATION"]) {
      if (text.includes(token)) findings.push({rule:"RETIRED_ACTION_ALIAS_IN_PACKAGE_METADATA",file:name,token});
    }
    if (/route:\s*["']\/app\/global-products["']/.test(text)) {
      findings.push({rule:"RETIRED_FRONTEND_ROUTE_IN_PACKAGE_METADATA",file:name,route:"/app/global-products"});
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

for (const artifact of retiredFrontendBusinessFiles) {
  if (fs.existsSync(path.join(ROOT, artifact))) findings.push({rule:"RETIRED_FRONTEND_BUSINESS_FILE_PRESENT",file:artifact});
}

for(const file of roots.flatMap(walk)){
  const name=rel(file);
  const text=fs.readFileSync(file,"utf8");
  const isHistoricalMigration = historicalMigrationFiles.has(name);
  const isDeclarativeMetadata = declarativeMetadataFiles.has(name);
  if (!isHistoricalMigration && !isDeclarativeMetadata) {
    for(const table of businessTables){
      const sql=new RegExp("\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|FROM|JOIN)\\s+(?:[a-zA-Z_]+\\.)?"+table+"\\b","i");
      if(sql.test(text)) findings.push({rule:"DIRECT_BUSINESS_SQL",file:name,table});
    }
    for(const objectKey of hardcodedBusinessObjectKeys){
      const objectRef=new RegExp("\\b(?:objectKey|object_key)\\s*[:=]\\s*[\"']"+objectKey+"[\"']","i");
      if(objectRef.test(text)) findings.push({rule:"HARDCODED_BUSINESS_OBJECT",file:name,objectKey});
    }
    if(/dataSource\s*:\s*["']sales["']|dataSource\s*===?\s*["']sales["']/i.test(text)) findings.push({rule:"HARDCODED_SALES_DATASOURCE",file:name});
    if(/\bDASHBOARD_SALES_FIELDS\b|\bbuildCustomSalesQuery\b/.test(text)) findings.push({rule:"LEGACY_SALES_RUNTIME_SYMBOL",file:name});
  }
  if (name === "src/pages/developer/OneEngineManager.jsx") {
    for (const token of [
      "StoreTillSettingsPage","ClientWebShopSettings","PaymentTerminalSettings","HardwareSettings",
      "AiAssistantSettings","ConnectionsSettings","GoogleConnectSettings","DeliverySettingsPage","WhatsAppAssistantSettings"
    ]) if (text.includes(token)) findings.push({rule:"HARDCODED_DEVELOPER_SETTINGS_COMPONENT",file:name,token});
  }
  if (name === "src/App.jsx") {
    for (const token of [
      "PaymentTerminalSettings","HardwareSettings","AiAssistantSettings","ConnectionsSettings",
      "WhatsAppAssistantSettings","SecurityIdentitySettings","MfaAdministrationSettings",
      "SecurityGovernanceSettings","DataProtectionSettings","MetadataSettingsSection"
    ]) if (text.includes(token)) findings.push({rule:"HARDCODED_APP_SETTINGS_COMPONENT",file:name,token});
    if (/setRoute\(['"]settings['"]\s*,\s*['"](?:company|connections)['"]/.test(text)) {
      findings.push({rule:"HARDCODED_SETTINGS_SECTION_ROUTE",file:name});
    }
  }
  if (name === "src/pages/dashboard/DashboardPage.jsx" && /currency\s*=\s*['"]GBP['"]/.test(text)) {
    findings.push({rule:"HARDCODED_DASHBOARD_CURRENCY_DEFAULT",file:name});
  }
  if (name.startsWith("src/")) {
    const businessApiPatterns = [
      /\/api\/products(?:\/|['"`])/,
      /\/api\/customers(?:\/|['"`])/,
      /\/api\/suppliers(?:\/|['"`])/,
      /\/api\/sales(?:\/|['"`])/,
      /\/api\/till(?:\/|['"`])/,
      /\/api\/online(?:\/|['"`])/,
      /\/api\/global-products(?:\/|['"`])/,
    ];
    if (businessApiPatterns.some((pattern) => pattern.test(text))) {
      findings.push({rule:"DIRECT_BUSINESS_API_IN_FRONTEND",file:name});
    }
  }
  if (name === "src/App.jsx") {
    for (const alias of ["contacts: 'customers'","one_connect_google: 'google-connect'","one_assistant: 'assistant'"]) {
      if (text.includes(alias)) findings.push({rule:"HARDCODED_BUSINESS_APP_ALIAS",file:name,alias});
    }
    if (/activeApp\s*===\s*['"]google-connect['"]|GoogleConnectSettings/.test(text)) {
      findings.push({rule:"DEDICATED_PROVIDER_SETTINGS_ROUTE",file:name});
    }
    if (/parts\[settingsIndex\s*\+\s*1\]\s*\|\|\s*['"]company['"]/.test(text)) {
      findings.push({rule:"HARDCODED_SETTINGS_DEFAULT_SECTION",file:name});
    }
  }
  if (name === "src/pages/settings/ConnectorAppSettings.jsx" &&
      /one_connect_square|one_connect_dojo|one_connect_sumup|smsgate_connector|brevo_connector|mailjet_connector/.test(text)) {
    findings.push({rule:"PROVIDER_SPECIFIC_GENERIC_CONNECTOR_UI",file:name});
  }
  if(name.startsWith("src/")) for(const token of forbiddenUiBusinessTokens) if(text.includes(token)) findings.push({rule:"HARDCODED_UI_BUSINESS_ACTION",file:name,token});

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
const report={generatedAt:new Date().toISOString(),scannedFiles:roots.flatMap(walk).length,violations:unique.length,runtimeExemptions:0,findings:unique};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","metadata-architecture-audit.json"),JSON.stringify(report,null,2)+"\n");
if(unique.length){
  console.error(`Metadata architecture audit failed with ${unique.length} violation(s).`);
  for(const item of unique) console.error(`- ${item.rule}: ${item.file}${item.table?` [${item.table}]`:""}${item.symbol?` [${item.symbol}]`:""}`);
  process.exit(1);
}
console.log(`Metadata architecture audit passed across ${report.scannedFiles} runtime source files.`);
