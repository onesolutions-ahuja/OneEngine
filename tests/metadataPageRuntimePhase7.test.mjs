import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const app=fs.readFileSync("src/App.jsx","utf8");
const runtime=fs.readFileSync("src/platform/pages/MetadataPageRuntime.jsx","utf8");
const custom=fs.readFileSync("src/platform/pages/CustomPageRuntimePage.jsx","utf8");
const workspace=fs.readFileSync("src/platform/workspace/WorkspacePage.jsx","utf8");

test("phase 7 app routes enter one metadata page runtime boundary",()=>{
 assert.match(app,/MetadataPageRuntime/);
 assert.equal(app.includes("<WorkspacePage"),false);
 assert.equal(app.includes("<CustomPageRuntimePage"),false);
 assert.equal(app.includes("import('./platform\/workspace\/WorkspacePage')"),false);
 assert.equal(app.includes("import('./platform\/pages\/CustomPageRuntimePage')"),false);
});
test("phase 7 runtime selects only generic metadata renderers by stable identity",()=>{
 assert.match(runtime,/if \(pageKey\)/);
 assert.match(runtime,/if \(objectKey\)/);
 for(const forbidden of ["sale","customer","supplier","purchase","till","kiosk","uber"]) assert.equal(runtime.includes(forbidden),false,forbidden);
});
test("phase 7 internal renderers remain metadata consumers",()=>{
 assert.match(custom,/CustomPageRenderer/);
 assert.match(custom,/runtime\/pages/);
 assert.match(workspace,/runtime\/objects\/\$\{encodeURIComponent\(key\)\}\/workspace/);
});
