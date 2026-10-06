import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTABLE_ROOTS = ["server", "src"];
const IGNORE_PARTS = ["/docs/", "/database/migrations/", "/database/archive/", "/node_modules/"];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:js|jsx|mjs|json)$/.test(entry.name) ? [full] : [];
  });
}
function rel(file) { return path.relative(ROOT, file).replaceAll("\\", "/"); }
function ignored(file) {
  const normalized = "/" + rel(file);
  return IGNORE_PARTS.some((part) => normalized.includes(part));
}
function lineOf(text, index) { return text.slice(0, index).split("\n").length; }

const checks = [
  { rule: "LEGACY_CALL_FUNCTION", pattern: /\bCALL_FUNCTION\b/g },
  { rule: "LEGACY_FUNCTION_REGISTRY", pattern: /platformFunctionRegistry|getRegisteredFunction|PLATFORM_FUNCTIONS/g },
  { rule: "LEGACY_ASSISTANT_SUBFLOW_WRAPPER", pattern: /\bRUN_ASSISTANT_SUBFLOW\b/g },
  { rule: "LAYOUT_CALL_FUNCTION", pattern: /\bcall_function\b/g },
];

const targetedFiles = {
  "src/pages/till/TillPage.jsx": [
    { rule: "TILL_STORAGE_CUSTOMER_ID", pattern: /\bcustomer_id\s*:/g },
    { rule: "TILL_STORAGE_PAYMENT_METHOD", pattern: /\bpayment_method\s*:/g },
    { rule: "TILL_NAMED_BUTTON_BRANCH", pattern: /button_key\s*===\s*["'][^"']+["']/g },
  ],
  "src/pages/kiosk/OneKioskPage.jsx": [
    { rule: "KIOSK_STORAGE_CUSTOMER_ID", pattern: /\bcustomer_id\s*:/g },
    { rule: "KIOSK_STORAGE_PAYMENT_METHOD", pattern: /\bpayment_method\s*:/g },
    { rule: "KIOSK_NAMED_BUTTON_ENDPOINT", pattern: /\/buttons\/till_[A-Za-z0-9_-]+\/execute/g },
    { rule: "KIOSK_HARDCODED_DEMO_CATALOGUE", pattern: /\bDEMO_PRODUCTS\b/g },
  ],
  "src/services/integrationFieldCatalogue.js": [
    { rule: "INTEGRATION_FIXED_SALES_PATH", pattern: /["']sales\.[A-Za-z0-9_[\].]+["']/g },
    { rule: "INTEGRATION_FIXED_PURCHASE_PATH", pattern: /["']purchase\.[A-Za-z0-9_[\].]+["']/g },
  ],
  "src/components/dashboard/platformDashboard.js": [
    { rule: "DASHBOARD_SALES_FIELD_MIRROR", pattern: /DASHBOARD_SALES_FIELDS|DATE_FILTER_FIELDS/g },
  ],
  "src/App.jsx": [
    { rule: "APP_HARDCODED_ROUTE_ALLOWLIST", pattern: /\bconst\s+routeMap\s*=|\bconst\s+aliases\s*=/g },
    { rule: "APP_RECORD_SPECIFIC_RENDER", pattern: /activeApp\s*===\s*["'](?:products|customers|purchases|suppliers|online-orders)["']/g },
  ],
};

const findings = [];
for (const root of EXECUTABLE_ROOTS) {
  for (const file of walk(path.join(ROOT, root))) {
    if (ignored(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const check of checks) {
      for (const match of source.matchAll(check.pattern)) {
        findings.push({ rule: check.rule, file: rel(file), line: lineOf(source, match.index) });
      }
    }
  }
}
for (const [fileName, fileChecks] of Object.entries(targetedFiles)) {
  const full = path.join(ROOT, fileName);
  if (!fs.existsSync(full)) {
    findings.push({ rule: "REQUIRED_PHASE3_FILE_MISSING", file: fileName, line: 0 });
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  for (const check of fileChecks) {
    for (const match of source.matchAll(check.pattern)) {
      findings.push({ rule: check.rule, file: fileName, line: lineOf(source, match.index) });
    }
  }
}

const removedFiles = [
  "server/services/platformFunctionRegistry.js",
  "server/packages/functionsIndex.js",
  "server/packages/purchasing_core/functions.js",
  "server/packages/finance_core/functions.js",
  "src/pages/settings/WhatsAppAssistantSettings.jsx",
];
for (const file of removedFiles) {
  if (fs.existsSync(path.join(ROOT, file))) findings.push({ rule: "REMOVED_FILE_REINTRODUCED", file, line: 0 });
}

const report = {
  generatedAt: new Date().toISOString(),
  scannedFiles: EXECUTABLE_ROOTS.flatMap((root) => walk(path.join(ROOT, root))).filter((file) => !ignored(file)).length,
  violations: findings.length,
  findings,
};
fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "artifacts", "metadata-purity-audit.json"), JSON.stringify(report, null, 2) + "\n");

if (findings.length) {
  console.error(`Metadata purity audit failed with ${findings.length} violation(s).`);
  for (const item of findings) console.error(`- ${item.rule}: ${item.file}${item.line ? ":" + item.line : ""}`);
  process.exit(1);
}
console.log(`Metadata purity audit passed across ${report.scannedFiles} executable source files with 0 violations.`);
