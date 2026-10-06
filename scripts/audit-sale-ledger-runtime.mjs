import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const rootPath = decodeURIComponent(root.pathname).replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1));
const scanRoots = ["server", "src"];
const allowedExtensions = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const excludedPrefixes = [
  "server/database/",
  "server/docs/",
  "server/metadata/manifests/",
  "server/src/marketing/",
];
const violations = [];

const rules = [
  {
    name: "legacy sales SQL table",
    regex: /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(sales|sale_items|payments|refunds)\b/gi,
  },
  {
    name: "legacy sales object route",
    regex: /\/api\/platform\/(?:runtime\/)?objects\/sale(?:\/|["'`])/g,
  },
  {
    name: "legacy sales object key",
    regex: /objectKey\s*:\s*["'](sale|sale_item|payment|refund)["']/g,
  },
];

async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!allowedExtensions.has(extname(entry))) continue;
    const rel = relative(rootPath, full).replaceAll("\\", "/");
    if (excludedPrefixes.some((prefix) => rel.startsWith(prefix))) continue;
    const source = await readFile(full, "utf8");
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(source))) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push({ file: rel, line, rule: rule.name, match: match[0] });
      }
    }
  }
}

for (const scanRoot of scanRoots) await walk(join(rootPath, scanRoot));

if (violations.length) {
  console.error("Sale Ledger runtime audit failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.rule}] ${violation.match}`);
  }
  process.exit(1);
}
console.log("Sale Ledger runtime audit passed");
