import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tree = fs.readFileSync("src/pages/settings/Platform/customPageTree.js","utf8");
const renderer = fs.readFileSync("src/components/platform/CustomPageRenderer.jsx","utf8");
const runtime = fs.readFileSync("src/platform/pages/CustomPageRuntimePage.jsx","utf8");

test("generic page tree preserves canonical componentApi",()=>{
  assert.match(tree,/componentApi:/);
  assert.match(tree,/\.v1/);
});
test("renderer treats componentApi as authoritative",()=>{
  assert.match(renderer,/canonicalComponentApi\(node\.componentApi \|\| node\.componentKey\)/);
});
test("custom page runtime uses shared renderer and generic interaction endpoint",()=>{
  assert.match(runtime,/CustomPageRenderer/);
  assert.match(runtime,/\/api\/platform\/runtime\/page-interactions\/execute/);
  assert.equal(/sales|purchase|supplier|customer/i.test(runtime),false);
});
