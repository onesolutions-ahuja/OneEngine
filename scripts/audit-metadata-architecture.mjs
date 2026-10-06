import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const findings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:js|jsx|mjs|json)$/.test(entry.name) ? [full] : [];
  });
}
const rel = (file) => path.relative(ROOT, file).replaceAll("\\", "/");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const add = (rule, file, text, match, detail = "") => findings.push({
  rule, file: rel(file), line: lineOf(text, match.index ?? 0), detail,
});

const runtimeFiles = [
  ...walk(path.join(ROOT, "server", "routes")),
  ...walk(path.join(ROOT, "server", "services")),
  ...walk(path.join(ROOT, "server", "platform")),
  ...walk(path.join(ROOT, "server", "packages")),
  ...walk(path.join(ROOT, "src")),
].filter((file) => !/\/(?:docs|marketing)\//.test(file.replaceAll("\\","/")));

for (const file of runtimeFiles) {
  const text = fs.readFileSync(file, "utf8");

  for (const re of [/\bCALL_FUNCTION\b/g, /\bcall_function\b/g, /platformFunctionRegistry/g]) {
    for (const match of text.matchAll(re)) add("LEGACY_FUNCTION_EXECUTION", file, text, match, match[0]);
  }

  if (/\/src\/(?:pages\/developer|pages\/settings\/Platform|platform\/workspace)\//.test(file.replaceAll("\\","/"))) {
    for (const re of [
      /\b(?:customer|supplier|purchase|sale|inventory|hospitality|online_order|product)_?[a-z0-9_]*\b/gi,
      /["'](?:customer|supplier|purchase|sale|inventory|hospitality|online_order|product)["']/gi,
    ]) {
      for (const match of text.matchAll(re)) {
        const value = String(match[0] || "").toLowerCase();
        if (/productname|product_name/.test(value)) continue;
        add("BUILDER_BUSINESS_IDENTIFIER", file, text, match, match[0]);
      }
    }
  }
}

const BUSINESS_TABLE = /^(?:products?|categories|customers?|sales?|sale_items?|suppliers?|supplier_.+|purchases?|purchase_.+|inventory_.+|stock_.+|online_orders?|hospitality_.+|appointments?)$/i;
for (const file of [
  ...walk(path.join(ROOT, "server", "routes")),
  ...walk(path.join(ROOT, "server", "services")),
  ...walk(path.join(ROOT, "server", "platform")),
]) {
  const text = fs.readFileSync(file, "utf8");
  const sql = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  for (const match of text.matchAll(sql)) {
    const table = match[2];
    if (BUSINESS_TABLE.test(table)) add("DIRECT_BUSINESS_SQL_MUTATION", file, text, match, table);
  }
}

const businessApi = /["'`]\/api\/(?:products?|customers?|sales?|purchases?|suppliers?|inventory|stock|online-orders?|hospitality|appointments?)(?:\/|["'`])/gi;
for (const file of walk(path.join(ROOT, "src"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(businessApi)) add("UI_BUSINESS_ENDPOINT_WIRING", file, text, match, match[0]);
}

const report = {
  generatedAt: new Date().toISOString(),
  scannedFiles: runtimeFiles.length,
  violations: findings.length,
  findings,
};
fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "artifacts", "metadata-architecture-audit.json"), JSON.stringify(report, null, 2) + "\n");

if (findings.length) {
  console.error(`Metadata architecture audit failed with ${findings.length} violation(s).`);
  for (const item of findings) console.error(`- ${item.rule}: ${item.file}:${item.line} ${item.detail}`);
  process.exit(1);
}
console.log(`Metadata architecture audit passed across ${report.scannedFiles} runtime source files with 0 violations.`);
