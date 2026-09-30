import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const findings=[];
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) return entry.name==="node_modules"||entry.name==="dist"?[]:walk(full);
    return [full];
  });
}
function rel(file){return path.relative(ROOT,file).replaceAll(path.sep,"/");}
function lineNo(text,index){return text.slice(0,index).split("\n").length;}
function normalise(value){
  let p=String(value||"").replace(/\$\{[^}]+\}/g,"*").split("?")[0].replace(/:[A-Za-z0-9_]+/g,"*");
  p=p.replace(/\/+/g,"/");
  if(p.length>1&&p.endsWith("/")) p=p.slice(0,-1);
  return p;
}
function matches(pattern,value){
  const a=normalise(pattern).split("/").filter(Boolean);
  const b=normalise(value).split("/").filter(Boolean);
  if(a.length!==b.length) return false;
  return a.every((seg,i)=>seg==="*"||b[i]==="*"||seg===b[i]);
}

const backend=new Set();
const serverEntry=fs.readFileSync(path.join(ROOT,"server","server.js"),"utf8");
for(const m of serverEntry.matchAll(/\bapp\.(?:get|post|put|patch|delete)\s*\(\s*(["'])(\/api\/[^"']+)\1/g)) backend.add(normalise(m[2]));

const routerMounts=new Map();
for(const m of serverEntry.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["']\.\/routes\/([^"']+)["']/g)){
  routerMounts.set(m[1],{file:"server/routes/"+m[2],prefix:"/api"});
}
for(const m of serverEntry.matchAll(/app\.use\(\s*(["'])(\/api[^"']*)\1\s*,\s*([A-Za-z_$][\w$]*)\s*\(/g)){
  const info=routerMounts.get(m[3]);
  if(info) info.prefix=m[2];
}
for(const m of serverEntry.matchAll(/app\.use\(\s*(["'])(\/api[^"']*)\1\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)){
  const info=routerMounts.get(m[3]);
  if(info) info.prefix=m[2];
}

for(const file of walk(path.join(ROOT,"server","routes")).filter((f)=>f.endsWith(".js"))){
  const text=fs.readFileSync(file,"utf8");
  const routeRel=rel(file);
  const mount=[...routerMounts.values()].find((x)=>x.file===routeRel)?.prefix || "/api";
  const addRoute=(route)=>{
    const full=route.startsWith("/api/")?route:(mount.replace(/\/$/,"")+route);
    backend.add(normalise(full));
  };
  for(const m of text.matchAll(/\brouter\.(?:get|post|put|patch|delete)\s*\(\s*(["'])([^"']+)\1/g)) addRoute(m[2]);
  for(const m of text.matchAll(/\brouter\.(?:get|post|put|patch|delete)\s*\(\s*\[([^\]]+)\]/g)){
    for(const q of m[1].matchAll(/["']([^"']+)["']/g)) addRoute(q[1]);
  }
}

const calls=[];
for(const file of walk(path.join(ROOT,"src")).filter((f)=>/\.(?:js|jsx)$/.test(f))){
  const text=fs.readFileSync(file,"utf8");
  const re=/\bapiRequest\s*\(\s*(["'\x60])([\s\S]*?)\1/g;
  for(const m of text.matchAll(re)){
    const raw=m[2];
    if(!raw.startsWith("/api/")) continue;
    let call=normalise(raw);
    const after=text.slice(m.index+m[0].length,m.index+m[0].length+120);
    if(raw.endsWith("/") && /^\s*\+/.test(after)) call=normalise(raw+"*");
    calls.push({file:rel(file),line:lineNo(text,m.index),raw,call});
  }
}

for(const call of calls){
  if(![...backend].some((route)=>matches(route,call.call))){
    findings.push({...call,code:"FRONTEND_API_ROUTE_NOT_FOUND"});
  }
}

const report={
  generatedAt:new Date().toISOString(),
  backendRoutes:backend.size,
  frontendLiteralCalls:calls.length,
  unmatched:findings.length,
  findings
};
fs.mkdirSync(path.join(ROOT,"artifacts"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"artifacts","api-contract-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({backendRoutes:report.backendRoutes,frontendLiteralCalls:report.frontendLiteralCalls,unmatched:report.unmatched},null,2));
for(const f of findings) console.log("UNMATCHED "+f.file+":"+f.line+" "+f.raw);
