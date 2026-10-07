import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git","node_modules","dist","build","coverage","artifacts","playwright-report","test-results"]);
const EXEC_EXT = new Set([".js",".jsx",".mjs",".cjs",".ts",".tsx",".mts",".cts",".py",".sh",".ps1"]);
const AUTOMATION_EXT = new Set([".yml",".yaml"]);
const CONFIG_NAMES = new Set(["vite.config.js","playwright.config.js","eslint.config.js"]);
const normalize = (p) => p.replaceAll("\\","/");

function walk(dir, out=[]) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if (entry.isDirectory()) walk(full,out); else out.push(full);
  }
  return out;
}

function classify(rel) {
  const ext=path.extname(rel).toLowerCase();
  const base=path.basename(rel);
  if (rel.startsWith(".github/workflows/") && AUTOMATION_EXT.has(ext)) return "automation";
  if (rel.startsWith("tests/") || rel.startsWith("server/test/") || /(?:^|\/)__tests__\//.test(rel) || /\.test\.[^.]+$/.test(rel) || /\.spec\.[^.]+$/.test(rel)) return "test";
  if (rel.startsWith("scripts/") || rel.startsWith("server/scripts/")) return "tooling";
  if (CONFIG_NAMES.has(base) || /\.config\.(?:js|mjs|cjs|ts)$/.test(base)) return "config";
  if (rel.startsWith("server/database/") && (EXEC_EXT.has(ext) || ext === ".sql")) return "migration-schema";
  if (rel.startsWith("server/") && EXEC_EXT.has(ext)) return "server-runtime";
  if (rel.startsWith("src/") && EXEC_EXT.has(ext)) return "client-runtime";
  if (EXEC_EXT.has(ext)) return "other-executable";
  return "non-executable";
}

const files=walk(ROOT).map((full)=>normalize(path.relative(ROOT,full))).sort();
const rows=files.map((file)=>({file,classification:classify(file)}));
const executableClasses=new Set(["automation","test","tooling","config","migration-schema","server-runtime","client-runtime","other-executable"]);
const executable=rows.filter((row)=>executableClasses.has(row.classification));
const unclassifiedExecutable=executable.filter((row)=>row.classification==="other-executable");
const counts=rows.reduce((acc,row)=>{acc[row.classification]=(acc[row.classification]||0)+1;return acc;},{});

let architecture={violations:null,scannedFiles:null};
const architecturePath=path.join(ROOT,"artifacts","metadata-architecture-audit.json");
if (fs.existsSync(architecturePath)) {
  const parsed=JSON.parse(fs.readFileSync(architecturePath,"utf8"));
  architecture={violations:Number(parsed.violations),scannedFiles:Number(parsed.scannedFiles)};
}
const violations=[];
if (unclassifiedExecutable.length) violations.push(...unclassifiedExecutable.map((row)=>({rule:"UNCLASSIFIED_EXECUTABLE",file:row.file})));
if (architecture.violations !== 0) violations.push({rule:"ARCHITECTURE_AUDIT_NOT_ZERO",file:"artifacts/metadata-architecture-audit.json",value:architecture.violations});

const report={
  generatedAt:new Date().toISOString(),
  totalFiles:rows.length,
  executableFilesAudited:executable.length,
  classificationCounts:counts,
  architectureRuntimeFilesAudited:architecture.scannedFiles,
  violationsRemaining:violations.length,
  violations,
  files:rows,
};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","repository-classification-audit.json"),JSON.stringify(report,null,2)+"\n");
if (violations.length) {
  console.error("Repository classification audit failed.", violations);
  process.exit(1);
}
console.log(`Repository classification audit passed: totalFiles=${report.totalFiles} executableFilesAudited=${report.executableFilesAudited} architectureRuntimeFilesAudited=${report.architectureRuntimeFilesAudited} violationsRemaining=0`);
