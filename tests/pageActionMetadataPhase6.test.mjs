import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const runtime=fs.readFileSync("server/routes/platform.js","utf8");
const picker=fs.readFileSync("src/pages/settings/Platform/ActionWorkflowPicker.jsx","utf8");
const page=fs.readFileSync("src/platform/pages/CustomPageRuntimePage.jsx","utf8");
const button=fs.readFileSync("src/components/metadata/button/ButtonV1.jsx","utf8");
const renderer=fs.readFileSync("src/components/platform/CustomPageRenderer.jsx","utf8");

test("phase 6 page actions resolve core and object-scoped metadata actions through one registry contract",()=>{
 assert.match(runtime,/platform_registered_actions WHERE action_key=\$1 AND object_id=\$2/);
 assert.match(runtime,/handlerKey = action\?\.handler_key/);
 assert.match(runtime,/getWorkflowActionDefinition\(handlerKey\)/);
 assert.match(runtime,/executeSystemWorkflow/);
});
test("phase 6 page action picker exposes metadata actions without hardcoded business actions",()=>{
 assert.match(picker,/\/registered-actions/);
 assert.match(picker,/item\.action_key/);
 assert.match(picker,/api\/platform\/action-registry/);
});
test("phase 6 clickable metadata components dispatch references instead of business handlers",()=>{
 assert.match(page,/page-interactions\/execute/);
 assert.match(button,/onClick\?\.\(node\)/);
 for(const source of [button,renderer]) for(const forbidden of ["createCustomer","purchase_create","supplier_return","sales.total","uber_eats"]) assert.equal(source.includes(forbidden),false,forbidden);
});
test("phase 6 workflow references remain stable UUID metadata",()=>{
 assert.match(picker,/workflowUuid/);
 assert.match(runtime,/Configured workflow not found/);
});
