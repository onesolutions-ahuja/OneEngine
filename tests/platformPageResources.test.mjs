import test from "node:test";
import assert from "node:assert/strict";
import { normalizePageResource, resolvePageResource, resolvePageBindingTree } from "../server/services/platformPageResources.js";
import { pageResourceOptions } from "../src/pages/settings/Platform/pageResources.js";

test("page resources resolve generic runtime contexts",()=>{
  const context={
    currentUser:{id:"u1",role:"kiosk_guest"},
    currentRecord:{id:"r1",status:"OPEN"},
    pageParameters:{store:"s1"},
    pageVariables:{quantity:2},
    components:{product:{value:"p1",selectedRecord:{id:"p1",price:12}}},
    flowOutputs:{checkout:{orderId:"o1"}},
  };
  assert.equal(resolvePageResource({type:"current_user",field:"role"},context),"kiosk_guest");
  assert.equal(resolvePageResource({type:"current_record",field:"status"},context),"OPEN");
  assert.equal(resolvePageResource({type:"page_parameter",key:"store"},context),"s1");
  assert.equal(resolvePageResource({type:"page_variable",key:"quantity"},context),2);
  assert.equal(resolvePageResource({type:"component_value",key:"product"},context),"p1");
  assert.equal(resolvePageResource({type:"selected_record",key:"product",field:"price"},context),12);
  assert.equal(resolvePageResource({type:"flow_output",key:"checkout",field:"orderId"},context),"o1");
  assert.equal(resolvePageResource({type:"constant",value:true},context),true);
});

test("page resource validation rejects executable or malformed paths",()=>{
  assert.throws(()=>normalizePageResource({type:"page_variable",key:"bad-key"}),/valid key/);
  assert.throws(()=>normalizePageResource({type:"current_record",field:"x[0]"}),/field path/);
  assert.throws(()=>normalizePageResource({type:"javascript",value:"alert(1)"}),/Unsupported/);
});

test("binding tree resolves nested metadata without business wiring",()=>{
  const result=resolvePageBindingTree({record:{type:"selected_record",key:"row",field:"id"},count:{type:"page_variable",key:"count"}},{
    components:{row:{selectedRecord:{id:"abc"}}},pageVariables:{count:3}
  });
  assert.deepEqual(result,{record:"abc",count:3});
});


test("pageResourceOptions exposes defined page resources and component runtime resources", () => {
  const options = pageResourceOptions({ definitions: { parameters: [{ key: "recordId", label: "Record" }], variables: [{ key: "search", label: "Search" }] }, components: [{ id: "table_1", label: "Orders" }] });
  assert.ok(options.some((item) => item.type === "page_parameter" && item.key === "recordId"));
  assert.ok(options.some((item) => item.type === "page_variable" && item.key === "search"));
  assert.ok(options.some((item) => item.type === "component_value" && item.key === "table_1"));
  assert.ok(options.some((item) => item.type === "selected_record" && item.key === "table_1"));
  assert.ok(options.some((item) => item.type === "flow_output" && item.key === "table_1"));
});
