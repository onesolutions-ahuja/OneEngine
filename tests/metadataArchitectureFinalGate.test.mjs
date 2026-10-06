import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const serverRegistry=fs.readFileSync("server/services/platformComponentRegistry.js","utf8");
const clientRegistry=fs.readFileSync("src/pages/settings/Platform/componentRegistry.js","utf8");
const picker=fs.readFileSync("src/pages/settings/Platform/ActionWorkflowPicker.jsx","utf8");
test("generic component registries contain no business datasource defaults",()=>{
 for(const source of [serverRegistry,clientRegistry]) assert.equal(source.includes('dataSource: "sales"'),false);
});
test("page builder creates an empty editable workflow shell",()=>{
 assert.match(picker,/actions: \[\]/);
 assert.equal(picker.includes("SHOW_MESSAGE"),false);
 assert.equal(picker.includes("First step (optional)"),false);
});
