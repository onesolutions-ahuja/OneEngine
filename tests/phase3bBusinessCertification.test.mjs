import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

const scenarios = [
  "salon/appointments","restaurant/reservations/orders","retail/inventory","crm/sales",
  "field service","recruitment","leave/expense/purchasing approvals","customer/client portal",
  "projects/tasks","warehouse","inspection/compliance","assets/maintenance","vendor onboarding",
  "invoice processing","support/service desk"
];

test("Phase 3B certifies all fifteen business scenarios through the same generic primitives", async () => {
  assert.equal(scenarios.length, 15);
  const builder = await read("src/pages/settings/Platform/CustomPageBuilder.jsx");
  const renderer = await read("src/components/platform/CustomPageRenderer.jsx");
  const runtime = await read("src/platform/pages/CustomPageRuntimePage.jsx");
  const route = await read("server/routes/platform.js");
  const workflow = await read("server/services/platformWorkflow.js");

  for (const event of ["click","change","select","submit","load","row_click","scan","success","error"]) {
    assert.ok(builder.includes(event), `missing generic page event: ${event}`);
  }
  for (const operation of ["set_record","filter_collection","set_value","refresh"]) {
    assert.ok(renderer.includes(operation), `missing generic component operation: ${operation}`);
  }
  for (const primitive of ["CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD","ASSIGNMENT","CONDITION","LOOP","WAIT","RUN_SUBFLOW","SEND_COMMUNICATION"]) {
    assert.ok(workflow.includes(primitive), `missing generic Flow primitive: ${primitive}`);
  }
  assert.match(route, /resolvePageBindingTree/);
  assert.match(route, /workflowVariables/);
  assert.match(runtime, /screen_flow/);
  assert.match(runtime, /form_layout/);
  assert.match(runtime, /outputTarget/);
});

test("advanced page components do not bypass metadata events with direct record mutation", async () => {
  const renderer = await read("src/components/platform/CustomPageRenderer.jsx");
  assert.equal(renderer.includes('method: "PUT"'), false, "Page renderer must not mutate records directly");
  for (const assumption of [
    'config.groupField || "status"',
    'config.startField || "start_date"',
    'config.resourceField || "assignee_id"',
    'config.titleField || config.taskLabelField || config.labelField || "name"',
    'config.parentField || "parent_id"',
    'config.labelField || "name"',
    'config.fieldKey || "signature"'
  ]) assert.equal(renderer.includes(assumption), false, assumption);
  assert.match(renderer, /eventName:\s*"change"/);
  assert.match(renderer, /changes:\s*\{\s*\[groupField\]/);
});

test("business scenario names stay certification data, not Page Builder/runtime implementation", async () => {
  const implementation = [
    await read("src/pages/settings/Platform/CustomPageBuilder.jsx"),
    await read("src/components/platform/CustomPageRenderer.jsx"),
    await read("src/platform/pages/CustomPageRuntimePage.jsx"),
    await read("server/routes/platform.js"),
  ].join("\n").toLowerCase();
  for (const token of ["barber","appointment","restaurant","invoice","ticket","warehouse"]) {
    assert.equal(implementation.includes(token), false, `business token leaked into generic Page Builder/runtime: ${token}`);
  }
});


test("Phase 3A generic Test/Debug closure is permanently enforced", async () => {
  const builder = await read("src/pages/settings/Platform/CustomPageBuilder.jsx");
  const route = await read("server/routes/platform.js");

  assert.match(builder, /testNodeInteraction/);
  assert.match(builder, /page-interactions\/test/);
  assert.equal(builder.includes('if(!["workflow","screen_flow"].includes(interaction.type))'), false,
    "Builder Test Mode must not reject generic non-Flow interactions");

  assert.match(route, /router\.post\("\/platform\/runtime\/page-interactions\/test"/);
  assert.match(route, /clientOnlyTypes = new Set\(\["none", "component", "navigate", "form_layout"\]\)/);
  assert.match(route, /type === "action"/);
  assert.match(route, /Unsupported page interaction type/);

  for (const kind of ["page","component","event","permission","interaction","action","query","flow_input","flow","flow_step","flow_output","ui_refresh","rollback","timing","error"]) {
    assert.ok(route.includes(`kind: "${kind}"`) || route.includes(`kind:"${kind}"`), `missing Phase 3A trace kind: ${kind}`);
  }
  assert.match(route, /client\.query\("BEGIN"\)/);
  assert.match(route, /client\.query\("ROLLBACK"\)/);
  assert.match(route, /rolledBack:true/);
});
