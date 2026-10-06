import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["server/routes", "server/services", "src"].map((item) => path.join(ROOT, item));
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?walk(full):/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)?[full]:[];
}) : [];
const rel=(file)=>path.relative(ROOT,file).replaceAll("\\","/");

// These files are platform infrastructure or declarative metadata authorities.
// Business names may legitimately occur here as metadata; they must not become
// executable business persistence/query logic elsewhere.
const exempt = new Set([
  "server/services/platformMetadata.js",
  "server/services/platformSystemObjects.js",
  "server/services/packageRegistry.js",
  "server/services/systemWorkflowCatalog.js",
  "server/services/tenantDatabase.js",
]);
const declarativePrefixes=["server/packages/","server/metadata/"];
const retired = new Set(["server/routes/dashboard.js","server/services/reportSalesDefinition.js"]);
// Temporary compatibility inventory: these adapters are allowed to touch the
// authoritative POS tables, but every entry is named here so additions cannot
// silently expand the exception surface.
const legacyBusinessRuntime = new Set([
  "server/services/receiptQr.js","server/services/secureInvoiceLinks.js","server/services/invoiceDelivery.js",
  "server/routes/invoiceDelivery.js","server/routes/secureInvoice.js","server/routes/selfCheckout.js",
  "server/routes/admin.js","server/routes/settings.js","server/routes/integrations.js",
  "server/services/jarvis/tools/index.js","server/services/jarvis/index.js",
  "server/routes/productFeatures.js","server/services/productFeatures.js","server/services/productImportExport.js",
  "server/routes/eanLookup.js","server/routes/globalProductLookup.js","server/services/globalProductLookup.js",
  "server/routes/customerAuth.js","server/routes/audit.js","server/services/licensing.js",
  "server/services/paypalQrConnector.js","server/services/integrationFieldResolver.js"
]);
const businessTables=["sales","sale_items","customers","payments","products","suppliers","purchases","purchase_items","refunds"];
const forbiddenUiBusinessTokens=["CREATE_CUSTOMER","CREATE_SALE","CREATE_PAYMENT","DASHBOARD_SALES_FIELDS"];
const findings=[];

for(const file of roots.flatMap(walk)){
  const name=rel(file);
  const text=fs.readFileSync(file,"utf8");
  if(retired.has(name)){
    if(name==="server/routes/dashboard.js" && /FROM\s+sales|FROM\s+products/i.test(text)) findings.push({rule:"RETIRED_BUSINESS_RUNTIME_STILL_IMPLEMENTED",file:name});
    if(name==="server/services/reportSalesDefinition.js" && /dataSource\s*:\s*["']sales["']|FROM\s+sales/i.test(text)) findings.push({rule:"RETIRED_SALES_REPORT_ENGINE_STILL_IMPLEMENTED",file:name});
    continue;
  }
  if(exempt.has(name)||declarativePrefixes.some((prefix)=>name.startsWith(prefix))) continue;
  // Existing app/domain adapters are compatibility boundaries around authoritative
  // POS tables. They remain visible debt, but new generic platform/builders may
  // not introduce direct business SQL. Phase 7B validates these adapters through
  // their workflow/action gates before deployment.
  if(legacyBusinessRuntime.has(name)) continue;
  for(const table of businessTables){
    const sql=new RegExp("\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|FROM|JOIN)\\s+(?:[a-zA-Z_]+\\.)?"+table+"\\b","i");
    if(sql.test(text)) findings.push({rule:"DIRECT_BUSINESS_SQL",file:name,table});
  }
  if(/dataSource\s*:\s*["']sales["']|dataSource\s*===?\s*["']sales["']/i.test(text)) findings.push({rule:"HARDCODED_SALES_DATASOURCE",file:name});
  if(/\bDASHBOARD_SALES_FIELDS\b|\bbuildCustomSalesQuery\b/.test(text)) findings.push({rule:"LEGACY_SALES_RUNTIME_SYMBOL",file:name});
  if(name.startsWith("src/")) for(const token of forbiddenUiBusinessTokens) if(text.includes(token)) findings.push({rule:"HARDCODED_UI_BUSINESS_ACTION",file:name,token});
}
const unique=[...new Map(findings.map((item)=>[JSON.stringify(item),item])).values()];
const report={generatedAt:new Date().toISOString(),scannedFiles:roots.flatMap(walk).length,violations:unique.length,legacyCompatibilityAdapters:[...legacyBusinessRuntime].sort(),legacyCompatibilityAdapterCount:legacyBusinessRuntime.size,findings:unique};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","metadata-architecture-audit.json"),JSON.stringify(report,null,2)+"\n");
if(unique.length){
  console.error(`Metadata architecture audit failed with ${unique.length} violation(s).`);
  for(const item of unique) console.error(`- ${item.rule}: ${item.file}${item.table?` [${item.table}]`:""}`);
  process.exit(1);
}
console.log(`Metadata architecture audit passed across ${report.scannedFiles} runtime source files.`);
