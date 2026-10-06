import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const builder=fs.readFileSync("src/pages/settings/Platform/CustomPageBuilder.jsx","utf8");
const registry=fs.readFileSync("server/services/platformComponentRegistry.js","utf8");
const props=fs.readFileSync("src/pages/settings/Platform/MetadataComponentProperties.jsx","utf8");

test("Page Builder creates components from registry metadata",()=>{
 const start=builder.indexOf("const newNodeFor");
 const end=builder.indexOf("const dropIntoSection",start);
 const block=builder.slice(start,end);
 assert.match(block,/createRegisteredComponent\(meta, "PAGE"\)/);
 assert.equal(/componentKey === "table"|componentKey === "button"|componentKey === "container"|kanban|calendar/.test(block),false);
});
test("registry owns simple component defaults and property schemas",()=>{
 assert.match(registry,/configurable: \[\{ key: "columns"/);
 assert.match(registry,/defaults: \{ label: "Button"/);
 assert.match(registry,/interactions: true/);
});
test("metadata property editor is schema driven and business agnostic",()=>{
 assert.match(props,/metadata\?\.configurable/);
 assert.equal(/sales|purchase|supplier|customer|product/i.test(props),false);
});
test("builder action configuration stays generic",()=>{
 assert.match(builder,/ActionWorkflowPicker/);
 assert.equal(/uber|deliveroo|shopify|quickbooks/i.test(builder),false);
});
