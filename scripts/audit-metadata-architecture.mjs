import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const findings=[];
const rel=(p)=>path.relative(ROOT,p).replaceAll("\\","/");
const line=(text,index)=>text.slice(0,index).split("\n").length;
const walk=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
  const full=path.join(dir,entry.name);
  if(entry.isDirectory()){
    if(["node_modules","dist","artifacts",".git"].includes(entry.name)) return [];
    return walk(full);
  }
  return /\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)?[full]:[];
}):[];
const add=(rule,file,text,index,detail="")=>findings.push({rule,file:rel(file),line:index==null?null:line(text,index),detail});

const runtimeFiles=[
  ...walk(path.join(ROOT,"src")),
  ...walk(path.join(ROOT,"server","routes")),
  ...walk(path.join(ROOT,"server","services")),
  ...walk(path.join(ROOT,"server","packages")),
  path.join(ROOT,"server","server.js"),
  ...walk(path.join(ROOT,"scripts")),
].filter((file,index,all)=>fs.existsSync(file)&&all.indexOf(file)===index);
const auditFiles=new Set(walk(path.join(ROOT,"scripts")).filter((file)=>/audit-.*\.mjs$/.test(file)).map((file)=>path.normalize(file)));

const retiredFiles=[
  "server/routes/sales.js",
  "server/routes/customers.js",
  "server/routes/till.js",
  "server/routes/whatsapp.js",
  "server/services/inventory.js",
  "server/services/inventoryPlatform.js",
  "server/services/productImportExport.js",
  "server/packages/runtimeFlowManifests.js",
  "src/components/UserStoreAccessModal.jsx",
  "src/pages/suppliers/SuppliersPage.jsx",
  "src/pages/purchases/PurchasesPage.jsx",
  "src/pages/returns/SupplierReturnsPage.jsx",
];
for(const item of retiredFiles){
  const full=path.join(ROOT,item);
  if(fs.existsSync(full)) add("RETIRED_BUSINESS_RUNTIME_PRESENT",full,"",null,item);
}

for(const file of runtimeFiles){
  const text=fs.readFileSync(file,"utf8");
  if(!auditFiles.has(path.normalize(file))){
    for(const match of text.matchAll(/\bCALL_FUNCTION\b/g)) add("LEGACY_CALL_FUNCTION",file,text,match.index);
  }
}

const businessTables=new Set([
  "sales","sale_items","customers","products","product_store_stock","suppliers",
  "purchases","purchase_items","purchase_lines","online_orders","inventory_movements",
  "inventory_ledger","cash_movements","cash_ledger","gift_cards","gift_card_ledger",
  "customer_loyalty_transactions","customer_loyalty_ledger","customer_credit_ledger",
]);
for(const file of runtimeFiles.filter((file)=>rel(file).startsWith("server/")&&!rel(file).startsWith("server/metadata/"))){
  const text=fs.readFileSync(file,"utf8");
  for(const match of text.matchAll(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)/gi)){
    const table=String(match[1]||"").toLowerCase();
    if(businessTables.has(table)) add("DIRECT_BUSINESS_SQL_MUTATION",file,text,match.index,table);
  }
}

const genericUiPaths=[
  /^src\/App\.jsx$/,
  /^src\/platform\//,
  /^src\/shared\//,
  /^src\/components\/platform\//,
  /^src\/pages\/developer\//,
  /^src\/pages\/settings\/Platform\//,
  /^src\/pages\/dashboard\/DashboardBuilder\.jsx$/,
  /^src\/pages\/reports\/CustomReportsAdmin\.jsx$/,
];
const uiBusinessBindingPatterns=[
  ["HARDCODED_BUSINESS_OBJECT_KEY",/\b(?:initialObjectKey|objectKey)\s*[:=]\s*["'](?:sale|customer|product|supplier|purchase|inventory|online_order|till_session)["']/gi],
  ["HARDCODED_SALES_DATASOURCE",/\bdataSource\s*:\s*["']sales["']/gi],
  ["HARDCODED_BUSINESS_API",/\/api\/(?:sales|customers|products|suppliers|purchases|inventory|online-orders|hospitality|kiosk)(?:\/|["'`?])/gi],
  ["HARDCODED_RECORD_BUSINESS_PATH",/\b(?:record|currentRecord)\.(?:customer|product|supplier|purchase|sale|inventory)\b/gi],
];
for(const file of runtimeFiles.filter((file)=>genericUiPaths.some((pattern)=>pattern.test(rel(file))))){
  const text=fs.readFileSync(file,"utf8");
  for(const [rule,pattern] of uiBusinessBindingPatterns){
    for(const match of text.matchAll(pattern)) add(rule,file,text,match.index,match[0]);
  }
}

const coreFiles=[
  "server/services/platformWorkflow.js",
  "server/services/platformActionRegistry.js",
  "server/services/oneCoreFunctions.js",
  "server/services/systemWorkflowRuntime.js",
  "server/services/systemWorkflowCatalog.js",
];
const providerPattern=/\b(?:uber(?:_eats)?|deliveroo|just[_ -]?eat|shopify|quickbooks|paypal|dojo|sumup|mailchimp|open_food_facts|go_upc|upcitemdb|barcode_nest)\b/gi;
for(const item of coreFiles){
  const file=path.join(ROOT,item);
  if(!fs.existsSync(file)) continue;
  const text=fs.readFileSync(file,"utf8");
  for(const match of text.matchAll(providerPattern)) add("PROVIDER_SPECIFIC_CORE_RUNTIME",file,text,match.index,match[0]);
}

const functionRegistry=path.join(ROOT,"server/services/platformFunctionRegistry.js");
if(fs.existsSync(functionRegistry)){
  const text=fs.readFileSync(functionRegistry,"utf8");
  const businessFunction=/\bkey\s*:\s*["'][^"']*(?:sale|customer|product|supplier|purchase|inventory|uber|quickbooks|receipt)[^"']*["']/gi;
  for(const match of text.matchAll(businessFunction)) add("BUSINESS_FUNCTION_REGISTRY_ENTRY",functionRegistry,text,match.index,match[0]);
}

const report={generatedAt:new Date().toISOString(),scannedFiles:runtimeFiles.length,errors:findings.length,findings};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","metadata-architecture-audit.json"),JSON.stringify(report,null,2)+"\n");
if(findings.length){
  console.error(`Metadata architecture audit failed with ${findings.length} violation(s).`);
  for(const finding of findings) console.error(`- ${finding.rule}: ${finding.file}${finding.line?":"+finding.line:""}${finding.detail?" · "+finding.detail:""}`);
  process.exit(1);
}
console.log(`Metadata architecture audit passed across ${runtimeFiles.length} executable source files with 0 violations.`);
