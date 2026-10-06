import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const read=(p)=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("Phase 1 has no legacy CALL_FUNCTION runtime path", async()=>{
  for(const path of [
    "server/services/platformWorkflow.js",
    "server/services/systemWorkflowCatalog.js",
    "server/services/systemWorkflowRuntime.js",
    "server/services/packageRegistry.js",
    "server/services/platformMetadata.js",
    "server/metadata/manifests/retail_pos.json"
  ]){
    const source=await read(path);
    assert.equal(source.includes("CALL_FUNCTION"),false,path+" still exposes CALL_FUNCTION");
  }
});

test("Phase 1 package compatibility functions stay empty", async()=>{
  for(const path of ["server/packages/purchasing_core/functions.js","server/packages/finance_core/functions.js"]){
    const source=await read(path);
    assert.match(source,/packageFunctions = \[\]/,path+" must contain no business runtime functions");
  }
});

test("Phase 1 business compatibility functions stay removed", async()=>{
  const source=await read("server/services/platformFunctionRegistry.js");
  for(const key of [
    "account.lifecycle.token.issue",
    "account.registration.token.issue",
    "receipt.temporary_link.create",
    "receipt.temporary_link.revoke",
    "temporary.receipt.download.create",
    "temporary.receipt.download.revoke_for_sale"
  ]) assert.equal(source.includes(key),false,key);
});

test("Phase 1 uses generic security primitives", async()=>{
  const workflow=await read("server/services/platformWorkflow.js");
  assert.match(workflow,/key: "ACCOUNT_TOKEN_ISSUE"/);
  assert.match(workflow,/key: "SECURE_RESOURCE_LINK_MANAGE"/);
  const packages=await read("server/services/packageRegistry.js");
  assert.match(packages,/key:"ACCOUNT_TOKEN_ISSUE"/);
});

test("Phase 1 payment-attempt runtime is provider neutral", async()=>{
  await access(new URL("../server/services/paymentAttempts.js",import.meta.url));
  await assert.rejects(access(new URL("../server/services/paypalPaymentAttempts.js",import.meta.url)));
  const source=await read("server/services/paymentAttempts.js");
  assert.equal(source.includes("createPaypalPaymentAttempt"),false);
  assert.equal(source.includes('|| "paypal_qr"'),false);
});

test("Phase 1 business writes are Flow-owned in retired route surfaces", async()=>{
  for(const path of ["server/server.js"]){
    const source=await read(path);
    for(const token of ["routes/sales.js","routes/customers.js","routes/till.js","routes/whatsapp.js"]){
      assert.equal(source.includes(token),false,token);
    }
  }
});
