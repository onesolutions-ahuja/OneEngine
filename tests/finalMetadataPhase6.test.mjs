import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
test("phase 6 executable business metadata catalogues are deleted",()=>{
 for(const p of ["server/services/systemWorkflowCatalog.js","server/packages/runtimeFlowManifests.js","server/packages/packageManifestCatalog.js","server/packages/oneAssistantManifest.js"])assert.equal(fs.existsSync(p),false,p);
});
test("phase 6 system workflow runtime reads persistent platform_rules only",()=>{
 const s=read("server/services/systemWorkflowRuntime.js");
 assert.equal(s.includes("ensureSystemWorkflowCatalog"),false);
 assert.match(s,/FROM platform_rules/);
});
test("phase 6 package runtime never reconstructs business packages from JS",()=>{
 const s=read("server/services/packageRegistry.js");
 assert.equal(s.includes("packageManifestCatalog"),false);
 assert.equal(s.includes("uberEatsWorkflowDefinitions"),false);
 assert.equal(s.includes("oneAssistantManifest"),false);
 assert.match(s,/export function packageDefinitions\(\)\{ return \[\]; \}/);
 assert.match(s,/Persistent package_registry rows/);
});
test("phase 6 settings and integration fields have no hardcoded business catalogue",()=>{
 const settings=read("server/services/settingsNavigationCatalog.js");
 assert.match(settings,/platform_navigation_metadata/);
 for(const token of ["Uber Eats","Deliveroo","WhatsApp Assistant","Customer Loyalty"])assert.equal(settings.includes(token),false,token);
 const fields=read("src/services/integrationFieldCatalogue.js");
 for(const token of ["sales.total","purchase.supplier","return.refund_total"])assert.equal(fields.includes(token),false,token);
});
test("phase 6 no deleted catalogue imports remain in runtime",()=>{
 const roots=["server","src"];
 const deleted=["systemWorkflowCatalog.js","runtimeFlowManifests.js","packageManifestCatalog.js","oneAssistantManifest.js"];
 for(const root of roots){for(const p of walk(root)){if(!/\.(js|mjs|jsx)$/.test(p))continue;const s=read(p);for(const d of deleted)assert.equal(s.includes(d),false,`${p} -> ${d}`);}}
});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
