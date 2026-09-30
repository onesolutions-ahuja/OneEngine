import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENFORCE = process.argv.includes("--enforce");
const IGNORE = new Set([".git","node_modules","dist","build","coverage","artifacts"]);
const RUNTIME = new Set([".js",".jsx",".mjs",".cjs"]);
const findings = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function rel(file){ return path.relative(ROOT,file).replaceAll(path.sep,"/"); }
function lineNo(text,index){ return text.slice(0,index).split("\n").length; }
function add(severity,rule,file,detail,line){
  findings.push({severity,rule,file,line:line||null,detail});
}

const allFiles = walk(ROOT);
const runtimeFiles = allFiles.filter((f)=>RUNTIME.has(path.extname(f)));
const sourceRuntime = runtimeFiles.filter((f)=>{
  const r=rel(f);
  return (r.startsWith("server/") || r.startsWith("src/")) && !r.startsWith("server/test/");
});
const cache = new Map();
function read(file){
  if(!cache.has(file)) cache.set(file,fs.readFileSync(file,"utf8"));
  return cache.get(file);
}

for (const file of sourceRuntime) {
  const r=rel(file);
  const text=read(file);
  for (const m of text.matchAll(/development-secret-change-this/g)) {
    add("ERROR","PREDICTABLE_SECRET_FALLBACK",r,"Known JWT fallback secret remains in runtime source",lineNo(text,m.index));
  }
  for (const m of text.matchAll(/\/smart-theme\//g)) {
    add("ERROR","STALE_SMART_THEME_PATH",r,"Obsolete /smart-theme/ runtime path remains",lineNo(text,m.index));
  }
  if (r !== "server/database/init.js") {
    for (const m of text.matchAll(/\bis_superadmin\b/g)) {
      add("ERROR","DEPRECATED_SUPERADMIN_IDENTITY",r,"Deprecated is_superadmin identity reference remains",lineNo(text,m.index));
    }
  }
  for (const m of text.matchAll(/\b(?:role|roleName|user_type|userType)\b[^\n]{0,100}(?:Administrator|Owner|Admin)/gi)) {
    add("WARN","ROLE_NAME_AUTH_LOGIC",r,"Role-name based authorization assumption may bypass RBAC",lineNo(text,m.index));
  }
}

for (const file of runtimeFiles.filter((f)=>rel(f).startsWith("server/"))) {
  const text=read(file);
  const seen=new Map();
  const re=/\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*(["'])([^"']+)\2/g;
  for (const m of text.matchAll(re)) {
    const key=m[1].toUpperCase()+" "+m[3];
    if(seen.has(key)) add("ERROR","DUPLICATE_ROUTE",rel(file),key+" declared more than once; first line "+seen.get(key),lineNo(text,m.index));
    else seen.set(key,lineNo(text,m.index));
  }
}

const routeFiles=runtimeFiles.filter((f)=>rel(f).startsWith("server/routes/") && path.extname(f)===".js");
const serverTexts=sourceRuntime.filter((f)=>rel(f).startsWith("server/")).map((f)=>({file:f,text:read(f)}));
for (const routeFile of routeFiles) {
  const base=path.basename(routeFile,".js");
  const referenced=serverTexts.some((item)=>item.file!==routeFile && (
    item.text.includes("./routes/"+base+".js") ||
    item.text.includes("../routes/"+base+".js") ||
    item.text.includes("routes/"+base+".js")
  ));
  if(!referenced) add("WARN","ORPHAN_ROUTE_MODULE",rel(routeFile),"Route module is not imported by another server runtime file");
}

const permissionUse=new Map();
function notePermission(code,file,line){
  if(!/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/.test(code)) return;
  if(!permissionUse.has(code)) permissionUse.set(code,[]);
  permissionUse.get(code).push({file,line});
}
for (const file of sourceRuntime) {
  const text=read(file);
  const patterns=[
    /\bauthorize\s*\(([^)]*)\)/g,
    /\bhasPermission\s*\([^,]+,\s*(["'])([^"']+)\1/g,
    /\brequiredPermissions\s*:\s*\[([^\]]*)\]/g,
    /\bpermissions\s*:\s*\[([^\]]*)\]/g,
    /\bpermission\s*:\s*(["'])([^"']+)\1/g
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      for (const q of m[0].matchAll(/["']([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["']/g)) {
        notePermission(q[1],rel(file),lineNo(text,m.index));
      }
    }
  }
}
const seeded=new Set();
for (const file of allFiles.filter((f)=>rel(f).startsWith("server/database/"))) {
  if(![".js",".sql"].includes(path.extname(file))) continue;
  const text=read(file);
  for (const m of text.matchAll(/["']([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["']/g)) seeded.add(m[1]);
}
for (const pair of permissionUse.entries()) {
  const code=pair[0], uses=pair[1];
  if(!seeded.has(code)) add("WARN","PERMISSION_NOT_FOUND_IN_DB_SEEDS",uses[0].file,code+" referenced at runtime but not found in database seed sources; uses="+uses.length,uses[0].line);
}

for (const file of sourceRuntime) {
  const r=rel(file);
  if(r==="server/database/init.js" || r==="server/routes/businessDivisions.js") continue;
  const text=read(file);
  let idx=text.indexOf("business_division");
  if(idx<0) idx=text.indexOf("business-divisions");
  if(idx>=0) add("WARN","BUSINESS_DIVISION_SPECIAL_CASE",r,"Legacy Business Division special-case reference remains",lineNo(text,idx));
  idx=text.indexOf("/reports/profit");
  if(idx>=0) add("INFO","PROFIT_REPORT_PRESENT",r,"Profit/Margin reporting endpoint remains active; verify against current product scope",lineNo(text,idx));
}

const summary={
  scannedFiles:allFiles.length,
  runtimeFiles:runtimeFiles.length,
  sourceRuntimeFiles:sourceRuntime.length,
  errors:findings.filter((x)=>x.severity==="ERROR").length,
  warnings:findings.filter((x)=>x.severity==="WARN").length,
  info:findings.filter((x)=>x.severity==="INFO").length
};
const report={generatedAt:new Date().toISOString(),summary,findings};
const outDir=path.join(ROOT,"artifacts");
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,"deep-project-audit.json"),JSON.stringify(report,null,2)+"\n");
const md=["# OneEngine Deep Project Audit","",
  "Generated: "+report.generatedAt,"",
  "- Scanned files: "+summary.scannedFiles,
  "- Runtime files: "+summary.runtimeFiles,
  "- Errors: "+summary.errors,
  "- Warnings: "+summary.warnings,
  "- Info: "+summary.info,""
];
for(const f of findings) md.push("- **"+f.severity+"** "+f.rule+" — "+f.file+(f.line?":"+f.line:"")+" — "+f.detail);
fs.writeFileSync(path.join(outDir,"deep-project-audit.md"),md.join("\n")+"\n");
console.log(JSON.stringify(summary,null,2));
for(const f of findings) console.log(f.severity+" "+f.rule+" "+f.file+(f.line?":"+f.line:"")+" :: "+f.detail);
if(ENFORCE && summary.errors>0) process.exit(1);
