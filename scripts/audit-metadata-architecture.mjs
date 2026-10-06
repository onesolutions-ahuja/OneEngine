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
  "server/services/tenantDatabase.js",
]);
const declarativePrefixes=["server/packages/","server/metadata/"];
const retired = new Set(["server/routes/dashboard.js","server/services/reportSalesDefinition.js"]);
// Temporary compatibility inventory: these adapters are allowed to touch the
// authoritative POS tables, but every entry is named here so additions cannot
// silently expand the exception surface.
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
  for(const objectKey of hardcodedBusinessObjectKeys){
    const objectRef=new RegExp("\\b(?:objectKey|object_key)\\s*[:=]\\s*[\"']"+objectKey+"[\"']","i");
    if(objectRef.test(text)) findings.push({rule:"HARDCODED_BUSINESS_OBJECT",file:name,objectKey});
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
