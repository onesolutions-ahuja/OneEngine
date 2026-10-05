import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const extensions = new Set([".js", ".mjs", ".cjs"]);
const sourceFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) sourceFiles.push(full);
  }
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...[...extensions].map((ext) => base + ext),
    ...[...extensions].map((ext) => path.join(base, "index" + ext)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

walk(root);

const patterns = [
  /(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const syntaxFailures = [];
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    syntaxFailures.push({
      file: path.relative(root, file).replaceAll(path.sep, "/"),
      error: String(result.stderr || result.stdout || "Syntax check failed").trim(),
    });
  }
}

if (syntaxFailures.length) {
  console.error("Runtime JavaScript syntax failures:");
  for (const item of syntaxFailures) console.error(` - ${item.file}: ${item.error}`);
  process.exit(1);
}

const missing = [];
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      if (!resolveLocalImport(file, specifier)) {
        missing.push({
          importer: path.relative(root, file).replaceAll(path.sep, "/"),
          specifier,
        });
      }
    }
  }
}

if (missing.length) {
  console.error("Missing local runtime imports:");
  for (const item of missing) console.error(` - ${item.importer} -> ${item.specifier}`);
  process.exit(1);
}

console.log(`Runtime syntax/import check passed (${sourceFiles.length} source files scanned).`);
