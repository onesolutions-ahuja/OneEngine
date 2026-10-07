import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Page Test exposes the complete generic debug chain and always rolls back",async()=>{
 const route=await read("server/routes/platform.js");
 for(const kind of ["page","query","component","event","permission","flow_input","flow","flow_step","flow_output","ui_refresh","rollback","timing"]){
   assert.ok(route.includes(`kind:"${kind}"`)||route.includes(`kind: "${kind}"`),`missing trace kind ${kind}`);
 }
 assert.match(route,/client\.query\("BEGIN"\)/);
 assert.match(route,/client\.query\("ROLLBACK"\)/);
 assert.match(route,/rolledBack:true/);
 assert.match(route,/durationMs/);
 assert.match(route,/resolvePageBindingTree/);
 assert.match(route,/workflowVariables:variables/);
 assert.match(route,/component_operation/);
 assert.match(route,/set_record/);
 assert.match(route,/filter_collection/);
 assert.match(route,/set_value/);
 assert.match(route,/refresh/);
 assert.equal(route.includes("Page Test rollback currently executes Flow-backed interactions only"),false);
});

test("Page Builder surfaces rollback Test results instead of persisting test changes",async()=>{
 const builder=await read("src/pages/settings/Platform/CustomPageBuilder.jsx");
 assert.match(builder,/page-interactions\/test/);
 assert.match(builder,/Database changes rolled back/);
 assert.match(builder,/setTestTrace/);
 assert.equal(builder.includes("Select a component with a Flow-backed event to run rollback Test."),false);
 assert.match(builder,/node\?\.interactions\?\.\[eventName\]/);
});
