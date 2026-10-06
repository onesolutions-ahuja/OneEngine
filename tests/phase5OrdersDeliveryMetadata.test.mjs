import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=(p)=>readFile(new URL(p,root),"utf8");
test("Phase 5 Online Orders metadata is manifest-owned and Flow-write-only",async()=>{
 const m=JSON.parse(await read("server/metadata/manifests/online_orders.json"));
 assert.deepEqual(m.objects.map(x=>x.objectKey).sort(),["online_order","online_order_line"]);
 for(const o of m.objects) assert.equal(o.config?.flowWritesOnly,true,o.objectKey);
 assert.ok(m.workflows.some(x=>x.apiName==="ONLINE_ORDER_TRANSITION"));
 assert.ok(m.actions.every(x=>x.handlerKey==="RUN_SUBFLOW"));
});
test("Phase 5 Online Orders is not inline in package registry",async()=>{
 const s=await read("server/services/packageRegistry.js");
 assert.equal(s.includes('entry.key === "online_orders"'),false);
 assert.equal(/INSERT INTO online_orders|UPDATE online_orders|DELETE FROM online_orders/.test(s),false);
});
test("Phase 5 UI executes Online Order buttons through generic metadata runtime",async()=>{
 const s=await read("src/pages/online/useOnlineOrderActions.js");
 assert.match(s,/api\/platform\/runtime\/objects\/online_order\/buttons/);
 assert.equal(s.includes("/api/online/orders/"),false);
});
test("Phase 5 legacy Online Orders provider lifecycle services stay deleted",async()=>{
 for(const p of ["server/services/onlineOrders/index.js","server/services/onlineOrders/genericOrderTypes.js","server/services/onlineOrders/platformServiceBase.js","server/services/onlineOrders/uber.js","server/services/onlineOrders/deliveroo.js","server/services/onlineOrders/uberClient.js","server/services/onlineOrders/uberMenuMapping.js"]){
  await assert.rejects(access(new URL(p,root)));
 }
});
