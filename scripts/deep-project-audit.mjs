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
  summary:{
    syntaxFailures:failures.filter(x=>x.type==="SYNTAX").length,
    importFailures:failures.filter(x=>x.type==="IMPORT").length,
    totalFailures:failures.length
  }
};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","deep-project-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report.summary,null,2));
if(failures.length){
  console.error(JSON.stringify(failures,null,2));
  process.exit(1);
}
