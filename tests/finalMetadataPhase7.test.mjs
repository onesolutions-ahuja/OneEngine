import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(p,"utf8");
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);

test("phase 7 legacy business pages are deleted",()=>{
 for(const p of ["src/pages/till/TillPage.jsx","src/pages/kiosk/OneKioskPage.jsx","src/pages/dashboard/DashboardPage.jsx","src/pages/settings/DeliverySettingsPage.jsx","src/pages/settings/StoreTillSettingsPage.jsx","src/pages/settings/MetadataSettingsPage.jsx"])assert.equal(fs.existsSync(p),false,p);
});
test("phase 7 active runtime cannot import deleted legacy pages",()=>{
 for(const p of walk("src").filter(p=>/\.(js|jsx)$/.test(p))){const s=read(p);for(const token of ["TillPage","OneKioskPage","DashboardPage","DeliverySettingsPage","StoreTillSettingsPage","MetadataSettingsPage"])assert.equal(s.includes(token),false,`${p}: ${token}`);}
});
test("phase 7 OneEngine Manager uses generic metadata settings runtime",()=>{
 const s=read("src/pages/developer/OneEngineManager.jsx");
 assert.match(s,/MetadataSettingsSection/);
 assert.equal(s.includes("StoreTillSettingsPage"),false);
 assert.equal(s.includes("DeliverySettingsPage"),false);
});
test("phase 7 deleted executable metadata catalogues stay absent",()=>{
 for(const p of ["server/services/systemWorkflowCatalog.js","server/packages/runtimeFlowManifests.js","server/packages/packageManifestCatalog.js","server/packages/oneAssistantManifest.js"])assert.equal(fs.existsSync(p),false,p);
});
test("phase 7 package registry contains no business catalogue",()=>{
 const s=read("server/services/packageRegistry.js");
 for(const token of ["uber_eats","OneAssistant","Purchase Create","Supplier Return","hospitality"])assert.equal(s.includes(token),false,token);
});
