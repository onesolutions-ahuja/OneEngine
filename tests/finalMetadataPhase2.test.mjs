import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const serverRegistry=fs.readFileSync("server/services/platformComponentRegistry.js","utf8");
const implementations=fs.readFileSync("src/components/metadata/componentImplementations.js","utf8");
const renderer=fs.readFileSync("src/components/platform/CustomPageRenderer.jsx","utf8");

test("phase 2 stable APIs are explicit",()=>{
  for(const key of ["container","table","button","timeline","kanban","scheduler","hierarchy_viewer","process_path","related_list","field_value","kpi","bar_chart","line_chart","pie_chart","donut_chart","analytics_table"]){
    assert.equal(serverRegistry.includes('key: "'+key+'", api: "'+key+'.v1", version: 1'),true,key);
  }
});
test("phase 2 advanced implementations are registered",()=>{
  for(const api of ["timeline.v1","kanban.v1","scheduler.v1","hierarchy_viewer.v1"]) assert.equal(implementations.includes('"'+api+'"'),true,api);
});
test("phase 2 renderer prefers versioned implementations",()=>{
  assert.equal(renderer.includes("componentImplementation(api)"),true);
  assert.equal(renderer.indexOf("const VersionedComponent = componentImplementation(api)") < renderer.indexOf("ADVANCED_RECORD_COMPONENTS.includes(key)"),true);
});
