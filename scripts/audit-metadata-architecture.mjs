import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const violations = [];
const runtimeRoots = ["server/routes","server/services","src"];
const allowedSqlFiles = new Set([
  "server/services/auditLog.js",
  "server/services/platformJobs.js",
  "server/services/platformEvents.js",
  "server/services/platformNotifications.js",
  "server/services/platformApprovals.js",
  "server/services/packageLifecycleRuntime.js",
  "server/services/businessCommandGateway.js",
  "server/platform/workflow/runtime/runState.js",
  "server/services/identityAssurance.js",
  "server/services/identitySecurity.js",
  "server/services/accountPolicy.js",
  "server/database/rbacBootstrap.js",
  "server/database/oneSolutionsSeeder.js"
]);
const ignoredDirs = new Set(["node_modules","dist","build",".git","coverage","playwright-report","test-results","docs","server/docs","server/database","server/metadata"]);
const businessTerms = /\b(sales?|customers?|suppliers?|purchases?|products?|inventory|returns?|exchanges?|layaway|loyalty|gift[_ -]?cards?|online[_ -]?orders?|hospitality|kiosk|till)\b/i;
const sqlDml = /\b(?:INSERT\s+INTO|UPDATE\s+[a-zA-Z_][\w]*\s+SET|DELETE\s+FROM)\b/i;
const legacyExec = /\bCALL_FUNCTION\b|\bcall_function\b|platformFunctionRegistry|getRegisteredFunction|executePlatformFunction/g;

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    const rel=path.relative(ROOT,full).replaceAll("\\","/");
    if (entry.isDirectory()) {
      if ([...ignoredDirs].some((d)=>rel===d || rel.startsWith(d+"/"))) continue;
      walk(full,out);
    } else if (/\.(?:js|jsx|mjs|cjs|json)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
function add(file, rule, detail){ violations.push({file,rule,detail}); }

for (const root of runtimeRoots) {
  for (const file of walk(path.join(ROOT,root))) {
    const text=fs.readFileSync(path.join(ROOT,file),"utf8");
    if (legacyExec.test(text)) add(file,"legacy-execution","CALL_FUNCTION/function-registry compatibility remains");
    legacyExec.lastIndex=0;

    if ((file.startsWith("server/routes/") || file.startsWith("server/services/")) && sqlDml.test(text) && !allowedSqlFiles.has(file)) {
      const businessSql = text.split(/\r?\n/).some((line)=>sqlDml.test(line) && businessTerms.test(line));
      if (businessSql) add(file,"business-sql","business persistence must use metadata CRUD/Flows");
    }

    if (file.startsWith("src/") && !file.includes("/marketing/")) {
      const directBusinessWiring = text.split(/\r?\n/).some((line)=>{
        if (/placeholder|example|aria-label|className|data-testid/i.test(line)) return false;
        return businessTerms.test(line) && /(?:objectKey|fieldValues|customer_id|supplier_id|sale_id|purchase_id|\/api\/|action\s*:)/i.test(line);
      });
      if (directBusinessWiring) add(file,"ui-business-wiring","UI contains business object/field/action/API knowledge; move to metadata");
    }
  }
}

for (const file of ["server/services/packageRegistry.js","server/services/platformMetadata.js"]) {
  const full=path.join(ROOT,file);
  if (fs.existsSync(full)) {
    const text=fs.readFileSync(full,"utf8");
    if (businessTerms.test(text)) add(file,"business-metadata-in-runtime","business definitions must live in metadata manifests, not runtime registries");
  }
}

if (violations.length) {
  console.error("\nMetadata architecture audit FAILED\n");
  for (const v of violations) console.error(`- ${v.file}: [${v.rule}] ${v.detail}`);
  console.error(`\n${violations.length} violation(s).\n`);
  process.exit(1);
}
console.log("Metadata architecture audit passed: 0 violations.");
