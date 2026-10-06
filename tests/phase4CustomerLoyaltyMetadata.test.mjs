import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const readJson=async n=>JSON.parse(await readFile(new URL(`../server/metadata/manifests/${n}.json`,import.meta.url),"utf8"));
test("Phase 4 customer loyalty credit and gift card ownership is metadata driven",async()=>{
 const [customers,credit,loyalty,gift]=await Promise.all(["customers","customer_credit","loyalty","gift_cards"].map(readJson));
 for(const m of [customers,credit,loyalty,gift]) for(const o of m.objects) assert.equal(o.config?.flowWritesOnly,true,o.objectKey);
 assert.deepEqual(customers.objects.map(x=>x.objectKey).sort(),["address","contact","customer"]);
 assert.ok(credit.objects.some(x=>x.objectKey==="customer_credit_ledger"));
 assert.ok(loyalty.objects.some(x=>x.objectKey==="loyalty_activity"));
 assert.ok(gift.objects.some(x=>x.objectKey==="gift_card"));
});
test("Phase 4 registry contains no inline customer loyalty credit business metadata",async()=>{
 const s=await readFile(new URL("../server/services/packageRegistry.js",import.meta.url),"utf8");
 for(const k of ["customer_credit","customers","loyalty"]) assert.equal(s.includes(`entry.key === "${k}"`),false,k);
});
test("Phase 4 actions use generic relationship or Flow primitives",async()=>{
 const [customers,credit,loyalty]=await Promise.all(["customers","customer_credit","loyalty"].map(readJson));
 assert.ok(customers.actions.every(a=>a.handlerKey==="CREATE_RELATED_RECORD"));
 assert.equal(credit.actions[0].handlerKey,"RUN_SUBFLOW");
 assert.equal(loyalty.actions[0].handlerKey,"RUN_SUBFLOW");
 assert.ok(credit.workflows[0].action.actions.every(a=>["CREATE_RECORD"].includes(a.key)));
 assert.ok(loyalty.workflows[0].action.actions.every(a=>["GET_RECORDS","CREATE_RECORD","UPDATE_RECORD"].includes(a.key)));
});
test("Phase 4 has no customer-specific loyalty executor",async()=>{
 const files=["../server/services/platformFunctionRegistry.js","../server/services/platformWorkflow.js","../server/services/systemWorkflowCatalog.js"];
 for(const p of files){const s=await readFile(new URL(p,import.meta.url),"utf8");for(const k of ["CUSTOMER_LOYALTY_ADJUST","CUSTOMER_CREDIT_POST"]) assert.equal(s.includes(k),false,p+" "+k);}
});
