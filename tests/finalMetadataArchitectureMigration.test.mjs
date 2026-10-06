import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(p)=>readFile(resolve(root,p),"utf8");
const exists=async(p)=>{try{await access(resolve(root,p));return true}catch{return false}};

test("final migration manifests own migrated business domains",async()=>{
 for(const name of ["retail_pos","purchasing_core","products","inventory","batch_expiry","customers","customer_credit","loyalty","gift_cards","online_orders","uber_eats"]){
  const raw=await read(`server/metadata/manifests/${name}.json`); const m=JSON.parse(raw); assert.ok(Array.isArray(m.objects)||Array.isArray(m.workflows),name);
 }
});

test("legacy business route and service files stay deleted",async()=>{
 for(const p of ["server/routes/sales.js","server/routes/till.js","server/routes/customers.js","server/routes/whatsapp.js","server/routes/shopifyWebhooks.js","server/services/shopifyAdapter.js","server/services/inventory.js","server/services/inventoryPlatform.js","server/services/paymentTender.js","server/src/services/salesReturn.js","server/services/whatsappAssistantAi.js"]) assert.equal(await exists(p),false,p);
});

test("package registry does not regain migrated inline business ownership",async()=>{
 const s=await read("server/services/packageRegistry.js");
 for(const key of ["products","batch_expiry","customer_credit","customers","loyalty","uber_eats"]) assert.equal(s.includes(`entry.key === "${key}"`),false,key);
});

test("server does not inject removed business executors",async()=>{
 const s=await read("server/server.js");
 for(const token of ["createInventoryMovement","paymentTender","salesReturn","shopifyAdapter","whatsappAssistantAi"]) assert.equal(s.includes(token),false,token);
});
