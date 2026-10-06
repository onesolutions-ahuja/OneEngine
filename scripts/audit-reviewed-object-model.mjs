import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { packageDefinitions } from "../server/services/packageRegistry.js";

const canonical = new Set([
  "sale_ledger","device_session","cash_ledger","product","customer",
  "purchase_ledger","inventory_ledger","inventory_batch","salesorder",
]);
const removed = new Set([
  "sale","sale_item","payment","refund","till_session","cash_movement",
  "purchase","purchase_line","purchase_receipt","supplier_invoice","supplier_payment","supplier_payment_allocation",
  "inventory_movement","online_order","online_order_line",
  "appointment","appointment_booking_case",
  "loyalty_configuration","loyalty_account","loyalty_activity","loyalty_adjustment",
  "gift_card_activity",
]);

const packages = packageDefinitions();
const activeObjects = [];
for (const pkg of packages) {
  for (const object of pkg?.manifest?.objects || []) {
    activeObjects.push({ packageKey: pkg.packageKey, objectKey: object.objectKey, sourceTable: object.sourceTable });
    assert.equal(removed.has(object.objectKey), false, `Removed object survived active package metadata: ${pkg.packageKey} -> ${object.objectKey}`);
  }
  JSON.stringify(pkg?.manifest || {}, (key, value) => {
    if (["objectKey","relatedObjectKey","parentObjectKey","childObjectKey"].includes(key) && removed.has(String(value || ""))) {
      throw new Error(`Removed object reference survived active package metadata: ${pkg.packageKey} -> ${value}`);
    }
    return value;
  });
}

for (const key of canonical) {
  assert.ok(activeObjects.some((object) => object.objectKey === key), `Missing canonical object: ${key}`);
}
assert.equal(activeObjects.filter((object) => object.objectKey === "purchase_ledger").length, 1, "purchase_ledger must have one package owner");
assert.equal(activeObjects.find((object) => object.objectKey === "purchase_ledger")?.packageKey, "purchasing_core", "purchasing_core must own purchase_ledger");

const rootPath = process.cwd();
const extensions = new Set([".js",".jsx",".mjs",".cjs"]);
const excluded = [
  "server/database/",
  "server/metadata/manifests/",
  "server/packages/oneAssistantManifest.js",
  "server/src/marketing/",
  "server/docs/",
  "docs/",
  "tests/",
];
const oldTables = [
  "sales","sale_items","refunds",
  "till_sessions","cash_movements","inventory_movements",
  "purchases","purchase_items","purchase_receipts","purchase_receipt_items",
  "supplier_invoices","supplier_payments","supplier_payment_allocations",
  "online_orders","online_order_items",
  "customer_loyalty_balances","customer_loyalty_transactions","customer_loyalty_adjustments",
  "gift_card_transactions",
];
const oldKeyPattern = [...removed].sort((a,b)=>b.length-a.length).join("|");
const oldTablePattern = oldTables.sort((a,b)=>b.length-a.length).join("|");
const rules = [
  { name: "legacy physical table", regex: new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+(${oldTablePattern})\\b`, "gi") },
  { name: "legacy platform object route", regex: new RegExp(`/api/platform/(?:runtime/)?objects/(${oldKeyPattern})(?:/|[\\"'\\`])`, "g") },
  { name: "legacy metadata object key", regex: new RegExp(`objectKey\\s*:\\s*[\\"'](${oldKeyPattern})[\\"']`, "g") },
  { name: "legacy workspace object key", regex: new RegExp(`initialObjectKey=[\\"'](${oldKeyPattern})[\\"']`, "g") },
];
const violations = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { await walk(full); continue; }
    if (!extensions.has(extname(entry.name))) continue;
    const rel = relative(rootPath, full).replaceAll("\\", "/");
    if (excluded.some((prefix) => rel.startsWith(prefix))) continue;
    const source = await readFile(full, "utf8");
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(source))) {
        violations.push({ file: rel, line: source.slice(0, match.index).split("\n").length, rule: rule.name, match: match[0] });
      }
    }
  }
}

await walk(join(rootPath, "server"));
await walk(join(rootPath, "src"));
if (violations.length) {
  console.error("Reviewed object-model audit failed:");
  for (const item of violations) console.error(`- ${item.file}:${item.line} [${item.rule}] ${item.match}`);
  process.exit(1);
}
console.log("Reviewed object-model audit passed");
