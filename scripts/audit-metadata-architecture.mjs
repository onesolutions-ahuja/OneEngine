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

// Only generic/declarative platform authorities are excluded. There is deliberately
// no legacy business-runtime exemption list.
// Executable JS receives no business-domain exemption. Declarative metadata belongs
// in data/manifests; JS runtime authorities must stay generic.
const declarativeFiles = new Set([]);
const declarativePrefixes=[];

const businessTables=[
  "sales","sale_items","payments","payment_attempts","payment_methods","refunds",
  "customers","customer_ledger","customer_loyalty_ledger","gift_card_ledger","gift_cards","layaways",
  "products","product_variants","product_bundles","product_store_pricing","product_supplier_costs",
  "inventory_ledger","inventory_movements","inventory_levels","inventory_batches",
  "suppliers","purchases","purchase_items","purchase_ledger","supplier_invoices","supplier_payments",
  "online_orders","online_order_items","online_order_events"
];

const businessObjectKeys=[
  "sale","sale_item","payment","refund","customer","gift_card","layaway","product","product_variant",
  "inventory","inventory_movement","supplier","purchase","purchase_receipt","online_order"
];

const businessApiRoots=[
  "sales","products","customers","suppliers","purchases","inventory","returns","exchanges",
  "payments","payment","self-checkout","kiosk","online-orders","online_orders","ean",
  "global-product","global_product","gift","loyalty","layaway","invoice","secure-invoice"
];

const findings=[];
const files=roots.flatMap(walk);

for(const file of files){
  const name=rel(file);
  const text=fs.readFileSync(file,"utf8");
  if(declarativeFiles.has(name)||declarativePrefixes.some((prefix)=>name.startsWith(prefix))) continue;

  for(const table of businessTables){
    const sql=new RegExp("\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|FROM|JOIN)\\s+(?:[a-zA-Z_]+\\.)?"+table+"\\b","i");
    if(sql.test(text)) findings.push({rule:"DIRECT_BUSINESS_SQL",file:name,table});
  }

  if(name.startsWith("src/")){
    for(const key of businessObjectKeys){
      const route=new RegExp("/api/platform/(?:runtime/)?objects/"+key+"(?:/|['\"?])","i");
      if(route.test(text)) findings.push({rule:"HARDCODED_BUSINESS_OBJECT_ROUTE",file:name,objectKey:key});
    }
    for(const root of businessApiRoots){
      const route=new RegExp("/api/"+root+"(?:/|['\"?])","i");
      if(route.test(text)) findings.push({rule:"HARDCODED_BUSINESS_API_ROUTE",file:name,apiRoot:root});
    }
    if(/\/api\/settings(?:\/|['"?>])/.test(text)) findings.push({rule:"HARDCODED_SETTINGS_API",file:name});
    if(/\bpatchCompanySettings\b|\bpatchSettings\b/.test(text)) findings.push({rule:"DIRECT_SETTINGS_FIELD_WIRING",file:name});
  }

  if(/\bCALL_FUNCTION\b|\bRUN_ASSISTANT_SUBFLOW\b/.test(text)) findings.push({rule:"LEGACY_EXECUTOR_REFERENCE",file:name});
  if(["server/services/platformSystemObjects.js","server/services/platformMetadata.js","server/services/packageRegistry.js","server/services/systemWorkflowCatalog.js"].includes(name)){
    for(const key of businessObjectKeys){
      const literal=new RegExp("[\\\"']"+key+"[\\\"']","i");
      if(literal.test(text)) findings.push({rule:"BUSINESS_IDENTIFIER_IN_EXECUTABLE_REGISTRY",file:name,objectKey:key});
    }
  }
  if(/dataSource\s*:\s*["']sales["']|dataSource\s*===?\s*["']sales["']/i.test(text)) findings.push({rule:"HARDCODED_SALES_DATASOURCE",file:name});
  if(/\bDASHBOARD_SALES_FIELDS\b|\bbuildCustomSalesQuery\b/.test(text)) findings.push({rule:"LEGACY_SALES_RUNTIME_SYMBOL",file:name});
}

const unique=[...new Map(findings.map((item)=>[JSON.stringify(item),item])).values()]
  .sort((a,b)=>a.file.localeCompare(b.file)||a.rule.localeCompare(b.rule));
const report={
  generatedAt:new Date().toISOString(),
  scannedFiles:files.length,
  violations:unique.length,
  exemptionCount:0,
  findings:unique
};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","metadata-architecture-audit.json"),JSON.stringify(report,null,2)+"\n");
if(unique.length){
  console.error(`Metadata architecture audit failed with ${unique.length} violation(s); zero business-runtime exemptions are permitted.`);
  for(const item of unique) console.error(`- ${item.rule}: ${item.file}${item.table?` [${item.table}]`:""}${item.objectKey?` [${item.objectKey}]`:""}${item.apiRoot?` [${item.apiRoot}]`:""}`);
  process.exit(1);
}
console.log(`Metadata architecture audit passed across ${report.scannedFiles} runtime source files with zero exemptions.`);
