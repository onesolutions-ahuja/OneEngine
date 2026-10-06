import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root=new URL("../",import.meta.url);
const read=(p)=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("business metadata ownership is manifest based",async()=>{
 const registry=await read("server/services/packageRegistry.js");
 for(const key of ["products","batch_expiry","customer_credit","customers","loyalty","online_orders","uber_eats"]){
   assert.equal(registry.includes(`entry.key === "${key}"`),false,key+" must not be inline package business metadata");
 }
});

test("deleted legacy business engines stay deleted from server wiring",async()=>{
 const server=await read("server/server.js");
 for(const token of ["createInventoryMovement","services/inventory.js","routes/sales.js","routes/customers.js","routes/till.js","routes/whatsapp.js","quickbooksAdapter","shopifyAdapter"]){
   assert.equal(server.includes(token),false,token);
 }
});

test("phase manifests exist for migrated business domains",async()=>{
 const dir=new URL("../server/metadata/manifests/",import.meta.url);
 const names=new Set(await readdir(dir));
 for(const name of ["purchasing_core.json","finance_core.json","products.json","inventory.json","batch_expiry.json","customers.json","customer_credit.json","loyalty.json","gift_cards.json","online_orders.json","uber_eats.json"]){
   assert.ok(names.has(name),name);
 }
});

test("migrated write-owned objects are Flow write only",async()=>{
 for(const name of ["products.json","inventory.json","batch_expiry.json","customers.json","customer_credit.json","loyalty.json","gift_cards.json","online_orders.json"]){
   const m=JSON.parse(await read("server/metadata/manifests/"+name));
   for(const o of m.objects||[]) assert.equal(o.config?.flowWritesOnly,true,name+":"+o.objectKey);
 }
});
