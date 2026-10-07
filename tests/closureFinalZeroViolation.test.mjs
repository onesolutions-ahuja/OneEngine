import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
const root=(p)=>new URL("../"+p,import.meta.url);
const absent=async(p)=>assert.rejects(access(root(p)),/ENOENT/);

test("provider-specific executable drivers are retired",async()=>{
 for(const p of ["server/services/smsGateConnector.js","server/services/emailProviderConnectors.js","server/services/referencePaymentConnector.js","server/routes/googleConnect.js","server/services/googleConnect.js"]) await absent(p);
 const manifest=await readFile(root("server/packages/packageManifestCatalog.js"),"utf8");
 for(const token of ["createSmsGateDriver","createBrevoDriver","createMailjetDriver","createReferencePaymentDriver"]) assert.equal(manifest.includes(token),false,token);
});

test("dock catalogue is supplied by metadata only",async()=>{
 const dock=await readFile(root("src/shell/dock/RdvnReferenceDock.jsx"),"utf8");
 const app=await readFile(root("src/App.jsx"),"utf8");
 assert.equal(dock.includes("defaultDockItems"),false);
 assert.equal(/OneTill|onetill|id: 'till'/.test(dock),false);
 assert.match(app,/items=\{storeApps\.filter/);
});

test("legacy business bootstrap and duplicate provider auth stay absent",async()=>{
 const init=await readFile(root("server/database/init.js"),"utf8");
 const server=await readFile(root("server/server.js"),"utf8");
 assert.equal(init.includes("initializeLegacyDatabase"),false);
 for(const token of ["getGoogleConnectRuntime","createGoogleConnectRouter","/api/auth/google/"]) assert.equal(server.includes(token),false,token);
});
