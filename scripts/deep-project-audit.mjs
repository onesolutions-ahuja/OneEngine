import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const SERVER=path.join(ROOT,"server");
const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name);
  return e.isDirectory()?walk(p):[p];
});
const rel=(p)=>path.relative(ROOT,p).replaceAll("\\","/");
const jsFiles=walk(SERVER).filter(p=>/\.(js|mjs)$/.test(p));
const routeFiles=jsFiles.filter(p=>rel(p).startsWith("server/routes/"));
const serviceFiles=jsFiles.filter(p=>rel(p).startsWith("server/services/"));
const failures=[];
const staticFindings=[];

for (const file of jsFiles) {
  const source=fs.readFileSync(file,"utf8");
  const fileName=rel(file);

  const suspiciousSqlPatterns=[
    { code:"SQL_PARAM_PLACEHOLDER_MISSING_DOLLAR", re:/(?:company_id|store_id|record_id|user_id|role_id|object_id)=\$\{(?:[A-Za-z_$][\w$]*Params|params)\.length\}/g },
    { code:"SQL_SET_PLACEHOLDER_MISSING_DOLLAR", re:/source_column[^\n]{0,160}="\$\{[^\n]+\}"=\$\{index\s*\+\s*1\}/g },
  ];
  for (const {code,re} of suspiciousSqlPatterns) {
    for (const match of source.matchAll(re)) {
      staticFindings.push({
        type:"STATIC",
        code,
        file:fileName,
        line:source.slice(0,match.index).split("\n").length,
        excerpt:match[0].slice(0,500),
      });
    }
  }
}

const seedSources=[
  path.join(SERVER,"database","init.js"),
  path.join(SERVER,"database","schema.sql"),
  path.join(SERVER,"database","baseFoundation.sql"),
].filter(fs.existsSync).map((file)=>fs.readFileSync(file,"utf8")).join("\n");
const seededPermissionCodes=new Set([...seedSources.matchAll(/["\']([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["\']/gi)].map((m)=>m[1]));
const referencedPermissions=new Map();
const serverRouteImports=new Set([...fs.readFileSync(path.join(SERVER,"server.js"),"utf8").matchAll(/from\s+["\']\.\/routes\/([^"\']+)["\']/g)].map((m)=>`server/routes/${m[1]}`));
function rememberPermission(code,fileName,index,source){
  if(!/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i.test(code)) return;
  if(!referencedPermissions.has(code)) referencedPermissions.set(code,[]);
  referencedPermissions.get(code).push({file:fileName,line:source.slice(0,index).split("\n").length});
}
for(const file of [...routeFiles.filter((file)=>serverRouteImports.has(rel(file))),...serviceFiles]){
  const source=fs.readFileSync(file,"utf8");
  const fileName=rel(file);
  const contexts=[
    /\bauthorize\s*\(([^)]*)\)/g,
    /\brequiredPermissions\s*:\s*\[([^\]]*)\]/g,
    /\bpermissions\s*:\s*\[([^\]]*)\]/g,
  ];
  for(const re of contexts){
    for(const match of source.matchAll(re)){
      for(const literal of match[1].matchAll(/["\']([^"\']+)["\']/g)) rememberPermission(literal[1],fileName,match.index,source);
    }
  }
}
for(const [code,locations] of referencedPermissions){
  if(seededPermissionCodes.has(code)) continue;
  const first=locations[0];
  staticFindings.push({type:"STATIC",code:"UNSEEDED_PERMISSION_REFERENCE",file:first.file,line:first.line,excerpt:code,locations});
}

const serverEntry=fs.readFileSync(path.join(SERVER,"server.js"),"utf8");
if (!serverEntry.includes("const requestAwarePool = createRequestAwarePool(pool);")) {
  staticFindings.push({type:"STATIC",code:"REQUEST_AWARE_POOL_MISSING",file:"server/server.js",line:1,excerpt:"request-aware pool proxy is not configured"});
}
for (const match of serverEntry.matchAll(/create([A-Za-z0-9]+)Router\(\{[^\n}]*\bpool\b(?!\s*:)/g)) {
  if (match[1] === "Superadmin" || match[1] === "TenantDatabase") continue;
  staticFindings.push({
    type:"STATIC",
    code:"RAW_POOL_ROUTER_INJECTION",
    file:"server/server.js",
    line:serverEntry.slice(0,match.index).split("\n").length,
    excerpt:match[0].slice(0,500),
  });
}

for(const file of jsFiles){
  const r=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});
  if(r.status!==0) failures.push({type:"SYNTAX",file:rel(file),error:(r.stderr||r.stdout||"").slice(0,3000)});
}

const importCandidates=[...routeFiles,...serviceFiles].filter(file=>{
  const r=rel(file);
  return !r.includes("/jarvis/providers/"); // provider modules may require external runtime configuration
});
for(const file of importCandidates){
  const script=`process.env.JWT_SECRET||="audit-secret"; process.env.NODE_ENV="test"; import(${JSON.stringify(pathToFileURL(file).href)}).catch(e=>{console.error(e?.stack||e);process.exit(1)})`;
  const r=spawnSync(process.execPath,["--input-type=module","-e",script],{
    encoding:"utf8",
    timeout:15000,
    env:{...process.env,JWT_SECRET:process.env.JWT_SECRET||"audit-secret",NODE_ENV:"test"}
  });
  if(r.status!==0) failures.push({type:"IMPORT",file:rel(file),error:(r.stderr||r.stdout||"").slice(0,4000)});
}

const report={
  generatedAt:new Date().toISOString(),
  filesChecked:jsFiles.length,
  routeFiles:routeFiles.length,
  serviceFiles:serviceFiles.length,
  importCandidates:importCandidates.length,
  failures,
  staticFindings,
  summary:{
    syntaxFailures:failures.filter(x=>x.type==="SYNTAX").length,
    importFailures:failures.filter(x=>x.type==="IMPORT").length,
    staticFindings:staticFindings.length,
    totalFailures:failures.length + staticFindings.length
  }
};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","deep-project-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report.summary,null,2));
if(failures.length || staticFindings.length){
  console.error(JSON.stringify([...failures,...staticFindings],null,2));
  process.exit(1);
}
