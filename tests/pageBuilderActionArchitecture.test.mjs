import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const builder=fs.readFileSync("src/pages/settings/Platform/CustomPageBuilder.jsx","utf8");
const picker=fs.readFileSync("src/pages/settings/Platform/ActionWorkflowPicker.jsx","utf8");
const runtime=fs.readFileSync("src/platform/pages/CustomPageRuntimePage.jsx","utf8");
test("builder has no provider/business action wiring",()=>assert.equal(/uber|deliveroo|shopify|quickbooks|sales\.total|createCustomer/i.test(builder),false));
test("action picker stores generic stable references",()=>{assert.match(picker,/workflowUuid/);assert.match(picker,/actionKey/);assert.match(picker,/navigationTarget/);assert.match(picker,/formLayoutId/);});
test("runtime executes workflow/action via one generic endpoint",()=>{assert.match(runtime,/page-interactions\/execute/);assert.equal(/actionKey === ["'][A-Z_]+["']/.test(runtime),false);});
test("component creation block has no component-specific defaults",()=>{const s=builder.indexOf("const newNodeFor"),e=builder.indexOf("const dropIntoSection",s),b=builder.slice(s,e);assert.equal(/statusField|titleField|allowDragDrop|latitudeField|relationshipKey/.test(b),false);});
