import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("generic server has no provider-specific Google auth runtime",async()=>{
 const source=await read("server/server.js");
 for(const token of ["/api/auth/google/","getGoogleConnectRuntime","createGoogleConnectRouter","GOOGLE_OAUTH_STATE_COOKIE"]) assert.equal(source.includes(token),false,token);
 assert.match(source,/createIdentityProviderLoginRouter/);
});

test("legacy business bootstrap is not executable",async()=>{
 const source=await read("server/database/init.js");
 assert.equal(source.includes("up: client => initializeLegacyDatabase(client)"),false);
});

test("architecture audit includes init and guards legacy bootstrap",async()=>{
 const source=await read("scripts/audit-metadata-architecture.mjs");
 const historical=source.slice(source.indexOf("const historicalMigrationFiles"),source.indexOf("const declarativeMetadataFiles"));
 assert.equal(historical.includes("server/database/init.js"),false);
 assert.match(source,/EXECUTABLE_LEGACY_BUSINESS_BOOTSTRAP/);
});
