import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "artifacts");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules",".git","dist","artifacts","coverage","playwright-report","test-results"].includes(entry.name)) return [];
      return walk(full);
    }
    return /\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
const rel = (file) => path.relative(ROOT,file).replaceAll("\\","/");
const line = (text,index) => text.slice(0,index).split("\n").length;
const findings = [];
function add(rule,file,text,index,detail="") {
  findings.push({rule,file:rel(file),line:line(text,index),detail});
}

const runtimeRoots=[
  path.join(ROOT,"src"),
  path.join(ROOT,"server","routes"),
  path.join(ROOT,"server","services"),
  path.join(ROOT,"server","packages"),
  path.join(ROOT,"scripts"),
];
const runtimeFiles=runtimeRoots.flatMap((dir)=>fs.existsSync(dir)?walk(dir):[]);

function metadataAuthority(p) {
  return p === "server/packages/packageManifestCatalog.js" ||
    p === "server/services/packageRegistry.js" ||
    p.startsWith("server/metadata/") ||
    p.startsWith("server/database/");
}

const genericSqlInfrastructure = new Set([
  "server/services/platformWorkflow.js",
  "server/services/platformActionRegistry.js",
  "server/services/platformMetadata.js",
  "server/services/platformDomainRecords.js",
  "server/services/platformRecordStorage.js",
  "server/services/platformMetadataDeployment.js",
  "server/services/reportableSources.js",
  "server/services/reportExecution.js",
  "server/services/platformReportSecurity.js",
  "server/services/dashboardExecution.js",
  "server/services/reportSubscriptionRuntime.js",
  "server/routes/platform.js",
  "server/routes/reports.js",
  "server/routes/dashboardBuilder.js",
  "server/routes/packages.js"
]);

const businessTables = new Set([
  "sales","sale_items","customers","products","suppliers","purchases","purchase_items",
  "online_orders","online_order_items","inventory_ledger","inventory_movements","stock_levels",
  "supplier_invoices","supplier_payments","gift_cards","gift_card_ledger","customer_ledger",
  "cash_ledger","cash_movements","till_sessions","attendance","layaways","refunds","payments"
]);
const sqlMutation = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["\x60]?([a-zA-Z0-9_]+)["\x60]?/gi;
const legacyUiApi=/\/api\/(?:sales|products|customers|suppliers|purchases|returns|online-orders|hospitality|kiosk)(?:\/|\b)/g;
const retiredFunction=/\bCALL_FUNCTION\b/g;
const builderBusinessDefault=/(?:dataSource\s*:\s*["']sales["']|(?:objectKey|object_key|rootObjectKey)\s*[:=]\s*["'](?:sale|customer|product|supplier|purchase|inventory|online_order)["'])/g;

for(const file of runtimeFiles){
  const p=rel(file);
  const text=fs.readFileSync(file,"utf8");

  if(!metadataAuthority(p)){
    for(const match of text.matchAll(retiredFunction)) add("RETIRED_CALL_FUNCTION",file,text,match.index,match[0]);
  }

  if(p.startsWith("src/")){
    for(const match of text.matchAll(legacyUiApi)) add("DIRECT_BUSINESS_API_UI",file,text,match.index,match[0]);
  }

  if(
    p.includes("/developer/") ||
    p.includes("/settings/Platform/") ||
    /(?:DashboardBuilder|CustomReportsAdmin|PageBuilder|WorkflowAdmin|componentRegistry)/.test(p)
  ){
    for(const match of text.matchAll(builderBusinessDefault)) add("BUILDER_BUSINESS_DEFAULT",file,text,match.index,match[0]);
  }

  if(
    (p.startsWith("server/routes/") || p.startsWith("server/services/")) &&
    !metadataAuthority(p) &&
    !genericSqlInfrastructure.has(p)
  ){
    for(const match of text.matchAll(sqlMutation)) {
      const table=String(match[2]||"").toLowerCase();
      if(businessTables.has(table)) add("DIRECT_BUSINESS_SQL_MUTATION",file,text,match.index,match[0]);
    }
  }
}

const byRule={};
for(const finding of findings) byRule[finding.rule]=(byRule[finding.rule]||0)+1;
const report={generatedAt:new Date().toISOString(),scannedFiles:runtimeFiles.length,violations:findings.length,byRule,findings};
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,"repository-metadata-purity-audit.json"),JSON.stringify(report,null,2)+"\n");

if(findings.length){
  console.error("Repository metadata purity audit FAILED with "+findings.length+" violation(s).");
  for(const finding of findings) console.error("- "+finding.rule+": "+finding.file+":"+finding.line+" "+finding.detail);
  process.exit(1);
}
console.log("Repository metadata purity audit passed across "+runtimeFiles.length+" runtime source files with 0 violations.");
