import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const manifestsDir=join(root,"server","metadata","manifests");
const businessObjects=new Set();
const businessTables=new Set();

async function walk(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const out=[];
  for(const entry of entries){
    const full=join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}
const escapeRegex=(value)=>String(value).replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");

for(const file of (await walk(manifestsDir)).filter((p)=>p.endsWith(".json"))){
  let manifest;
  try{ manifest=JSON.parse(await readFile(file,"utf8")); }catch{ continue; }
  for(const object of manifest.objects||[]){
    const key=String(object.objectKey||object.object_key||object.apiName||object.api_name||"").trim();
    const table=String(object.sourceTable||object.source_table||object.table||"").trim();
    if(key) businessObjects.add(key);
    if(table) businessTables.add(table.replace(/^public\./,""));
  }
}

const sourceRoots=[
  join(root,"server","routes"),
  join(root,"server","services"),
  join(root,"server","jobs"),
  join(root,"src"),
];
const runtimeFiles=[];
for(const dir of sourceRoots){
  try{
    for(const file of await walk(dir)){
      if([".js",".mjs",".jsx",".ts",".tsx"].includes(extname(file))) runtimeFiles.push(file);
    }
  }catch{}
}

const allowedSqlPrefixes=[
  "platform_","identity_","security_","audit_","connector_","app_","package_","release_",
  "workflow_","notification_","report_","dashboard_","custom_report_","email_","account_action_"
];
const allowedExactTables=new Set([
  "companies","users","roles","permissions","role_permissions","user_roles","stores",
  "company_settings","server_settings","sessions","integrations"
]);
const violations=[];

function push(file,rule,detail,line){
  violations.push({file:relative(root,file).replaceAll("\\","/"),rule,detail,line});
}
function lineOf(text,index){ return text.slice(0,index).split("\n").length; }
function isPlatformInfraTable(table){
  return allowedExactTables.has(table)||allowedSqlPrefixes.some((prefix)=>table.startsWith(prefix));
}

for(const file of runtimeFiles){
  const rel=relative(root,file).replaceAll("\\","/");
  if(rel.startsWith("server/src/marketing/")||rel.startsWith("src/marketing/")) continue;
  const text=await readFile(file,"utf8");

  for(const match of text.matchAll(/\bINSERT\s+INTO\s+(?:public\.)?["']?([a-zA-Z_][a-zA-Z0-9_]*)/gi)){
    const table=match[1];
    if(businessTables.has(table) && !isPlatformInfraTable(table)) push(file,"business-direct-sql","INSERT INTO "+table,lineOf(text,match.index));
  }
  for(const match of text.matchAll(/\bUPDATE\s+(?:public\.)?["']?([a-zA-Z_][a-zA-Z0-9_]*)\s+SET\b/gi)){
    const table=match[1];
    if(businessTables.has(table) && !isPlatformInfraTable(table)) push(file,"business-direct-sql","UPDATE "+table,lineOf(text,match.index));
  }
  for(const match of text.matchAll(/\bDELETE\s+FROM\s+(?:public\.)?["']?([a-zA-Z_][a-zA-Z0-9_]*)/gi)){
    const table=match[1];
    if(businessTables.has(table) && !isPlatformInfraTable(table)) push(file,"business-direct-sql","DELETE FROM "+table,lineOf(text,match.index));
  }

  for(const match of text.matchAll(/\b(?:call_function|CALL_FUNCTION)\b/g)){
    push(file,"legacy-function-execution",match[0],lineOf(text,match.index));
  }

  if(rel.startsWith("src/")){
    for(const key of businessObjects){
      for(const token of ["/api/platform/objects/"+key,"/api/platform/runtime/objects/"+key]){
        let index=text.indexOf(token);
        while(index!==-1){
          push(file,"ui-business-object-wiring",token,lineOf(text,index));
          index=text.indexOf(token,index+1);
        }
      }
      const objectLiteral=new RegExp("(?:objectKey|object_key)\\s*[:=]\\s*[\"']"+escapeRegex(key)+"[\"']","g");
      for(const match of text.matchAll(objectLiteral)){
        push(file,"ui-business-object-wiring",match[0],lineOf(text,match.index));
      }
    }
  }
}

const catalog=join(root,"server","services","systemWorkflowCatalog.js");
try{
  const text=await readFile(catalog,"utf8");
  for(const key of businessObjects){
    for(const probe of ["objectKey:\""+key+"\"","objectKey: \""+key+"\"","objectKey:'"+key+"'","objectKey: '"+key+"'"]){
      let index=text.indexOf(probe);
      while(index!==-1){
        push(catalog,"business-flow-in-code",probe,lineOf(text,index));
        index=text.indexOf(probe,index+1);
      }
    }
  }
}catch{}

const unique=[...new Map(violations.map((v)=>[v.file+":"+v.line+":"+v.rule+":"+v.detail,v])).values()]
  .sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);

if(unique.length){
  console.error("Metadata architecture audit failed: "+unique.length+" violation(s).\n");
  for(const v of unique) console.error(v.file+":"+v.line+" ["+v.rule+"] "+v.detail);
  process.exit(1);
}
console.log("Metadata architecture audit passed. Objects="+businessObjects.size+" tables="+businessTables.size+" runtimeFiles="+runtimeFiles.length+" violations=0");
