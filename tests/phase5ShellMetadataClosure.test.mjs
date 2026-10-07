import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("application shell contains no provider-specific authentication wiring",async()=>{
 const source=await read("src/App.jsx");
 assert.equal(/Google/i.test(source),false);
 assert.equal(source.includes("consumeGoogleOAuthCallback"),false);
 assert.equal(source.includes("startGoogleLogin"),false);
});

test("brand icon components are metadata-asset renderers",async()=>{
 for(const path of ["src/components/BrandIcons.jsx","src/marketing/components/BrandIcons.jsx"]){
  const source=await read(path);
  for(const token of ["whatsapp","uber-eats","deliveroo","shopify","quickbooks","xero","sage"]) assert.equal(source.includes(token),false,token);
  assert.match(source,/src/);
 }
});

test("dock component accepts runtime item catalogues",async()=>{
 const source=await read("src/shell/dock/RdvnReferenceDock.jsx");
 assert.match(source,/items = defaultDockItems/);
 assert.match(source,/mobileItems = defaultMobileDockItems/);
 assert.match(source,/items\.map/);
 assert.match(source,/mobileItems\.map/);
});
