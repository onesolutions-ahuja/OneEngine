import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Phase 6 generic Flow runtime contains no provider-specific communication actions", async () => {
 const workflow=await readFile(new URL("../server/services/platformWorkflow.js",import.meta.url),"utf8");
 for(const key of ["SEND_EMAIL_BREVO","SEND_EMAIL_MAILJET",'key: "SEND_WHATSAPP"']) assert.equal(workflow.includes(key),false,key);
 assert.ok(workflow.includes('key: "SEND_COMMUNICATION"'));
 assert.match(workflow, /oneHttpRequestDefinition\(\)/);
});

test("Phase 6 server does not register hardcoded Dojo SumUp Square business drivers", async () => {
 const server=await readFile(new URL("../server/server.js",import.meta.url),"utf8");
 assert.equal(server.includes("oneConnectProviders"),false);
 assert.equal(server.includes("createOneConnectProviderDriver"),false);
});

test("Phase 6 provider-specific payment executor stays deleted", async () => {
 const tree=await readFile(new URL("../server/server.js",import.meta.url),"utf8");
 assert.equal(tree.includes("./services/oneConnectProviders.js"),false);
});
